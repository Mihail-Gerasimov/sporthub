// Превращает доменную ошибку в HTTP-ответ.
// Раньше это делал каждый роут сам, сравнивая текст сообщения — пятнадцать мест
// с расползающейся логикой. Теперь код берётся из класса ошибки, а текст
// уходит наружу дословно.

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, HttpException, Logger } from '@nestjs/common';
import type { Response } from 'express';

import {
  DomainError,
  QuarantineError,
  TooManyRequestsError,
  ValidationError,
} from './domain-error';

/**
 * Ошибка соединения с базой, а не ошибка запроса.
 *
 * Коды взяты из справочника Prisma: не удалось открыть соединение, база не отвечает,
 * соединение оборвалось. Наружу такие ошибки не показываются вовсе — ни адреса,
 * ни порта, ни имени схемы: клиент видит только «база недоступна».
 */
const DATABASE_UNAVAILABLE_CODES = new Set(['P1000', 'P1001', 'P1002', 'P1008', 'P1017', 'P2024']);

function isDatabaseUnavailable(exception: unknown): boolean {
  if (typeof exception !== 'object' || exception === null) return false;

  const { code } = exception as { code?: unknown };

  if (typeof code === 'string' && DATABASE_UNAVAILABLE_CODES.has(code)) return true;

  // Драйвер PostgreSQL до кода Prisma не всегда доходит: если процесс базы остановлен,
  // соединение отбивается на уровне сети.
  const message = exception instanceof Error ? exception.message : '';

  return /ECONNREFUSED|ETIMEDOUT|Connection terminated|server closed the connection/i.test(message);
}

@Catch()
export class DomainErrorFilter implements ExceptionFilter {
  private readonly logger = new Logger(DomainErrorFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const response = host.switchToHttp().getResponse<Response>();

    if (exception instanceof QuarantineError) {
      // Форма ответа отличается от общей намеренно — см. комментарий к классу.
      response.status(exception.status).json({
        success: false,
        error: exception.message,
        until: exception.until,
        reason: exception.reason,
      });

      return;
    }

    if (exception instanceof ValidationError) {
      response.status(exception.status).json({
        success: false,
        error: exception.message,
        ...(exception.details ? { details: exception.details } : {}),
      });

      return;
    }

    if (exception instanceof TooManyRequestsError) {
      // Срок ожидания дублируется заголовком: текст читает человек, заголовок —
      // клиент, которому нужно решить, когда повторять. Тело при этом обычное.
      response.setHeader('Retry-After', String(exception.retryAfterSeconds));
      response.status(exception.status).json({ success: false, error: exception.message });

      return;
    }

    if (exception instanceof DomainError) {
      response.status(exception.status).json({ success: false, error: exception.message });

      return;
    }

    // Ошибки самого фреймворка (несуществующий маршрут, неверный метод)
    // сохраняют свой код — иначе всё превращается в 500.
    if (exception instanceof HttpException) {
      response.status(exception.getStatus()).json({ success: false, error: exception.message });

      return;
    }

    // Недоступная база — не «наша вина» в смысле дефекта, а состояние окружения,
    // и отвечать на неё пятисоткой неверно: мониторинг обязан отличать сломанный код
    // от лежащей базы, а фронт — показать «сервис временно недоступен», а не «что-то
    // пошло не так».
    //
    // ⚠️ Это единственный перевод ошибки базы, живущий в общем фильтре. Нарушения
    // уникальности переводятся в реализациях репозиториев: там один код обязан давать
    // три разных текста, и различить их можно только по контексту операции. Здесь
    // контекст не нужен — «база не отвечает» означает одно и то же везде.
    if (isDatabaseUnavailable(exception)) {
      this.logger.error(
        'База недоступна',
        exception instanceof Error ? exception.stack : exception,
      );
      response.status(503).json({ success: false, error: 'База данных недоступна' });

      return;
    }

    // Всё остальное — наша вина. Наружу общий текст, в лог — детали.
    this.logger.error(
      'Необработанная ошибка',
      exception instanceof Error ? exception.stack : exception,
    );
    response.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
  }
}
