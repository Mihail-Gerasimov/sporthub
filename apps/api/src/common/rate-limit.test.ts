// Ограничение частоты обращений (шаг 34.51).
//
// Пределы намеренно занижены переменными окружения: набор обязан переполнить
// счётчик, а не ждать боевой сотни запросов. Окно тоже короткое — сброс по окну
// проверяется настоящим ожиданием, потому что хранилище счётчиков библиотеки
// живёт на настоящих таймерах, а не на `Date`.

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

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
