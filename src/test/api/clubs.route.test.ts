import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
