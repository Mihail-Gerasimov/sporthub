// Тесты общего каркаса. Это код, которого не было ни в одном тесте до Phase 32,
// и именно он определяет форму каждого из 54 ответов API. Проверяем все четыре
// формы успеха и все коды ошибок, включая четыре одноразовых.

import { describe, expect, it, vi } from 'vitest';
import { z } from 'zod';

import { EMPTY_RESULT, withTopLevel } from './api-response';
import { ApiResponseInterceptor } from './api-response.interceptor';
import { DomainErrorFilter } from './domain-error.filter';
import {
  ConflictError,
  ExternalServiceError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from './domain-error';

/** Мини-обвязка: прогоняет значение через интерцептор и отдаёт готовое тело. */
async function runInterceptor(result: unknown): Promise<unknown> {
  const interceptor = new ApiResponseInterceptor();
  const handler = { handle: () => ({ pipe: (op: never) => op }) };
  // Проще собрать поток вручную, чем тащить полноценный ExecutionContext.
  const { of } = await import('rxjs');
  const observable = interceptor.intercept(
    {} as never,
    {
      handle: () => of(result),
    } as never,
  );

  void handler;

  return new Promise((resolve) => {
    (observable as { subscribe: (fn: (value: unknown) => void) => void }).subscribe(resolve);
  });
}

/** Мини-обвязка вместо Express-ответа. */
function createResponseSpy() {
  const json = vi.fn();
  const status = vi.fn(() => ({ json }));

  return {
    host: {
      switchToHttp: () => ({ getResponse: () => ({ status }) }),
    } as never,
    status,
    json,
  };
}

describe('Каркас ответа', () => {
  it('обычный результат оборачивается в success и data', async () => {
    expect(await runInterceptor([{ id: 1 }])).toEqual({
      success: true,
      data: [{ id: 1 }],
    });
  });

  it('пустой результат отдаёт success без поля data', async () => {
    expect(await runInterceptor(EMPTY_RESULT)).toEqual({ success: true });
  });

  it('счётчики выдачи ложатся рядом с data, а не внутрь', async () => {
    const result = withTopLevel([{ id: 1 }], {
      total: 42,
      offset: 0,
      limit: 50,
    });

    expect(await runInterceptor(result)).toEqual({
      success: true,
      data: [{ id: 1 }],
      total: 42,
      offset: 0,
      limit: 50,
    });
  });

  it('счётчики уведомлений остаются внутри data', async () => {
    // Форма отличается от предыдущей намеренно — так было до переноса.
    const result = { items: [], total: 0, unreadCount: 0 };

    expect(await runInterceptor(result)).toEqual({
      success: true,
      data: { items: [], total: 0, unreadCount: 0 },
    });
  });
});

describe('Каркас ошибок', () => {
  const cases = [
    {
      error: new NotFoundError('Клуб не найден'),
      status: 404,
      text: 'Клуб не найден',
    },
    {
      error: new ForbiddenError('Недостаточно прав'),
      status: 403,
      text: 'Недостаточно прав',
    },
    {
      error: new ConflictError('Свободных мест нет'),
      status: 409,
      text: 'Свободных мест нет',
    },
    {
      error: new ValidationError('Некорректный id'),
      status: 400,
      text: 'Некорректный id',
    },
    {
      error: new UnauthorizedError('Неверный текущий пароль'),
      status: 401,
      text: 'Неверный текущий пароль',
    },
  ];

  for (const { error, status, text } of cases) {
    it(`${error.name} отдаёт ${status} и текст без изменений`, () => {
      const spy = createResponseSpy();

      new DomainErrorFilter().catch(error, spy.host);

      expect(spy.status).toHaveBeenCalledWith(status);
      expect(spy.json).toHaveBeenCalledWith({ success: false, error: text });
    });
  }

  it('динамический текст перехода сохраняет стрелку и подстановку', () => {
    const spy = createResponseSpy();

    new DomainErrorFilter().catch(
      new ConflictError('Недопустимый переход booking: pending → completed'),
      spy.host,
    );

    expect(spy.json).toHaveBeenCalledWith({
      success: false,
      error: 'Недопустимый переход booking: pending → completed',
    });
  });

  it('четыре одноразовых кода внешнего сервиса проходят как есть', () => {
    for (const [status, text] of [
      [429, 'Превышен лимит запросов к Yandex Geosuggest'],
      [502, 'Ошибка Yandex Geosuggest API'],
      [504, 'Таймаут запроса к Yandex Geosuggest'],
    ] as const) {
      const spy = createResponseSpy();

      new DomainErrorFilter().catch(new ExternalServiceError(text, status), spy.host);

      expect(spy.status).toHaveBeenCalledWith(status);
      expect(spy.json).toHaveBeenCalledWith({ success: false, error: text });
    }
  });

  it('разбор по полям отдаётся только когда он задан', () => {
    const withDetails = createResponseSpy();
    new DomainErrorFilter().catch(
      new ValidationError('Некорректные данные клуба', {
        name: ['Название клуба обязательно'],
      }),
      withDetails.host,
    );
    expect(withDetails.json).toHaveBeenCalledWith({
      success: false,
      error: 'Некорректные данные клуба',
      details: { name: ['Название клуба обязательно'] },
    });

    const withoutDetails = createResponseSpy();
    new DomainErrorFilter().catch(new ValidationError('Некорректный id'), withoutDetails.host);
    expect(withoutDetails.json).toHaveBeenCalledWith({
      success: false,
      error: 'Некорректный id',
    });
  });

  // Фаза 35, этап Э0a: исключений из общей формы ответа больше нет. Одно было —
  // отказ по санкциям за неявки: он клал в `error` машинный код и дописывал рядом
  // два своих поля. Механизм вырезан, а с ним и единственный ответ такого вида.
  it('форма ответа единообразна: отказ отдаёт ровно success и текст', () => {
    const spy = createResponseSpy();

    new DomainErrorFilter().catch(
      new ForbiddenError('Запись доступна только спортсмену'),
      spy.host,
    );

    expect(spy.status).toHaveBeenCalledWith(403);
    expect(spy.json).toHaveBeenCalledWith({
      success: false,
      error: 'Запись доступна только спортсмену',
    });
  });

  it('чужое исключение не утекает наружу деталями', () => {
    const spy = createResponseSpy();

    new DomainErrorFilter().catch(new Error('ENOENT: файл не найден /data/users.json'), spy.host);

    expect(spy.status).toHaveBeenCalledWith(500);
    expect(spy.json).toHaveBeenCalledWith({
      success: false,
      error: 'Внутренняя ошибка сервера',
    });
  });
});
