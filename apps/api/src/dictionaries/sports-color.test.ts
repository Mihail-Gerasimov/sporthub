// Цвет вида спорта в справочнике — `GET /api/sports` (фаза 38, шаг 38.80).
//
// Карта главной красит капли и легенду цветом вида из ответа справочника. Поле
// необязательное: вид без цвета отдаётся БЕЗ ключа, а не с `null` — старый клиент
// разницы не замечает, новый рисует серую каплю.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections, fixtureSports } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

const EMPTY = {
  users: [],
  clubs: [],
  trainers: [],
  offerings: [],
  schedule: [],
  bookings: [],
  reviews: [],
  logs: [],
  notifications: [],
};

describe('GET /api/sports — цвет вида', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('sports-color');
  });

  beforeEach(async () => {
    await harness.writeMany({ ...fixtureDictionaryCollections, ...EMPTY });
  });

  afterAll(async () => {
    await harness.close();
  });

  const get = (query = '') => request(harness.app.getHttpServer()).get(`/api/sports${query}`);

  it('у каждого вида сида в ответе цвет — тот, что в фикстурах, формата #rrggbb', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((row: { slug: string; color?: string }) => [row.slug, row.color]),
    ).toEqual(fixtureSports.map((sport) => [sport.slug, sport.color]));
    for (const row of response.body.data as { color?: string }[]) {
      expect(row.color).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('популярные виды несут цвет тем же полем', async () => {
    const response = await get('?popular=3');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    for (const row of response.body.data as { slug: string; color?: string }[]) {
      expect(row.color).toBe(fixtureSports.find((sport) => sport.slug === row.slug)?.color);
    }
  });

  it('вид без цвета отдаётся без ключа, а не с null — старый клиент разницы не видит', async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      ...EMPTY,
      sports: fixtureSports.map(({ color: _color, ...sport }) => sport),
    });

    const response = await get();

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(fixtureSports.length);
    expect(response.body.data.every((row: object) => !('color' in row))).toBe(true);
  });
});
