// Превращает доменную ошибку в HTTP-ответ.
// Раньше это делал каждый роут сам, сравнивая текст сообщения — пятнадцать мест
// с расползающейся логикой. Теперь код берётся из класса ошибки, а текст
// уходит наружу дословно.

import type { ArgumentsHost, ExceptionFilter } from '@nestjs/common';
import { Catch, Logger } from '@nestjs/common';
import type { Response } from 'express';

import { DomainError, QuarantineError, ValidationError } from './domain-error';

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

    if (exception instanceof DomainError) {
      response.status(exception.status).json({ success: false, error: exception.message });

      return;
    }

    // Всё, что не доменная ошибка, — наша вина. Наружу общий текст, в лог — детали.
    this.logger.error('Необработанная ошибка', exception instanceof Error ? exception.stack : exception);
    response.status(500).json({ success: false, error: 'Внутренняя ошибка сервера' });
  }
}
