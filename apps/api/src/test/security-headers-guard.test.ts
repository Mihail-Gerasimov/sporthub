/**
 * Сторож заголовков безопасности на ответах API (найдено прогоном 10.09.2026).
 *
 * ⚠️ Почему сторож РАНТАЙМОВЫЙ и обходит таблицу маршрутов. Фаза 34 поставила
 * заголовки во фронте (`next.config.ts`), и на страницах они появились. Но `/api/*`
 * уходит в `rewrites()`, а правило `headers()` до переписанного адреса не достаёт:
 * ответы API шли голыми — ни `nosniff`, ни запрета показа в рамке. Правило при этом
 * выглядело работающим, и текстовая проверка «правило объявлено» была бы зелёной.
 *
 * Поэтому здесь выполняются настоящие запросы и читаются настоящие заголовки ответа.
 *
 * ⚠️ Проверяются И успешные ответы, И отказы. Заголовки нужны на отказе не меньше:
 * тело ошибки — тот же JSON, и угадывать его тип браузеру так же незачем.
 */

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { API_SECURITY_HEADERS } from '../common/security-headers';
import { collectRoutes } from './app-routes';
import { createTestHarness, type TestHarness } from './harness';

describe('Заголовки безопасности на ответах API', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('security-headers-guard');
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('набор заголовков не пуст и включает главный', () => {
    // Санити: пустой набор превратил бы сторожа в зелёную пустышку, а `nosniff` —
    // единственный заголовок, без которого JSON может быть исполнен как сценарий.
    expect(Object.keys(API_SECURITY_HEADERS).length).toBeGreaterThan(0);
    expect(API_SECURITY_HEADERS['X-Content-Type-Options']).toBe('nosniff');
  });

  it('успешный ответ несёт все заголовки', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/clubs');

    expect(response.status).toBe(200);

    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
      expect(response.headers[name.toLowerCase()], `нет заголовка ${name}`).toBe(value);
    }
  });

  it('ОТКАЗ несёт те же заголовки', async () => {
    // ⚠️ Тело отказа — тот же JSON. Заголовки на нём нужны не меньше, а поставить
    // их легко забыть: обработчик ошибок часто пишет ответ своим путём.
    const response = await request(harness.app.getHttpServer()).get('/api/logs');

    expect(response.status).toBe(401);

    for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
      expect(response.headers[name.toLowerCase()], `нет заголовка ${name} на отказе`).toBe(value);
    }
  });

  it('каждый публичный GET отдаёт заголовки — обходом таблицы маршрутов', async () => {
    // ⚠️ Маршруты берутся у РАБОТАЮЩЕГО приложения: новый маршрут попадает
    // под сторожа сам, без правки теста.
    const routes = collectRoutes(harness.app).filter(
      (route) => route.method === 'get' && !route.path.includes(':'),
    );

    expect(routes.length, 'таблица маршрутов пуста — сторож ничего не обходит').toBeGreaterThan(3);

    const naked: string[] = [];

    for (const route of routes) {
      const response = await request(harness.app.getHttpServer()).get(route.path);

      if (response.headers['x-content-type-options'] !== 'nosniff') {
        naked.push(`${route.path} (${response.status})`);
      }
    }

    expect(naked, `ответы без заголовков безопасности: ${naked.join(', ')}`).toEqual([]);
  });
});
