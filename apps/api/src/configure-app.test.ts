// Настройка приложения проверяется ЧЕРЕЗ ПОДНЯТОЕ ПРИЛОЖЕНИЕ (дыры d-28 и d-31,
// найденные прогоном диверсий фазы 34).
//
// Обе дыры — про ПОДКЛЮЧЕНИЕ, а не про логику. Логика проверки источника покрыта
// (`common/origin-check.test.ts`), но её тесты зовут функцию напрямую: убери строку
// `express.use(checkRequestOrigin)` — и они останутся зелёными, а защита исчезнет.
// У доверия к прокси не было даже такого: ни одного упоминания `trust proxy` или
// `X-Forwarded-For` в проекте. Поэтому оба набора здесь ходят по HTTP: проверяется
// не то, что функция работает, а то, что она СТОИТ НА ПУТИ запроса.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { LoginAttemptsService } from './auth/login-attempts.service';
import { PrismaService } from './storage/prisma.service';
import {
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  createTestHarness,
  type TestHarness,
} from './test/harness';

/** Адреса из диапазонов, отведённых под документацию: живой машине не принадлежат. */
const CLIENT_IP = '203.0.113.7';
const OTHER_CLIENT_IP = '203.0.113.8';
/** Адрес, который клиент назвал сам: приложение обязано его не принять. */
const SPOOFED_IP = '198.51.100.66';

const user = (id: number, email: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  status: 'active',
  name: `Пользователь ${id}`,
  email,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('Настройка приложения на пути запроса', () => {
  let harness: TestHarness;
  let previousIpAttempts: string | undefined;

  beforeAll(async () => {
    previousIpAttempts = process.env.SPORT_HUB_LOGIN_LOCKOUT_IP_ATTEMPTS;
    // Порог по адресу снижен до двух: набор проверяет, ПО КАКОМУ адресу считает
    // защита, а не лестницу ожидания (она покрыта в `login-lockout.test.ts`).
    // Боевые двадцать попыток означали бы двадцать расчётов argon2 по 19 МБ ради
    // того же самого вывода. Значение читается сервисом при сборке приложения,
    // поэтому ставится ДО подъёма обвязки.
    process.env.SPORT_HUB_LOGIN_LOCKOUT_IP_ATTEMPTS = '2';

    harness = await createTestHarness('configure-app');
  });

  beforeEach(async () => {
    await harness.write('users', [user(1, 'athlete@test.local')]);
    // Счётчики переживают смену данных: без сброса блокировка одной проверки
    // досталась бы следующей.
    harness.app.get(LoginAttemptsService).reset();
  });

  afterAll(async () => {
    await harness.close();

    if (previousIpAttempts === undefined) delete process.env.SPORT_HUB_LOGIN_LOCKOUT_IP_ATTEMPTS;
    else process.env.SPORT_HUB_LOGIN_LOCKOUT_IP_ATTEMPTS = previousIpAttempts;
  });

  /** Попытка входа от имени клиента с названным адресом за прокси. */
  const attempt = (ip: string, password: string) =>
    request(harness.app.getHttpServer())
      .post('/api/auth/login')
      .set('X-Forwarded-For', ip)
      .send({ email: 'athlete@test.local', password });

  describe('Доверие к заголовкам прокси', () => {
    // В бою перед приложением стоит nginx, и соединение к процессу всегда приходит
    // с одного и того же адреса — самой машины. Настоящий адрес клиента живёт
    // только в `X-Forwarded-For`. Без `trust proxy` приложение его не читает,
    // и всё, что считается по адресу, считается по адресу прокси.

    it('адрес клиента из X-Forwarded-For доходит до приложения', async () => {
      const response = await attempt(CLIENT_IP, DEMO_PASSWORD);

      expect(response.status).toBe(200);

      // Сессия хранит адрес, с которого вошли, — это и есть `request.ip` глазами
      // приложения. Без доверия к прокси здесь лежал бы адрес самой машины,
      // и разбирать инцидент по журналу было бы нечем.
      const session = await harness.app.get(PrismaService).client.session.findFirst({
        where: { userId: 1 },
        orderBy: { id: 'desc' },
      });

      expect(session?.ip).toBe(CLIENT_IP);
    });

    it('доверяется ровно один прокси: подделать адрес заголовком нельзя', async () => {
      // Заголовок дописывается СПРАВА: `X-Forwarded-For: <что прислал клиент>, <что
      // добавил наш nginx>`. Доверять цепочке целиком (`trust proxy: true`) значит
      // взять первое значение — то есть поверить клиенту на слово. Тогда любой
      // подбиратель паролей меняет себе адрес заголовком и обходит блокировку.
      const response = await request(harness.app.getHttpServer())
        .post('/api/auth/login')
        .set('X-Forwarded-For', `${SPOOFED_IP}, ${CLIENT_IP}`)
        .send({ email: 'athlete@test.local', password: DEMO_PASSWORD });

      expect(response.status).toBe(200);

      const session = await harness.app.get(PrismaService).client.session.findFirst({
        where: { userId: 1 },
        orderBy: { id: 'desc' },
      });

      // Верен адрес, который дописал НАШ прокси, а не тот, что назвал клиент.
      expect(session?.ip).toBe(CLIENT_IP);
    });

    it('блокировка входа считает по адресу клиента, а не по общему адресу прокси', async () => {
      // Два промаха с одного адреса при пороге в две попытки — адрес заперт.
      await attempt(CLIENT_IP, 'не тот пароль');
      await attempt(CLIENT_IP, 'не тот пароль');

      expect((await attempt(CLIENT_IP, DEMO_PASSWORD)).status).toBe(429);

      // ⚠️ Главная строка набора. Без `trust proxy` оба клиента для приложения —
      // один и тот же адрес nginx, и промахи первого запирают вход ВСЕМ сразу.
      // Это не теоретическая беда: за одним прокси сидит вся площадка.
      expect((await attempt(OTHER_CLIENT_IP, DEMO_PASSWORD)).status).toBe(200);
    });
  });

  describe('Проверка источника подключена к приложению', () => {
    /** Изменяющий запрос с названным признаком источника. */
    const post = (site: string) =>
      request(harness.app.getHttpServer())
        .post('/api/auth/login')
        .set('Sec-Fetch-Site', site)
        .send({ email: 'athlete@test.local', password: DEMO_PASSWORD });

    it('изменяющий запрос с чужого сайта отбивается до контроллера', async () => {
      const response = await post('cross-site');

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ success: false, error: 'Запрос с чужого источника' });
      // Cookie сессии нет — значит запрос не дошёл до входа, а не «дошёл и отработал».
      expect(response.headers['set-cookie']).toBeUndefined();
    });

    it('тот же запрос со своего сайта проходит', async () => {
      // Контроль: 403 выше приходит именно от проверки источника, а не от чего-то,
      // что отбивает любой вход с заголовком `Sec-Fetch-Site`.
      expect((await post('same-origin')).status).toBe(200);
    });
  });
});
