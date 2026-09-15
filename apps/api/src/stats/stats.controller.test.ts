// Тесты сводных счётчиков площадки — `GET /api/stats/overview` (фаза 38, шаг 38.30).
//
// Герой главной показывает четыре живых числа: спортсменов, тренеров, клубов,
// отзывов. До этого шага главная брала «N клубов» из длины поднятого каталога —
// то есть ради одного числа читала всю таблицу. Здесь числа считает база
// четырьмя `count`, и это свойство проверяется двумя способами: поведением
// (скрытые публикации и администраторы в счёт не идут — значит отбор в запросе,
// а не «сколько строк приехало») и текстом (в исходнике маршрута нет ни `findAll`,
// ни `.length` — д-20, д-23: «счётчик из длины массива» краснит сторож).

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

const user = (id: number, accountKind: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
  status: 'active',
  name: `Человек ${id}`,
  email: `stats-${id}@test.local`,
  phone: `+7 (900) 000-02-${String(id).padStart(2, '0')}`,
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

const club = (id: number, status: 'published' | 'hidden') => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: `Клуб ${id}`,
  slug: `stats-club-${id}`,
  city: 'Самара',
  address: 'Ленина 1',
  phone: '+7 (900) 000-00-00',
  description: 'Описание клуба',
  shortDescription: 'Кратко',
  sportIds: [3],
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

const trainer = (id: number, status: 'published' | 'hidden') => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: `Тренер ${id}`,
  slug: `stats-trainer-${id}`,
  bio: 'Биография',
  avatarUrl: '',
  experienceYears: 5,
  priceFrom: 900,
  sportIds: [3],
  specialtyIds: [],
  workFormatIds: [],
  rating: 5,
  reviewCount: 0,
  status,
});

const review = (id: number, userId: number) => ({
  id,
  createdAt: '2026-01-03T00:00:00.000Z',
  userId,
  clubId: 1,
  rating: 5,
  text: 'Отзыв для счётчика',
});

describe('GET /api/stats/overview', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('stats-overview');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      // Трое людей и один администратор: «спортсмены» — это `account_kind = person`,
      // служебная запись человеком не считается.
      users: [user(1, 'person'), user(2, 'person'), user(3, 'admin'), user(4, 'person')],
      // Две опубликованные и одна скрытая: скрытая на витрине не считается —
      // числа героя обязаны сходиться с тем, что каталог покажет.
      clubs: [club(1, 'published'), club(2, 'published'), club(3, 'hidden')],
      trainers: [trainer(1, 'published'), trainer(2, 'hidden')],
      reviews: [review(1, 1), review(2, 2), review(3, 4)],
      offerings: [],
      schedule: [],
      bookings: [],
      logs: [],
      notifications: [],
    });
  });

  it('отвечает гостю четырьмя числами в конверте { success, data }', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/stats/overview');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      success: true,
      data: { athletes: 3, trainers: 1, clubs: 2, reviews: 3 },
    });
  });

  it('скрытые публикации и администраторы в счёт не идут', async () => {
    // Контрольная группа к предыдущему: спрячем ещё один клуб и заведём ещё
    // одного администратора — числа обязаны сдвинуться ровно на своё.
    await harness.writeMany({
      clubs: [club(1, 'published'), club(2, 'hidden'), club(3, 'hidden')],
      users: [user(1, 'person'), user(2, 'person'), user(3, 'admin'), user(5, 'admin')],
      reviews: [review(1, 1)],
    });

    const response = await request(harness.app.getHttpServer()).get('/api/stats/overview');

    expect(response.body.data).toEqual({ athletes: 2, trainers: 1, clubs: 1, reviews: 1 });
  });

  it('пустая площадка отдаёт нули, а не ошибку', async () => {
    await harness.writeMany({ clubs: [], trainers: [], users: [], reviews: [] });

    const response = await request(harness.app.getHttpServer()).get('/api/stats/overview');

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ athletes: 0, trainers: 0, clubs: 0, reviews: 0 });
  });

  it('сторож: числа считает запрос, а не длина поднятого списка', async () => {
    // ⚠️ Текстовая половина. Поведенческие проверки выше зелены и у реализации
    // «поднять всё и посчитать в памяти» — на стенде из трёх строк цена
    // не видна. Поэтому исходник маршрута осматривается на два признака чтения
    // списка ради числа: вызов `findAll(` и обращение к `.length`.
    const source = await readFile(path.join(__dirname, 'stats.controller.ts'), 'utf8');
    const code = source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

    expect(code, 'счётчик поднимает список вместо count').not.toMatch(/findAll\(|findMany\(/);
    expect(code, 'счётчик читает длину массива').not.toMatch(/\.length\b/);
    // И обратная сторона: четыре счёта действительно на месте — `count(`
    // у публикаций и отзывов, `countByAccountKind(` у людей.
    expect(code.match(/\.count\w*\(/g)?.length, 'счётчиков не четыре').toBe(4);
  });
});
