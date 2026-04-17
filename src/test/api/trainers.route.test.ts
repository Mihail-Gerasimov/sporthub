import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as GETTrainerDetail, PATCH } from '@/app/api/trainers/[id]/route';
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
  sportIds: [2],
  specialtyIds: [1, 2],
  workFormatIds: [1],
  phone: '+7 (846) 300-00-11',
  vk: '',
  telegram: '',
  facebook: '',
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

const validTrainerPatchPayload = {
  firstName: 'Марина',
  lastName: 'Сергеевна',
  city: 'Самара',
  address: 'ул. Лесная, 25',
  bio: 'Обновлённая биография тренера для edit-flow. Больше внимания технике, постановке дыхания и персональной подготовке к заплывам.',
  experience: '10',
  sportIds: [3],
  specialtyIds: [1, 2],
  workFormatIds: [1],
  phone: '+7 (846) 300-00-11',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная тренировка: Плавание PRO',
  offeringDescription:
    'Новая версия основной услуги тренера с акцентом на технику и персональный план.',
  offeringFormat: 'Индивидуальная',
  offeringPrice: '1900',
  offeringDuration: '75',
  offeringLocation: 'Бассейн 2',
  clubId: 2,
  scheduleSlots: [
    {
      id: 1001,
      title: 'Индивидуальная работа на технику',
      date: '2026-04-04',
      startTime: '09:00',
      endTime: '10:15',
      price: '1900',
      capacity: '1',
      location: 'Бассейн 2',
      discipline: 'Плавание',
    },
    {
      title: 'Вечерняя персональная тренировка',
      date: '2026-04-05',
      startTime: '18:00',
      endTime: '19:00',
      price: '2100',
      capacity: '1',
      location: 'Бассейн 2',
      discipline: 'Плавание',
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

  it('GET /api/trainers/[id] возвращает данные, достаточные для bootstrap edit-flow тренера', async () => {
    const response = await GETTrainerDetail(new Request('http://localhost:3000/api/trainers/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.offerings[0]).toMatchObject({
      id: 101,
      ownerType: 'trainer',
      ownerId: 1,
      affiliatedClubId: 1,
    });
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
    expect(body.data.club).toMatchObject({
      id: 1,
      slug: 'volna-aquatic-club',
    });
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

  it('PATCH /api/trainers/[id] обновляет тренера, primary offering и расписание через publish-схему', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/trainers/1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(validTrainerPatchPayload),
      }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.trainer).toMatchObject({
      id: 1,
      name: 'Марина Сергеевна',
      slug: 'marina-sokolova',
      managedByUserId: 2,
      affiliatedClubId: 2,
    });
    expect(body.data.offering).toMatchObject({
      id: 101,
      ownerType: 'trainer',
      ownerId: 1,
      affiliatedClubId: 2,
      title: 'Персональная тренировка: Плавание PRO',
    });
    expect(body.data.schedules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1001,
          ownerType: 'trainer',
          ownerId: 1,
          trainerId: 1,
          offeringId: 101,
          bookedCount: 0,
        }),
      ]),
    );

    const trainers = await getTrainers();
    const offerings = await getOfferings();
    const schedule = (await getSchedule({ ownerType: 'trainer' })).filter(
      (slot) => slot.trainerId === 1,
    );

    expect(trainers.find((trainer) => trainer.id === 1)?.name).toBe('Марина Сергеевна');
    expect(
      offerings.filter((offering) => offering.ownerType === 'trainer' && offering.ownerId === 1),
    ).toHaveLength(1);
    expect(schedule).toHaveLength(2);
    expect(schedule.find((slot) => slot.id === 1001)?.bookedCount).toBe(0);
  });

  it('PATCH /api/trainers/[id] возвращает 400 для невалидного payload и не меняет данные', async () => {
    const trainersBefore = await getTrainers();
    const offeringsBefore = await getOfferings();
    const scheduleBefore = await getSchedule({ ownerType: 'all' });

    const response = await PATCH(
      new Request('http://localhost:3000/api/trainers/1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validTrainerPatchPayload,
          bio: 'Коротко',
        }),
      }),
      {
        params: Promise.resolve({ id: '1' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Некорректные данные тренера');
    expect(await getTrainers()).toEqual(trainersBefore);
    expect(await getOfferings()).toEqual(offeringsBefore);
    expect(await getSchedule({ ownerType: 'all' })).toEqual(scheduleBefore);
  });

  it('PATCH /api/trainers/[id] возвращает 404 для несуществующего тренера', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/trainers/999', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify(validTrainerPatchPayload),
      }),
      {
        params: Promise.resolve({ id: '999' }),
      },
    );
    const body = await response.json();

    expect(response.status).toBe(404);
    expect(body.success).toBe(false);
    expect(body.error).toBe('Тренер не найден');
  });

  it('PATCH /api/trainers/[id] возвращает 403 для чужой публикации', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/trainers/1', {
        method: 'PATCH',
        headers: {
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          ...validTrainerPatchPayload,
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
