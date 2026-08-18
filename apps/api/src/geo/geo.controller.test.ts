// Тесты прокси карт. Внешняя служба подменяется: проверяется разбор ответа,
// порядок координат и отбор подсказок по стране.

import request from 'supertest';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

const okResponse = (payload: unknown) =>
  ({ ok: true, status: 200, json: async () => payload }) as unknown as Response;

describe('Маршруты карт', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('geo-http');
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllEnvs();
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('поиск координат', () => {
    it('разбирает ответ и меняет порядок координат на привычный', async () => {
      vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', 'test-api-key');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        okResponse({
          response: {
            GeoObjectCollection: {
              featureMember: [
                {
                  GeoObject: {
                    Point: { pos: '50.100202 53.195878' },
                    metaDataProperty: { GeocoderMetaData: { text: 'Самара, Ленина 1' } },
                  },
                },
              ],
            },
          },
        }),
      );

      const response = await request(harness.app.getHttpServer())
        .post('/geocode')
        .send({ city: 'Самара', address: 'Ленина 1' });

      expect(response.status).toBe(200);
      expect(response.body.data.coordinates.lat).toBeCloseTo(53.195878, 4);
      expect(response.body.data.coordinates.lng).toBeCloseTo(50.100202, 4);
      expect(response.body.data.formattedAddress).toBe('Самара, Ленина 1');

      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('geocode-maps.yandex.ru');
      expect(url).toContain('apikey=test-api-key');
    });

    it('пустой город — 400', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/geocode')
        .send({ city: '', address: 'Ленина 1' });

      expect(response.status).toBe(400);
    });

    it('адрес не найден — 404', async () => {
      vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', 'test-api-key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(
        okResponse({ response: { GeoObjectCollection: { featureMember: [] } } }),
      );

      const response = await request(harness.app.getHttpServer())
        .post('/geocode')
        .send({ city: 'Самара', address: 'Несуществующая 9999' });

      expect(response.status).toBe(404);
      expect(response.body.error).toContain('не найден');
    });

    it('без ключа — 500', async () => {
      vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', '');

      const response = await request(harness.app.getHttpServer())
        .post('/geocode')
        .send({ city: 'Самара', address: 'Ленина 1' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('API-ключ');
    });

    it('сбой обращения к службе — 500', async () => {
      vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', 'test-api-key');
      vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('сеть недоступна'));

      const response = await request(harness.app.getHttpServer())
        .post('/geocode')
        .send({ city: 'Самара', address: 'Ленина 1' });

      expect(response.status).toBe(500);
    });
  });

  describe('подсказки адресов', () => {
    const suggestPayload = {
      results: [
        { title: { text: 'Самара' }, subtitle: { text: 'Самарская область' }, tags: ['locality'] },
        { title: { text: 'Москва' }, tags: ['locality'] },
        { title: { text: 'Нью-Йорк' }, subtitle: { text: 'США' }, tags: ['locality'] },
      ],
    };

    it('приводит ответ к своей форме и отбрасывает зарубежные', async () => {
      vi.stubEnv('YANDEX_SUGGEST_API_KEY', 'test-suggest-key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse(suggestPayload));

      const response = await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({ text: 'сам' });

      expect(response.status).toBe(200);
      expect(response.body.data.suggestions.map((item: { title: string }) => item.title)).toEqual([
        'Самара',
        'Москва',
      ]);
      expect(response.body.data.suggestions[0].type).toBe('locality');
      expect(response.body.data.suggestions[0].value).toBe('Самара, Самарская область');
    });

    it('передаёт вид объектов и рамку в запрос', async () => {
      vi.stubEnv('YANDEX_SUGGEST_API_KEY', 'test-suggest-key');
      const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({ results: [] }));

      await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({
          text: 'ленина',
          types: 'street',
          boundedBy: [
            [50, 53],
            [51, 54],
          ],
        });

      const url = String(fetchSpy.mock.calls[0][0]);
      expect(url).toContain('types=street');
      expect(url).toContain('bbox=50%2C53%7E51%2C54');
    });

    it('пустой текст — 400', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({ text: '' });

      expect(response.status).toBe(400);
    });

    it('без ключа — 500', async () => {
      vi.stubEnv('YANDEX_SUGGEST_API_KEY', '');

      const response = await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({ text: 'сам' });

      expect(response.status).toBe(500);
      expect(response.body.error).toContain('API-ключ');
    });

    it('превышение лимита внешней службы — 429', async () => {
      vi.stubEnv('YANDEX_SUGGEST_API_KEY', 'test-suggest-key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({}),
      } as unknown as Response);

      const response = await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({ text: 'сам' });

      expect(response.status).toBe(429);
      expect(response.body.error).toContain('лимит');
    });

    it('ошибка внешней службы — 502', async () => {
      vi.stubEnv('YANDEX_SUGGEST_API_KEY', 'test-suggest-key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({}),
        text: async () => 'boom',
      } as unknown as Response);

      const response = await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({ text: 'сам' });

      expect(response.status).toBe(502);
    });

    it('пустой ответ даёт пустой список', async () => {
      vi.stubEnv('YANDEX_SUGGEST_API_KEY', 'test-suggest-key');
      vi.spyOn(globalThis, 'fetch').mockResolvedValue(okResponse({}));

      const response = await request(harness.app.getHttpServer())
        .post('/suggest')
        .send({ text: 'сам' });

      expect(response.status).toBe(200);
      expect(response.body.data.suggestions).toEqual([]);
    });
  });
});
