// Ограничение частоты обращений (шаг 34.51).
//
// Пределы намеренно занижены переменными окружения: набор обязан переполнить
// счётчик, а не ждать боевой сотни запросов. Окно тоже короткое — сброс по окну
// проверяется настоящим ожиданием, потому что хранилище счётчиков библиотеки
// живёт на настоящих таймерах, а не на `Date`.

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Окно в тестах — полторы секунды: столько же придётся ждать сброса. */
const WINDOW_MS = 1500;

describe('Ограничение частоты обращений', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    // Переменные ставятся ДО подъёма приложения: настройки читаются один раз,
    // когда собирается модуль ограничителя.
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_REGISTER', '3');
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_REGISTER_WINDOW_MS', String(WINDOW_MS));
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_GEO', '3');
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_GEO_WINDOW_MS', String(WINDOW_MS));
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_AUTH_ME', '3');
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_AUTH_ME_WINDOW_MS', String(WINDOW_MS));

    harness = await createTestHarness('rate-limit');
  });

  afterAll(async () => {
    await harness.close();
    vi.unstubAllEnvs();
  });

  /** Регистрация с заведомо негодным телом: до хеширования пароля не доходит. */
  const register = () =>
    request(harness.app.getHttpServer())
      .post('/api/auth/register')
      .send({ name: 'А', email: 'не почта', password: '1', accountType: 'athlete' });

  const geocode = () =>
    request(harness.app.getHttpServer())
      .post('/api/geocode')
      .send({ city: 'Самара', address: 'Ленина 1' });

  const suggest = () =>
    request(harness.app.getHttpServer()).post('/api/suggest').send({ text: 'сам' });

  it('регистрация: превышение порога отвечает 429 с русским текстом', async () => {
    for (let index = 0; index < 3; index += 1) {
      expect((await register()).status).toBe(400);
    }

    const blocked = await register();

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error).toMatch(/Слишком много запросов/);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('счётчик регистрации сбрасывается по окну', async () => {
    await new Promise((resolve) => setTimeout(resolve, WINDOW_MS + 300));

    expect((await register()).status).toBe(400);
  });

  it('гео-прокси: у каждого маршрута свой счётчик, превышение — 429', async () => {
    // Ключа в окружении нет, поэтому ответ — 500: важно, что запрос СЧИТАЕТСЯ,
    // а до внешней службы дело не доходит вовсе.
    vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', '');
    vi.stubEnv('YANDEX_SUGGEST_API_KEY', '');

    for (let index = 0; index < 3; index += 1) {
      expect((await geocode()).status).toBe(500);
    }

    expect((await geocode()).status).toBe(429);
    // Подсказки считаются отдельно: перебор координат не должен глушить поиск города.
    expect((await suggest()).status).not.toBe(429);
  });
});

/**
 * «Кто я» — самый частый закрытый маршрут площадки: его зовёт КАЖДАЯ отрисовка
 * закрытой страницы, и до шага 36.26 предела на нём не было вовсе.
 *
 * ⚠️ Ключ счёта — СЕССИЯ, а не адрес, и это не вкусовщина. Страницы зовут этот
 * маршрут из процесса Next, передавая только cookie; браузерные обращения к `/api/*`
 * тоже идут через переадресацию Next. За обратным прокси бэкенд видит ОДИН адрес
 * на всю площадку — потолок по адресу запер бы всех разом, причём именно в час пик.
 */
describe('Ограничение частоты «кто я»', () => {
  let harness: TestHarness;

  const person = (id: number) => ({
    id,
    createdAt: '2026-01-01T00:00:00.000Z',
    status: 'active',
    name: `Человек ${id}`,
    email: `person-${id}@test.local`,
    phone: '+7 (900) 000-00-00',
    passwordHash: DEMO_PASSWORD_HASH,
    favoriteClubIds: [],
  });

  beforeAll(async () => {
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_AUTH_ME', '3');
    vi.stubEnv('SPORT_HUB_RATE_LIMIT_AUTH_ME_WINDOW_MS', String(WINDOW_MS));

    harness = await createTestHarness('rate-limit-auth-me');
    // Засев ДО выдачи сессий: каждая запись пересобирает базу и гасит выданные.
    await harness.write('users', [person(1), person(2)]);
  });

  afterAll(async () => {
    await harness.close();
    vi.unstubAllEnvs();
  });

  const whoAmI = (cookie: string) =>
    request(harness.app.getHttpServer()).get('/api/auth/me').set('Cookie', cookie);

  it('после порога одна сессия получает 429 с русским текстом и сроком ожидания', async () => {
    const cookie = await harness.as(1);

    for (let index = 0; index < 3; index += 1) {
      expect((await whoAmI(cookie)).status).toBe(200);
    }

    const blocked = await whoAmI(cookie);

    expect(blocked.status).toBe(429);
    expect(blocked.body.success).toBe(false);
    expect(blocked.body.error).toMatch(/Слишком много запросов/);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('второй клиент не заперт первым — счёт идёт по сессии, а не по адресу', async () => {
    // ⚠️ Главная проверка шага. Оба клиента приходят с ОДНОГО адреса (это один
    // и тот же процесс), поэтому потолок «на адрес» запер бы и второго. Если
    // однажды ключ счёта съедет обратно на адрес, покраснеет именно этот тест.
    const first = await harness.as(1);
    const second = await harness.as(2);

    for (let index = 0; index < 5; index += 1) {
      await whoAmI(first);
    }

    expect((await whoAmI(first)).status).toBe(429);
    expect((await whoAmI(second)).status).toBe(200);
  });

  it('две сессии одного человека считаются порознь', async () => {
    // Следствие выбранного ключа, названное вслух: запирается вкладка-нарушитель,
    // а не человек. Забытая вкладка с циклом не выбрасывает его из кабинета.
    const laptop = await harness.as(1);
    const phone = await harness.as(1);

    for (let index = 0; index < 5; index += 1) {
      await whoAmI(laptop);
    }

    expect((await whoAmI(laptop)).status).toBe(429);
    expect((await whoAmI(phone)).status).toBe(200);
  });
});
