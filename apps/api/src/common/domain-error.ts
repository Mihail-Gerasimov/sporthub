// Классы доменных ошибок.
//
// До Phase 32 роут выбирал HTTP-код сравнением ТЕКСТА исключения:
// `message === 'Запись не найдена'` или `message.includes('не найден')`.
// Пятнадцать таких мест, и любая правка формулировки молча меняла код ответа.
//
// Теперь код несёт сам класс ошибки. Текст при этом сохраняется дословно:
// на него завязаны 47 ассертов в тестах и разбор ответов на фронте.

/** Базовый класс: несёт HTTP-код и текст, который уйдёт наружу без изменений. */
export abstract class DomainError extends Error {
  abstract readonly status: number;

  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Сущность не найдена — 404. */
export class NotFoundError extends DomainError {
  readonly status = 404;
}

/** Недостаточно прав — 403. */
export class ForbiddenError extends DomainError {
  readonly status = 403;
}

/** Конфликт состояния: недопустимый переход, дубликат, нет мест — 409. */
export class ConflictError extends DomainError {
  readonly status = 409;
}

/** Некорректный вход — 400. */
export class ValidationError extends DomainError {
  readonly status = 400;

  /**
   * Разбор ошибок по полям. Отдаётся рядом с `error` под ключом `details`
   * и только там, где так было раньше: публикация клуба и тренера.
   */
  constructor(
    message: string,
    readonly details?: Record<string, string[] | undefined>,
  ) {
    super(message);
  }
}

/** Неверные учётные данные — 401. Единственное место: смена пароля. */
export class UnauthorizedError extends DomainError {
  readonly status = 401;
}

/**
 * Слишком много обращений — 429.
 *
 * Срок ожидания несёт сама ошибка: без него ответ говорит «нельзя», но не говорит
 * «когда можно», и клиенту остаётся только долбиться в закрытую дверь. Число
 * уходит наружу и текстом (человеку), и заголовком `Retry-After` (программе).
 */
export class TooManyRequestsError extends DomainError {
  readonly status = 429;

  constructor(
    message: string,
    readonly retryAfterSeconds: number,
  ) {
    super(message);
  }
}

/**
 * Сбой внешнего сервиса. Код передаётся явно, потому что прокси к картам
 * отдаёт весь набор: 429 при лимите, 502 при отказе, 504 при таймауте.
 */
export class ExternalServiceError extends DomainError {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

/**
 * Особый случай: карантин атлета. Ответ не укладывается в общую форму —
 * в поле `error` лежит машинный код, а рядом два дополнительных поля.
 * На это завязаны экран записи и тест, поэтому форма сохраняется как есть.
 */
export class QuarantineError extends DomainError {
  readonly status = 403;

  constructor(
    readonly until: string | undefined,
    readonly reason: string | undefined,
  ) {
    super('quarantine');
  }
}
