// Тесты нарастающей блокировки входа (шаг 34.51a).
//
// Проверяется сама лестница ожидания, без HTTP: пять неверных попыток — минута,
// следующие пять — две, дальше по минуте за каждые пять, потолок — полчаса.
// Верный пароль обнуляет счётчик.
//
// Отдельно проверяется главное следствие раздельных счётчиков: зная чужую почту,
// нельзя запереть человека, сидящего на том же адресе. Счётчик адреса существует
// против перебора по МНОГИМ учётным записям с одного места и потому имеет свой,
// более высокий порог.
//
// Часы подделываются только по `Date`: таймеры оставлены настоящими, иначе
// соединения с базой в соседних наборах повисли бы.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { TooManyRequestsError } from '../common/domain-error';
import type { LogService } from '../logs/log.service';
import type { UsersRepository } from '../repositories/crud.repository';
import { LOGIN_BLOCKED_PREFIX, LoginAttemptsService } from './login-attempts.service';

const IP = '10.0.0.1';

/**
 * Лестница ожидания проверяется БЕЗ журнала и без базы: набор про счёт неудач,
 * а не про след. Заглушки говорят «человека с такой почтой нет» — этого хватает,
 * чтобы запись следа не делалась вовсе, а счётчик работал как в бою.
 *
 * Сам след проверяется через HTTP в `login-lockout.test.ts`: там есть и база,
 * и настоящая учётная запись, которой след принадлежит.
 */
const silentLogs = { record: async () => {} } as unknown as LogService;
const noUsers = { findByEmail: async () => null } as unknown as UsersRepository;

/** Служба со всеми зависимостями-заглушками. */
const createService = (): LoginAttemptsService => new LoginAttemptsService(silentLogs, noUsers);

describe('Нарастающая блокировка входа', () => {
  let attempts: LoginAttemptsService;

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-09T10:00:00.000Z'));
    attempts = createService();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  /** Сдвинуть часы вперёд: подделан только `Date`, поэтому двигаем его сами. */
  const forward = (ms: number): void => {
    vi.setSystemTime(new Date(Date.now() + ms));
  };

  /** Ошибка блокировки или `null`, если ход разрешён. */
  const blocked = (email: string, ip: string | undefined = IP): TooManyRequestsError | null => {
    try {
      attempts.assertAllowed({ email, ip });

      return null;
    } catch (error) {
      return error as TooManyRequestsError;
    }
  };

  /** Отметить несколько неверных попыток подряд. */
  const failTimes = (count: number, email: string, ip: string | undefined = IP): void => {
    for (let index = 0; index < count; index += 1) {
      attempts.registerFailure({ email, ip });
    }
  };

  it('четыре неверные попытки ещё не запирают', () => {
    failTimes(4, 'user@test.local');

    expect(blocked('user@test.local')).toBeNull();
  });

  it('пятая включает минуту ожидания и называет срок', () => {
    failTimes(5, 'user@test.local');

    const error = blocked('user@test.local');

    expect(error).toBeInstanceOf(TooManyRequestsError);
    expect(error?.status).toBe(429);
    expect(error?.message).toContain(LOGIN_BLOCKED_PREFIX);
    expect(error?.message).toContain('1 мин');
    expect(error?.retryAfterSeconds).toBe(60);
  });

  it('после ожидания попытка снова возможна', () => {
    failTimes(5, 'user@test.local');
    expect(blocked('user@test.local')).not.toBeNull();

    forward(60_001);

    expect(blocked('user@test.local')).toBeNull();
  });

  it('верный пароль обнуляет счётчик', () => {
    failTimes(4, 'user@test.local');
    attempts.registerSuccess({ email: 'user@test.local', ip: IP });

    // Четыре новые неудачи после сброса — это снова четыре, а не восемь.
    failTimes(4, 'user@test.local');

    expect(blocked('user@test.local')).toBeNull();
  });

  it('десятая неверная даёт две минуты', () => {
    failTimes(5, 'user@test.local');
    forward(60_001);
    failTimes(5, 'user@test.local');

    const error = blocked('user@test.local');

    expect(error?.message).toContain('2 мин');
    expect(error?.retryAfterSeconds).toBe(120);
  });

  it('ожидание не превышает получаса, сколько бы попыток ни было', () => {
    // Тридцать пять ступеней — заведомо больше потолка в тридцать минут.
    for (let step = 1; step <= 35; step += 1) {
      failTimes(5, 'user@test.local');

      const error = blocked('user@test.local');

      expect(error?.retryAfterSeconds).toBeLessThanOrEqual(1800);

      // Ждём ровно столько, сколько сказано, и идём на следующую ступень.
      forward((error?.retryAfterSeconds ?? 0) * 1000 + 1000);
    }
  });

  it('блокировка одной почты не мешает входу под другой с того же адреса', () => {
    failTimes(5, 'victim@test.local');

    expect(blocked('victim@test.local')).not.toBeNull();
    expect(blocked('neighbour@test.local')).toBeNull();
  });

  it('адрес запирается своим, более высоким порогом', () => {
    // Перебор по многим учётным записям: у каждой почты по одной неудаче, поэтому
    // ни одна из них не заперта — ловит это только счётчик адреса.
    for (let index = 0; index < 20; index += 1) {
      failTimes(1, `victim-${index}@test.local`);
    }

    expect(blocked('fresh@test.local')).not.toBeNull();
    // С другого адреса та же почта проходит: адрес заперт, почта — нет.
    expect(blocked('fresh@test.local', '10.0.0.2')).toBeNull();
  });

  it('почта сравнивается без учёта регистра и пробелов', () => {
    failTimes(5, 'User@Test.local ');

    expect(blocked('user@test.local')).not.toBeNull();
  });

  it('пороги и шаг настраиваются окружением', () => {
    vi.stubEnv('SPORT_HUB_LOGIN_LOCKOUT_ATTEMPTS', '2');
    vi.stubEnv('SPORT_HUB_LOGIN_LOCKOUT_STEP_MS', '10000');
    const tuned = createService();

    tuned.registerFailure({ email: 'user@test.local', ip: IP });
    tuned.registerFailure({ email: 'user@test.local', ip: IP });

    expect(() => tuned.assertAllowed({ email: 'user@test.local', ip: IP })).toThrowError(
      TooManyRequestsError,
    );
  });
});
