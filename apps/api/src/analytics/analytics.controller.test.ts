// Тесты сводки платформы.
//
// Маршрут читает все коллекции разом, и порядок фильтров в нём неочевиден:
// город сначала отбирает клубы и тренеров, а записи, слоты и отзывы отбираются
// уже по ним — своего города у них нет. Ошибка в этом порядке даёт правдоподобные,
// но неверные числа, поэтому проверяется именно она.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Сводка платформы', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('analytics-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Атлет',
        email: 'a@t.local',
        phone: '',
        password: 'x',
        favoriteClubIds: [],
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'club_owner',
        name: 'Провайдер',
        email: 'p@t.local',
        phone: '',
        password: 'x',
        favoriteClubIds: [],
      },
      {
        id: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'admin',
        name: 'Админ',
        email: 'ad@t.local',
        phone: '',
        password: 'x',
        favoriteClubIds: [],
      },
    ]);
    await harness.write('clubs', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Самарский',
        slug: 'samara',
        city: 'Самара',
        managedByUserId: 2,
        sportIds: [3],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Московский',
        slug: 'moscow',
        city: 'Москва',
        managedByUserId: 2,
        sportIds: [5],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 4,
        reviewCount: 0,
        status: 'published',
      },
      {
        id: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Скрытый',
        slug: 'hidden',
        city: 'Самара',
        managedByUserId: 2,
        sportIds: [3],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 3,
        reviewCount: 0,
        status: 'hidden',
      },
    ]);
    await harness.write('trainers', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Тренер',
        slug: 'trener',
        city: 'Самара',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('schedule', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'club',
        ownerId: 1,
        clubId: 1,
        offeringId: 1,
        sportId: 3,
        title: 'Слот',
        date: '2026-03-18',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 10,
        bookedCount: 4,
        price: 500,
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'club',
        ownerId: 2,
        clubId: 2,
        offeringId: 2,
        sportId: 5,
        title: 'Слот',
        date: '2026-03-18',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 10,
        bookedCount: 0,
        price: 500,
      },
    ]);
    await harness.write('bookings', [
      {
        id: 1,
        createdAt: '2026-03-01T00:00:00.000Z',
        userId: 1,
        scheduleId: 1,
        clubId: 1,
        ownerType: 'club',
        ownerId: 1,
        sportId: 3,
        status: 'completed',
        date: '2026-03-18',
        statusHistory: [],
      },
      {
        id: 2,
        createdAt: '2026-03-02T00:00:00.000Z',
        userId: 1,
        scheduleId: 2,
        clubId: 2,
        ownerType: 'club',
        ownerId: 2,
        sportId: 5,
        status: 'completed',
        date: '2026-03-18',
        statusHistory: [],
      },
    ]);
    await harness.write('reviews', [
      {
        id: 1,
        createdAt: '2026-03-03T00:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Отлично',
      },
      {
        id: 2,
        createdAt: '2026-03-04T00:00:00.000Z',
        userId: 1,
        clubId: 2,
        rating: 4,
        text: 'Хорошо',
      },
    ]);
    await harness.write('sports', [
      { id: 3, createdAt: '2026-01-01T00:00:00.000Z', name: 'Плавание', slug: 'swimming' },
      { id: 5, createdAt: '2026-01-01T00:00:00.000Z', name: 'Бокс', slug: 'boxing' },
    ]);
    await harness.write('logs', [
      {
        id: 1,
        createdAt: '2026-03-01T10:00:00.000Z',
        action: 'booking_create',
        actorId: 1,
        actorRole: 'athlete',
        entityType: 'booking',
        entityId: 1,
      },
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer();

  it('без фильтров отдаёт полную сводку', async () => {
    const response = await request(server()).get('/api/analytics');

    expect(response.status).toBe(200);
    expect(Object.keys(response.body.data)).toEqual([
      'kpi',
      'bookingsByDate',
      'sportPopularity',
      'topEntities',
      'platformActivity',
    ]);
    expect(response.body.data.kpi.totalUsers).toBe(3);
    expect(response.body.data.kpi.totalAthletes).toBe(1);
    expect(response.body.data.kpi.totalBookings).toBe(2);
  });

  it('скрытые публикации в сводку не попадают', async () => {
    const response = await request(server()).get('/api/analytics');

    expect(response.body.data.kpi.totalClubs).toBe(2);
  });

  it('загрузка слотов считается как отношение занятых мест к общей вместимости', async () => {
    const response = await request(server()).get('/api/analytics');

    // 4 занятых из 20 общих мест.
    expect(response.body.data.kpi.averageSlotLoad).toBeCloseTo(4 / 20, 5);
  });

  it('город отбирает не только клубы, но и записи с отзывами через них', async () => {
    const response = await request(server()).get('/api/analytics?city=Самара');

    expect(response.body.data.kpi.totalClubs).toBe(1);
    expect(response.body.data.kpi.totalBookings).toBe(1);
    expect(response.body.data.kpi.totalReviews).toBe(1);
    expect(response.body.data.topEntities.map((item: { id: number }) => item.id)).toEqual([1]);
  });

  it('вид спорта отбирает и публикации, и записи', async () => {
    const response = await request(server()).get('/api/analytics?sportId=5');

    expect(response.body.data.kpi.totalClubs).toBe(1);
    expect(response.body.data.kpi.totalBookings).toBe(1);
    expect(response.body.data.sportPopularity).toEqual([
      expect.objectContaining({ sportId: 5, sportName: 'Бокс', count: 1 }),
    ]);
  });

  it('город и вид спорта вместе дают пересечение', async () => {
    const response = await request(server()).get('/api/analytics?city=Самара&sportId=5');

    expect(response.body.data.kpi.totalClubs).toBe(0);
    expect(response.body.data.kpi.totalBookings).toBe(0);
  });

  it('пустые коллекции не ломают сводку', async () => {
    for (const name of ['clubs', 'trainers', 'bookings', 'reviews', 'schedule', 'logs']) {
      await harness.write(name, []);
    }

    const response = await request(server()).get('/api/analytics');

    expect(response.status).toBe(200);
    expect(response.body.data.kpi.averageSlotLoad).toBe(0);
    expect(response.body.data.topEntities).toEqual([]);
  });

  it('верхушка ранжируется по числу записей', async () => {
    const response = await request(server()).get('/api/analytics');

    expect(response.body.data.topEntities).toHaveLength(2);
    expect(response.body.data.topEntities[0].bookings).toBe(1);
  });
});
