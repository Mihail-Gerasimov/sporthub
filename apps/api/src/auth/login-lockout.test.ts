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
      // Шаг 37.38: по той же причине чистится и очередь надзора — иначе
      // «ровно одна строка на блокировку» считалась бы по куче от прошлых проверок.
      notifications: [],
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

  // --- Шаг 37.38: то же событие в ОЧЕРЕДИ НАДЗОРА -------------------------------
  //
  // ⚠️ Журнал и очередь надзора — разные обязанности, и это не дубль. Журнал
  // отвечает на вопрос «что было, если я пришёл искать»; очередь — на вопрос
  // «что требует меня СЕЙЧАС». Подбор пароля — ровно то событие, узнавать о котором
  // постфактум бессмысленно.
  describe('след блокировки в очереди надзора', () => {
    const oversightRows = async (): Promise<
      { addresseeKind: string; userId?: number; type: string; payload: Record<string, unknown> }[]
    > => {
      await harness.app.get(LoginAttemptsService).flushTrace();

      const rows = await harness.read<
        {
          addresseeKind: string;
          userId?: number;
          type: string;
          payload: Record<string, unknown>;
        }[]
      >('notifications');

      return rows.filter((row) => row.type === 'oversight_login_blocked');
    };

    it('срабатывание ступени кладёт строку в очередь надзора', async () => {
      await failTimes(5, 'victim@test.local');

      const rows = await oversightRows();

      expect(rows).toHaveLength(1);
      expect(rows[0].addresseeKind).toBe('supervision');
      // У очереди владельца-человека нет: строка переживёт удаление учётной записи.
      expect(rows[0].userId).toBeUndefined();
      expect(rows[0].payload.subjectType).toBe('user');
      expect(rows[0].payload.accountExists).toBe(true);
    });

    it('подбор по НЕСУЩЕСТВУЮЩЕЙ почте тоже оставляет строку', async () => {
      // ⚠️ Ради этого случая `logs.actor_id` и стал необязательным (шаг 37.27):
      // привязать строку было не к кому, и самое ценное событие фазы оказывалось
      // слепым ровно там, где оно нужнее всего.
      await failTimes(5, 'nobody@nowhere.local');

      const rows = await oversightRows();

      expect(rows).toHaveLength(1);
      // И администратор видит РАЗНИЦУ: ломают живого человека или перебирают
      // адреса наугад — события разные по срочности.
      expect(rows[0].payload.accountExists).toBe(false);
    });

    it('блокировка при ТРЁХ администраторах даёт ОДНУ строку', async () => {
      // ⚠️ Дыра покрытия, найденная ревизией 37.73. В стенде администраторов
      // не было ВООБЩЕ, и «одна строка на всех» проверялась там, где адресатов
      // ноль: такой замер зелен и у кода, который пишет по строке каждому.
      //
      // ⚠️ Люди переписываются, а счётчики попыток живут в приложении и запись
      // среза переживают — поэтому сброс делается здесь же, иначе предыдущая
      // проверка оставила бы запертую почту и пяти неудач не потребовалось бы.
      await harness.writeMany({
        users: [
          user(1, 'victim@test.local'),
          user(2, 'neighbour@test.local'),
          { ...user(3, 'admin1@test.local'), accountKind: 'admin' },
          { ...user(4, 'admin2@test.local'), accountKind: 'admin' },
          { ...user(5, 'admin3@test.local'), accountKind: 'admin' },
        ],
        logs: [],
        notifications: [],
      });
      harness.app.get(LoginAttemptsService).reset();

      await failTimes(5, 'victim@test.local');

      const rows = await oversightRows();

      expect(rows, 'строка размножилась по администраторам').toHaveLength(1);
      expect(rows[0].addresseeKind).toBe('supervision');
    });

    it('одиночная неудача очередь не трогает', async () => {
      await attempt('victim@test.local', 'не тот пароль');

      expect(await oversightRows()).toHaveLength(0);
    });

    it('успешный вход очередь не трогает', async () => {
      await attempt('victim@test.local', DEMO_PASSWORD);

      expect(await oversightRows()).toHaveLength(0);
    });
  });
});
