import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as GETClubDetail, PATCH } from '@/app/api/clubs/[id]/route';
import { GET, POST } from '@/app/api/clubs/route';
import { getClubs, getOfferings, getSchedule } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const validClubPayload = {
  name: 'FitZone Studio',
  city: 'Самара',
  address: 'ул. Ленина, 42',
  description:
    'Современный фитнес-клуб с тренажёрным залом, групповыми программами и зоной кроссфита. Работаем для тех, кто хочет тренироваться в комфортной обстановке.',
  phone: '+7 (846) 300-00-01',
  email: 'hello@fitzone.ru',
  priceFrom: '1200',
  disciplines: ['Йога', 'Кроссфит'],
  tags: ['Утренние группы', 'После работы'],
  amenities: ['Парковка', 'Душевые'],
  scheduleSlots: [
    {
      title: 'Утренняя йога',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      price: '900',
      capacity: '15',
      location: 'Зал №1',
      discipline: 'Йога',
    },
  ],
  userId: 2,
};

const validClubPatchPayload = {
  name: 'Volna Aquatic Club Premium',
  city: 'Самара',
  address: 'ул. Лесная, 25',
  description:
    'Обновлённое описание клуба для edit-flow. В клубе появились новые зоны, обновлённое расписание и расширенная линейка занятий для взрослых и детей.',
  phone: '+7 (846) 200-11-99',
  email: 'premium@volna-club.ru',
  priceFrom: '1500',
  disciplines: ['Плавание', 'Пилатес'],
  tags: ['Плавание', 'Восстановление'],
  amenities: ['Бассейн 50 м', 'SPA'],
  scheduleSlots: [
    {
      id: 1,
      title: 'Утреннее плавание PRO',
      date: '2026-04-02',
      startTime: '07:30',
      endTime: '08:45',
      price: '1500',
      capacity: '16',
      location: 'Большой бассейн',
      discipline: 'Плавание',
    },
    {
      title: 'Вечерний пилатес',
      date: '2026-04-03',
      startTime: '18:30',
      endTime: '19:30',
      price: '1200',
      capacity: '10',
      location: 'Студия пилатеса',
      discipline: 'Пилатес',
    },
  ],
  userId: 2,
};

describe('GET /api/clubs', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('фильтрует клубы по sportId, search и minRating', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/clubs?sportId=1&search=%D0%B9%D0%BE%D0%B3%D0%B0&minRating=4.8',
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 3,
      slug: 'balance-yoga-house',
      city: 'Самара',
    });
  });
});

describe('POST /api/clubs', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('создаёт клуб, offering и schedule через publish payload', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/clubs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(validClubPayload),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.club).toMatchObject({
      name: 'FitZone Studio',
      managedByUserId: 2,
      source: 'provider',
      status: 'published',
    });
    expect(body.data.offering).toMatchObject({
      ownerType: 'club',
      ownerId: body.data.club.id,
      affiliatedClubId: body.data.club.id,
    });
    expect(body.data.schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerType: 'club',
          ownerId: body.data.club.id,
          clubId: body.data.club.id,
          offeringId: body.data.offering.id,
        }),
      ]),
    );

    const clubs = await getClubs();
    const offerings = await getOfferings();
    const schedule = await getSchedule({ ownerType: 'club' });

    expect(clubs.some((club) => club.id === body.data.club.id)).toBe(true);
    expect(offerings.some((offering) => offering.id === body.data.offering.id)).toBe(true);
    expect(schedule.some((slot) => slot.id === body.data.schedules[0].id)).toBe(true);
  });

  it('возвращает 400 для невалидного payload и ничего не записывает', async () => {
    const clubsBefore = await getClubs();
    const offeringsBefore = await getOfferings();
    const scheduleBefore = await getSchedule({ ownerType: 'all' });

    const response = await POST(
      new Request('http://localhost:3000/api/clubs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validClubPayload,
          description: 'Слишком коротко',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Некорректные данные клуба');

    const clubsAfter = await getClubs();
    const offeringsAfter = await getOfferings();
    const scheduleAfter = await getSchedule({ ownerType: 'all' });

    expect(clubsAfter).toEqual(clubsBefore);
    expect(offeringsAfter).toEqual(offeringsBefore);
    expect(scheduleAfter).toEqual(scheduleBefore);
  });

  it('возвращает 404 если пользователь не найден', async () => {
    const clubsBefore = await getClubs();

    const response = await POST(
      new Request('http://localhost:3000/api/clubs', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validClubPayload,
          userId: 999,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Пользователь не найден');

    const clubsAfter = await getClubs();

    expect(clubsAfter).toEqual(clubsBefore);
  });
});

describe('GET /api/clubs/[id] и PATCH /api/clubs/[id]', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('GET /api/clubs/[id] возвращает primary offering для bootstrap edit-flow', async () => {
    const response = await GETClubDetail(new Request('http://localhost:3000/api/clubs/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      club: {
        id: 1,
        slug: 'volna-aquatic-club',
      },
      primaryOffering: {
        id: 1,
        ownerType: 'club',
        ownerId: 1,
        affiliatedClubId: 1,
      },
    });
    expect(body.data.schedule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          offeringId: 1,
          ownerType: 'club',
          ownerId: 1,
          clubId: 1,
        }),
      ]),
    );
  });

  it('PATCH /api/clubs/[id] обновляет клуб, primary offering и расписание через publish-схему', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/clubs/1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(validClubPatchPayload),
      }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.club).toMatchObject({
      id: 1,
      name: 'Volna Aquatic Club Premium',
      slug: 'volna-aquatic-club',
      managedByUserId: 2,
    });
    expect(body.data.offering).toMatchObject({
      id: 1,
      ownerType: 'club',
      ownerId: 1,
      affiliatedClubId: 1,
      title: 'Занятия — Volna Aquatic Club Premium',
    });
    expect(body.data.schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          ownerType: 'club',
          ownerId: 1,
          clubId: 1,
          offeringId: 1,
          bookedCount: 2,
        }),
      ]),
    );

    const clubs = await getClubs();
    const offerings = await getOfferings();
    const schedule = (await getSchedule({ ownerType: 'club' })).filter((slot) => slot.clubId === 1);

    expect(clubs.find((club) => club.id === 1)?.name).toBe('Volna Aquatic Club Premium');
    expect(
      offerings.filter((offering) => offering.ownerType === 'club' && offering.ownerId === 1),
    ).toHaveLength(1);
    expect(schedule).toHaveLength(2);
    expect(schedule.find((slot) => slot.id === 1)?.bookedCount).toBe(2);
    expect(schedule.find((slot) => slot.id === 2)).toBeUndefined();
    expect(schedule.find((slot) => slot.id === 3)).toBeUndefined();
  });

  it('PATCH /api/clubs/[id] возвращает 400 для невалидного payload и не меняет данные', async () => {
    const clubsBefore = await getClubs();
    const offeringsBefore = await getOfferings();
    const scheduleBefore = await getSchedule({ ownerType: 'all' });

    const response = await PATCH(
      new Request('http://localhost:3000/api/clubs/1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validClubPatchPayload,
          description: 'Коротко',
        }),
      }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Некорректные данные клуба');
    expect(await getClubs()).toEqual(clubsBefore);
    expect(await getOfferings()).toEqual(offeringsBefore);
    expect(await getSchedule({ ownerType: 'all' })).toEqual(scheduleBefore);
  });

  it('PATCH /api/clubs/[id] возвращает 404 для несуществующего клуба', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/clubs/999', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(validClubPatchPayload),
      }),
      {
        params: Promise.resolve({ id: '999' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Клуб не найден');
  });

  it('PATCH /api/clubs/[id] возвращает 403 для чужой публикации', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/clubs/1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validClubPatchPayload,
          userId: 1,
        }),
      }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toMatch(/Недостаточно прав/i);
  });
});
