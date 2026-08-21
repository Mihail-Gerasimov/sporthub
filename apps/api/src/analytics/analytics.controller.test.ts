// Тесты сводки платформы.
//
// Маршрут читает все коллекции разом, и порядок фильтров в нём неочевиден:
// город сначала отбирает клубы и тренеров, а записи, слоты и отзывы отбираются
// уже по ним — своего города у них нет. Ошибка в этом порядке даёт правдоподобные,
// но неверные числа, поэтому проверяется именно она.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

describe('Сводка платформы', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('analytics-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: у базы есть внешние ключи, и клуб,
    // записанный до справочника видов спорта, в неё просто не ляжет.
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'athlete',
          name: 'Атлет',
          email: 'a@t.local',
          phone: '',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'club_owner',
          name: 'Провайдер',
          email: 'p@t.local',
          phone: '',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'admin',
          name: 'Админ',
          email: 'ad@t.local',
          phone: '',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      clubs: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Самарский',
          slug: 'samara',
          description: 'Описание',
          shortDescription: 'Кратко',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
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
          description: 'Описание',
          shortDescription: 'Кратко',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
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
          description: 'Описание',
          shortDescription: 'Кратко',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
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
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Тренер',
          slug: 'trener',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 3,
          priceFrom: 700,
          city: 'Самара',
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
      ],
      offerings: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'club',
          ownerId: 1,
          sportId: 3,
          title: 'Занятия',
          description: 'Описание',
          format: 'group',
          price: 500,
          durationMinutes: 60,
          capacity: 10,
          address: 'ул. Ленина, 1',
          coordinates: { lat: 53.2, lng: 50.1 },
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'club',
          ownerId: 2,
          sportId: 5,
          title: 'Занятия',
          description: 'Описание',
          format: 'group',
          price: 500,
          durationMinutes: 60,
          capacity: 10,
          address: 'ул. Тверская, 1',
          coordinates: { lat: 55.7, lng: 37.6 },
        },
      ],
      schedule: [
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
      ],
      bookings: [
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
          totalPrice: 500,
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
          totalPrice: 500,
          statusHistory: [],
        },
      ],
      reviews: [
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
      ],
      sports: [
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Плавание',
          slug: 'swimming',
          description: '',
          icon: '',
          imageUrl: '',
          isPopular: false,
        },
        {
          id: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Бокс',
          slug: 'boxing',
          description: '',
          icon: '',
          imageUrl: '',
          isPopular: false,
        },
      ],
      logs: [
        {
          id: 1,
          createdAt: '2026-03-01T10:00:00.000Z',
          action: 'booking_create',
          actorId: 1,
          actorRole: 'athlete',
          entityType: 'booking',
          entityId: 1,
        },
        // Второе событие того же дня и одно событие соседнего: без них график
        // выглядел бы одинаково и при свёртке по дням, и без неё.
        {
          id: 2,
          createdAt: '2026-03-01T22:00:00.000Z',
          action: 'admin_login',
          actorId: 3,
          actorRole: 'admin',
          entityType: 'user',
          entityId: 3,
        },
        {
          id: 3,
          createdAt: '2026-03-02T09:00:00.000Z',
          action: 'admin_login',
          actorId: 3,
          actorRole: 'admin',
          entityType: 'user',
          entityId: 3,
        },
      ],
    });
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
    // Чистим одним переносом и вместе с услугами: услуга ссылается на клуб,
    // и «сначала убрать клубы, потом услуги» база не примет — как не примет
    // и рабочий сервер, если однажды кто-то попробует так удалить публикацию.
    await harness.writeMany({
      clubs: [],
      trainers: [],
      offerings: [],
      bookings: [],
      reviews: [],
      schedule: [],
      logs: [],
    });

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

  it('журнал приходит свёрнутым по дням и по возрастанию', async () => {
    const response = await request(server()).get('/api/analytics');

    // Три события за два дня дают ДВЕ строки, а не три: свёртку делает хранилище.
    // Дни идут по возрастанию — так их рисует график.
    expect(response.body.data.platformActivity).toEqual([
      { date: '2026-03-01', count: 2 },
      { date: '2026-03-02', count: 1 },
    ]);
  });

  it('график записей считается по дню создания, а не по дню занятия', async () => {
    const response = await request(server()).get('/api/analytics');

    // Занятие у обеих записей одно — 18 марта, а созданы они 1 и 2 марта.
    expect(response.body.data.bookingsByDate).toEqual([
      { date: '2026-03-01', count: 1 },
      { date: '2026-03-02', count: 1 },
    ]);
  });

  it('пустой журнал даёт пустой график, а не строку с нулём', async () => {
    await harness.write('logs', []);

    const response = await request(server()).get('/api/analytics');

    expect(response.body.data.platformActivity).toEqual([]);
  });
});
