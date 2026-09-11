// Нарастающая блокировка входа глазами клиента (шаг 34.51a).
//
// Отдельный набор, а не дописка к `auth.controller.test.ts`: счётчики живут в
// приложении, и набор, который их нарочно переполняет, обязан иметь своё
// приложение — иначе он запирал бы вход соседним проверкам.
//
// Часы подделываются только по `Date` (`toFake: ['Date']`): настоящие таймеры
// нужны живыми, иначе повиснут соединения с базой.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  createTestHarness,
  type TestHarness,
} from '../test/harness';
import { LoginAttemptsService } from './login-attempts.service';

const user = (id: number, email: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  status: 'active',
  name: `Пользователь ${id}`,
  email,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Блокировка входа после неверных попыток', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    // Подделка часов ставится ДО подъёма приложения — как в наборе записей.
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });

    harness = await createTestHarness('login-lockout');
  });

  beforeEach(async () => {
    // ⚠️ Шаг 37.27. Журнал чистится ВМЕСТЕ с людьми. Обвязка правит только
    // названные коллекции, поэтому строки предыдущей проверки дожили бы
    // до следующей — и «ровно одна строка на блокировку» считалась бы по куче.
    await harness.writeMany({
      users: [user(1, 'victim@test.local'), user(2, 'neighbour@test.local')],
      logs: [],
    });
    // Счётчики живут в приложении и переживают смену данных: каждая проверка
    // начинается с чистого листа, иначе блокировка предыдущей досталась бы следующей.
    harness.app.get(LoginAttemptsService).reset();
  });

  afterAll(async () => {
    await harness.close();
    vi.useRealTimers();
  });

  /** Одна попытка входа. */
  const attempt = (email: string, password: string) =>
    request(harness.app.getHttpServer()).post('/api/auth/login').send({ email, password });

  /** Несколько неверных попыток подряд. */
  const failTimes = async (count: number, email: string): Promise<void> => {
    for (let index = 0; index < count; index += 1) {
      await attempt(email, 'не тот пароль');
    }
  };

  /** Сдвинуть часы вперёд: подделан только `Date`. */
  const forward = (ms: number): void => {
    vi.setSystemTime(new Date(Date.now() + ms));
  };

  it('пятая неверная попытка запирает вход и называет срок ожидания', async () => {
    await failTimes(5, 'victim@test.local');

    const response = await attempt('victim@test.local', DEMO_PASSWORD);

    expect(response.status).toBe(429);
    expect(response.body.success).toBe(false);
    expect(response.body.error).toMatch(/Повторите через 1 мин/);
    expect(response.headers['retry-after']).toBe('60');
  });

  it('запертая почта не мешает войти под другой с того же адреса', async () => {
    await failTimes(5, 'victim@test.local');

    const neighbour = await attempt('neighbour@test.local', DEMO_PASSWORD);

    expect(neighbour.status).toBe(200);

    // Запертая почта остаётся запертой: сброс соседа её не касается.
    expect((await attempt('victim@test.local', DEMO_PASSWORD)).status).toBe(429);
  });

  it('после ожидания вход снова доступен', async () => {
    await failTimes(5, 'victim@test.local');
    expect((await attempt('victim@test.local', DEMO_PASSWORD)).status).toBe(429);

    forward(60_001);

    expect((await attempt('victim@test.local', DEMO_PASSWORD)).status).toBe(200);
  });

  it('верный пароль обнуляет счётчик неудач', async () => {
    await failTimes(4, 'victim@test.local');
    expect((await attempt('victim@test.local', DEMO_PASSWORD)).status).toBe(200);

    // Счётчик обнулён: следующие четыре неудачи снова не запирают.
    await failTimes(4, 'victim@test.local');

    expect((await attempt('victim@test.local', DEMO_PASSWORD)).status).toBe(200);
  });

  it('десятая неверная попытка даёт две минуты', async () => {
    await failTimes(5, 'victim@test.local');
    forward(60_001);
    await failTimes(5, 'victim@test.local');

    const response = await attempt('victim@test.local', DEMO_PASSWORD);

    expect(response.status).toBe(429);
    expect(response.body.error).toMatch(/Повторите через 2 мин/);
    expect(response.headers['retry-after']).toBe('120');
  });

  // ⚠️ Шаг 37.27. До него подбор пароля не оставлял НИКАКОГО следа: счёт неудач
  // жил в `Map` в памяти процесса и умирал вместе с перезапуском. Блокировка
  // срабатывала, человек её чувствовал, а узнать о ней постфактум было неоткуда.
  describe('след блокировки в журнале', () => {
    /**
     * Дождаться записи следа и прочитать журнал.
     *
     * Запись в журнал — побочный эффект и не задерживает ответ на вход; поэтому
     * набор ждёт её явно, а не гадает про таймеры.
     */
    const lockoutLogs = async (): Promise<
      { action: string; actorId: number; entityId: number; meta?: Record<string, unknown> }[]
    > => {
      await harness.app.get(LoginAttemptsService).flushTrace();

      const logs =
        await harness.read<
          { action: string; actorId: number; entityId: number; meta?: Record<string, unknown> }[]
        >('logs');

      return logs.filter((entry) => entry.action === 'login_lockout');
    };

    it('пять неудач подряд оставляют РОВНО ОДНУ строку журнала', async () => {
      await failTimes(5, 'victim@test.local');

      const logs = await lockoutLogs();

      expect(logs).toHaveLength(1);
      expect(logs[0]).toMatchObject({
        // Событие произвела сама площадка, а не человек: `actorRole` говорит это
        // прямо, а номер указывает на учётную запись, вход в которую закрыли.
        actorId: 1,
        entityId: 1,
        meta: {
          key: 'email:victim@test.local',
          keyKind: 'email',
          failures: 5,
          blockedForMs: 60_000,
        },
      });
    });

    it('одиночная неудача следа не оставляет', async () => {
      await failTimes(1, 'victim@test.local');

      expect(await lockoutLogs()).toHaveLength(0);
    });

    it('успешный вход следа не оставляет', async () => {
      await attempt('victim@test.local', DEMO_PASSWORD);

      expect(await lockoutLogs()).toHaveLength(0);
    });

    it('вторая ступень даёт вторую строку, а не переписывает первую', async () => {
      await failTimes(5, 'victim@test.local');
      forward(60_001);
      await failTimes(5, 'victim@test.local');

      const logs = await lockoutLogs();

      expect(logs).toHaveLength(2);
      // Порядок выдачи журнала набор не проверяет — он проверяет, что ступени
      // записаны обе и с разным числом неудач.
      expect(logs.map((entry) => Number(entry.meta?.failures)).sort((a, b) => a - b)).toEqual([
        5, 10,
      ]);
    });

    it('ни пароль, ни его хеш в след не попадают', async () => {
      await failTimes(5, 'victim@test.local');

      const written = JSON.stringify((await lockoutLogs()).map((entry) => entry.meta));

      expect(written).not.toContain('не тот пароль');
      expect(written).not.toContain('$argon2');
    });
  });
});
