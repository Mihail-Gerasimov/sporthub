// Тесты популярных видов спорта — `GET /api/sports?popular=<n>` (фаза 38, шаг 38.68).
//
// Выпадашка поиска на главной показывает вместо «популярных запросов» (данных нет)
// популярные ВИДЫ: те, у которых больше опубликованных клубов и карточек тренеров.
// Популярность считает база одной группировкой; в памяти ничего не считается.
//
// Стенд построен так, чтобы «взять первые n видов по номеру и посчитать» отличалось
// от честного ответа полностью, а не мельканием: самые популярные виды — с БОЛЬШИМИ
// номерами, вид 1 набит СКРЫТЫМИ клубами (они не считаются), два вида делят
// счёт поровну (ничью разводит номер).

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Клуб одного вида спорта; номер задаёт и метку времени, и адрес-ссылку. */
const club = (id: number, sportId: number, status: 'published' | 'hidden' = 'published') => ({
  id,
  createdAt: new Date(Date.UTC(2026, 0, 1, 0, id)).toISOString(),
  name: `Клуб ${id}`,
  slug: `club-${id}`,
  city: 'Самара',
  address: 'Ленина 1',
  phone: '+7 (900) 000-00-00',
  description: 'Описание клуба',
  shortDescription: 'Кратко',
  sportIds: [sportId],
  tagIds: [],
  amenityIds: [],
  imageUrls: [],
  rating: 4,
  reviewCount: 0,
  priceFrom: 500,
  distanceKm: 0,
  coordinates: { lat: 53.2, lng: 50.1 },
  source: 'seed',
  status,
});

const trainer = (id: number, sportId: number, status: 'published' | 'hidden' = 'published') => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: `Тренер ${id}`,
  slug: `trainer-${id}`,
  bio: 'Биография',
  avatarUrl: '',
  experienceYears: 5,
  priceFrom: 900,
  sportIds: [sportId],
  specialtyIds: [],
  workFormatIds: [],
  rating: 5,
  reviewCount: 0,
  status,
});

/**
 * Раскладка 150 клубов и 10 карточек тренеров по девяти видам спорта фикстур.
 *
 * Опубликованных: вид 8 — 60 клубов, вид 7 — 40 клубов + 5 тренеров = 45,
 * вид 5 — 10 клубов, вид 6 — 10 клубов (ничья с видом 5 — разводит номер),
 * вид 9 — 5 тренеров. Вид 1 — 30 клубов, но ВСЕ скрытые: в счёт не идут.
 * Виды 2, 3, 4 — без публикаций: в ответе с нулём, не пропадают.
 */
const CLUBS = [
  ...Array.from({ length: 60 }, (_, index) => club(index + 1, 8)),
  ...Array.from({ length: 40 }, (_, index) => club(index + 61, 7)),
  ...Array.from({ length: 10 }, (_, index) => club(index + 101, 5)),
  ...Array.from({ length: 10 }, (_, index) => club(index + 111, 6)),
  ...Array.from({ length: 30 }, (_, index) => club(index + 121, 1, 'hidden')),
];

const TRAINERS = [
  ...Array.from({ length: 5 }, (_, index) => trainer(index + 1, 7)),
  ...Array.from({ length: 5 }, (_, index) => trainer(index + 6, 9)),
];

describe('GET /api/sports?popular=<n>', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('popular-sports');
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Алексей',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      clubs: CLUBS,
      trainers: TRAINERS,
      offerings: [],
      schedule: [],
      bookings: [],
      reviews: [],
      logs: [],
      notifications: [],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const get = (query = '') => request(harness.app.getHttpServer()).get(`/api/sports${query}`);
  const ids = (body: { data: { id: number }[] }) => body.data.map((row) => row.id);

  it('без параметра справочник прежний: все виды по номеру, без счётчика', async () => {
    const response = await get();

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
    expect(response.body.data.every((row: object) => !('publicationCount' in row))).toBe(true);
  });

  it('popular=n отдаёт n видов по убыванию числа ОПУБЛИКОВАННЫХ публикаций', async () => {
    // Первые по номеру — 1, 2, 3; популярные — 8, 7, 5. Реализация «первые n
    // по номеру, потом посчитать» отдала бы [1, 2, 3].
    const response = await get('?popular=3');

    expect(response.status).toBe(200);
    expect(ids(response.body)).toEqual([8, 7, 5]);
    expect(
      response.body.data.map((row: { publicationCount: number }) => row.publicationCount),
    ).toEqual([60, 45, 10]);
  });

  it('скрытые публикации не считаются: вид со скрытыми клубами не популярен', async () => {
    const response = await get('?popular=9');
    const first = response.body.data.find((row: { id: number }) => row.id === 1);

    expect(first.publicationCount).toBe(0);
  });

  it('ничью разводит номер: равные счёты идут по возрастанию id', async () => {
    const response = await get('?popular=9');

    // Виды 5 и 6 — по десять клубов; 9 — пять тренеров; 1..4 — ноль.
    expect(ids(response.body)).toEqual([8, 7, 5, 6, 9, 1, 2, 3, 4]);
  });

  it('тренеры считаются наравне с клубами', async () => {
    const response = await get('?popular=9');
    const nine = response.body.data.find((row: { id: number }) => row.id === 9);

    expect(nine.publicationCount).toBe(5);
  });

  it('строка с ненулевым счётом несёт сам справочник: имя, слаг, иконку', async () => {
    const response = await get('?popular=1');

    expect(response.body.data[0]).toMatchObject({ id: 8, slug: expect.any(String) });
    expect(typeof response.body.data[0].name).toBe('string');
  });

  it('негодное значение — 400; лимит выше потолка срезается', async () => {
    for (const raw of ['abc', '0', '-1', '1.5']) {
      expect((await get(`?popular=${raw}`)).status, `popular=${raw}`).toBe(400);
    }

    // Потолок общий с `limit` витрины: сто. Видов девять — приезжают все девять.
    expect((await get('?popular=500')).body.data).toHaveLength(9);
  });
});
