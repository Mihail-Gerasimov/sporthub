import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as GETTrainerDetail } from '@/app/api/trainers/[id]/route';
import { GET as GETTrainers, POST } from '@/app/api/trainers/route';
import { getOfferings, getSchedule, getTrainers } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const validTrainerPayload = {
  firstName: 'Александр',
  lastName: 'Иванов',
  city: 'Москва',
  address: 'ул. Спортивная, 10',
  bio: 'Персональный тренер по боксу. Готовлю к соревнованиям и работаю с начинающими. Стаж более 8 лет.',
  experience: '8',
  sport: 'Бокс',
  specializations: ['Персональные тренировки', 'Подготовка к соревнованиям'],
  workFormat: 'В клубе',
  offeringName: 'Персональная тренировка по боксу',
  offeringDescription: 'Индивидуальное занятие: техника ударов, защита, работа на снарядах.',
  offeringFormat: 'Индивидуальная',
  offeringPrice: '2500',
  offeringDuration: '60',
  offeringLocation: 'Зал единоборств',
  clubId: 1,
  scheduleSlots: [
    {
      title: 'Утренняя тренировка',
      date: '2026-04-01',
      startTime: '09:00',
      endTime: '10:00',
      price: '2500',
      capacity: '1',
      location: 'Зал единоборств',
      discipline: 'Бокс',
    },
  ],
  userId: 2,
};

describe('Trainers API', () => {
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

  it('GET /api/trainers фильтрует тренеров по venue affiliatedClubId и sportId', async () => {
    const response = await GETTrainers(
      new NextRequest('http://localhost:3000/api/trainers?affiliatedClubId=1&sportId=3'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(
      body.data.every((trainer: { id: number; sportIds: number[] }) =>
        trainer.sportIds.includes(3),
      ),
    ).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 1,
      slug: 'marina-sokolova',
    });
  });

  it('GET /api/trainers/[id] возвращает независимую карточку тренера с offerings, trainer slots и отзывами', async () => {
    const response = await GETTrainerDetail(new Request('http://localhost:3000/api/trainers/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      trainer: {
        id: 1,
        slug: 'marina-sokolova',
      },
      affiliatedClub: {
        id: 1,
        slug: 'volna-aquatic-club',
      },
    });
    expect(body.data.sports).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 3, slug: 'swimming' })]),
    );
    expect(body.data.offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 101,
          ownerType: 'trainer',
          ownerId: 1,
          format: 'personal',
        }),
      ]),
    );
    expect(body.data.schedule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1001,
          offeringId: 101,
          ownerType: 'trainer',
          ownerId: 1,
          trainerId: 1,
        }),
      ]),
    );
    expect(
      body.data.schedule.every(
        (slot: { ownerType: string; trainerId?: number }) =>
          slot.ownerType === 'trainer' && slot.trainerId === 1,
      ),
    ).toBe(true);
    expect(body.data.reviews.length).toBeGreaterThan(0);
  });

  it('POST /api/trainers создаёт тренера, offering и schedule через publish payload', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/trainers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(validTrainerPayload),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data.trainer).toMatchObject({
      name: 'Александр Иванов',
      managedByUserId: 2,
      source: 'provider',
      status: 'published',
      affiliatedClubId: 1,
    });
    expect(body.data.offering).toMatchObject({
      ownerType: 'trainer',
      ownerId: body.data.trainer.id,
      affiliatedClubId: 1,
    });
    expect(body.data.schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          ownerType: 'trainer',
          ownerId: body.data.trainer.id,
          trainerId: body.data.trainer.id,
          offeringId: body.data.offering.id,
          affiliatedClubId: 1,
        }),
      ]),
    );

    const trainers = await getTrainers();
    const offerings = await getOfferings();
    const schedule = await getSchedule({ ownerType: 'trainer' });

    expect(trainers.some((trainer) => trainer.id === body.data.trainer.id)).toBe(true);
    expect(offerings.some((offering) => offering.id === body.data.offering.id)).toBe(true);
    expect(schedule.some((slot) => slot.id === body.data.schedules[0].id)).toBe(true);
  });

  it('POST /api/trainers возвращает 400 для невалидного payload и ничего не записывает', async () => {
    const trainersBefore = await getTrainers();
    const offeringsBefore = await getOfferings();
    const scheduleBefore = await getSchedule({ ownerType: 'all' });

    const response = await POST(
      new Request('http://localhost:3000/api/trainers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validTrainerPayload,
          bio: 'Коротко',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Некорректные данные тренера');

    const trainersAfter = await getTrainers();
    const offeringsAfter = await getOfferings();
    const scheduleAfter = await getSchedule({ ownerType: 'all' });

    expect(trainersAfter).toEqual(trainersBefore);
    expect(offeringsAfter).toEqual(offeringsBefore);
    expect(scheduleAfter).toEqual(scheduleBefore);
  });

  it('POST /api/trainers возвращает 404 если пользователь не найден', async () => {
    const trainersBefore = await getTrainers();

    const response = await POST(
      new Request('http://localhost:3000/api/trainers', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validTrainerPayload,
          userId: 999,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Пользователь не найден');

    const trainersAfter = await getTrainers();

    expect(trainersAfter).toEqual(trainersBefore);
  });
});
