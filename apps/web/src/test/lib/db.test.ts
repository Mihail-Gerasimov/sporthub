import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getClubBySlug,
  getClubOfferings,
  getOfferings,
  getPublishedClubs,
  getPublishedTrainers,
  getSchedule,
  getScheduleById,
  getScheduleSlotContext,
  getTrainerById,
  getTrainerBySlug,
  getTrainerOfferings,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedDefaultTrainerClubLink, seedTestData } from '@/test/helpers/seed-fixtures';

describe('db abstraction', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    await seedDefaultTrainerClubLink(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  async function writeCollection(filename: string, data: unknown) {
    await writeFile(path.join(dataDirectory, filename), `${JSON.stringify(data, null, 2)}\n`);
  }

  it('читает offerings и разделяет услуги клубов и тренеров', async () => {
    const offerings = await getOfferings();
    const clubOfferings = await getClubOfferings(1);
    const trainerOfferings = await getTrainerOfferings(1);

    expect(offerings.some((offering) => offering.ownerType === 'club')).toBe(true);
    expect(offerings.some((offering) => offering.ownerType === 'trainer')).toBe(true);
    expect(clubOfferings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerType: 'club', ownerId: 1 })]),
    );
    expect(trainerOfferings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerType: 'trainer', ownerId: 1 })]),
    );
  });

  it('возвращает профиль тренера с независимыми адресом, координатами и sportIds', async () => {
    const trainer = await getTrainerById(1);

    expect(trainer).toMatchObject({
      id: 1,
      sportIds: [3],
      city: 'Самара',
      address: 'ул. Лесная, 23к1',
      coordinates: {
        lat: 53.2129,
        lng: 50.1245,
      },
    });
  });

  it('находит клуба и тренера по slug', async () => {
    const club = await getClubBySlug('volna-aquatic-club');
    const trainer = await getTrainerBySlug('marina-sokolova');

    expect(club).toMatchObject({
      id: 1,
      slug: 'volna-aquatic-club',
      name: 'Volna Aquatic Club',
    });
    expect(trainer).toMatchObject({
      id: 1,
      slug: 'marina-sokolova',
      name: 'Марина Соколова',
    });
  });

  it('возвращает null для несуществующего slug', async () => {
    await expect(getClubBySlug('missing-club')).resolves.toBeNull();
    await expect(getTrainerBySlug('missing-trainer')).resolves.toBeNull();
  });

  it('находит клуба и тренера по кириллическому slug и его encoded-версии', async () => {
    await Promise.all([
      writeCollection('clubs.json', [
        {
          id: 101,
          createdAt: '2026-03-30T12:00:00.000Z',
          name: 'Клуб МС',
          slug: 'клуб-мс',
          description: 'Клуб с кириллическим slug.',
          shortDescription: 'Клуб с кириллическим slug.',
          city: 'Саратов',
          address: 'спортивная 145',
          phone: '+7 (900) 000-00-00',
          coordinates: { lat: 0, lng: 0 },
          sportIds: [2],
          imageUrls: [],
          amenities: [],
          tags: [],
          rating: 0,
          reviewCount: 0,
          priceFrom: 1200,
          distanceKm: 0,
          managedByUserId: 2,
          source: 'provider' as const,
          status: 'published' as const,
        },
      ]),
      writeCollection('trainers.json', [
        {
          id: 201,
          createdAt: '2026-03-30T12:00:00.000Z',
          name: 'Иван МС',
          slug: 'иван-мс',
          bio: 'Тренер с кириллическим slug.',
          avatarUrl: '',
          experienceYears: 5,
          specialties: ['Бокс'],
          rating: 0,
          reviewCount: 0,
          priceFrom: 2200,
          sportIds: [2],
          city: 'Саратов',
          address: 'спортивная 145',
          coordinates: { lat: 0, lng: 0 },
          managedByUserId: 2,
          source: 'provider' as const,
          status: 'published' as const,
        },
      ]),
      writeCollection('offerings.json', []),
      writeCollection('schedule.json', []),
      writeCollection('reviews.json', []),
      writeCollection('bookings.json', []),
    ]);

    await expect(getClubBySlug('клуб-мс')).resolves.toMatchObject({
      id: 101,
      slug: 'клуб-мс',
      name: 'Клуб МС',
    });
    await expect(getClubBySlug('%D0%BA%D0%BB%D1%83%D0%B1-%D0%BC%D1%81')).resolves.toMatchObject({
      id: 101,
      slug: 'клуб-мс',
      name: 'Клуб МС',
    });
    await expect(getTrainerBySlug('иван-мс')).resolves.toMatchObject({
      id: 201,
      slug: 'иван-мс',
      name: 'Иван МС',
    });
    await expect(getTrainerBySlug('%D0%B8%D0%B2%D0%B0%D0%BD-%D0%BC%D1%81')).resolves.toMatchObject({
      id: 201,
      slug: 'иван-мс',
      name: 'Иван МС',
    });
  });

  it('по умолчанию возвращает только club schedule, а trainer slots доступны отдельным режимом', async () => {
    const defaultSchedule = await getSchedule();
    const trainerSchedule = await getSchedule({ ownerType: 'trainer' });

    expect(defaultSchedule.length).toBeGreaterThan(0);
    expect(defaultSchedule.every((slot) => slot.ownerType === 'club')).toBe(true);
    expect(trainerSchedule.length).toBeGreaterThan(0);
    expect(trainerSchedule.every((slot) => slot.ownerType === 'trainer')).toBe(true);
    expect(trainerSchedule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1001,
          offeringId: 101,
          ownerType: 'trainer',
          trainerId: 1,
        }),
      ]),
    );
  });

  it('резолвит slot context с offering и owner metadata для trainer услуги', async () => {
    const slot = await getScheduleById(1001);
    const slotContext = await getScheduleSlotContext(1001);

    expect(slot).toMatchObject({
      id: 1001,
      offeringId: 101,
      ownerType: 'trainer',
      ownerId: 1,
      trainerId: 1,
      clubId: undefined,
    });
    expect(slotContext).toMatchObject({
      schedule: expect.objectContaining({
        id: 1001,
        offeringId: 101,
      }),
      offering: expect.objectContaining({
        id: 101,
        ownerType: 'trainer',
        ownerId: 1,
        format: 'personal',
      }),
      trainer: expect.objectContaining({
        id: 1,
        name: 'Марина Соколова',
      }),
      affiliatedClub: expect.objectContaining({
        id: 1,
        name: 'Volna Aquatic Club',
      }),
    });
  });

  // Phase 27 Step 27.12: hidden-публикации не должны утекать на публичные SSR-витрины.
  // Семантика — `!== 'hidden'`: published, draft и записи без поля status проходят
  // (симметрично фильтру в /api/clubs и /api/trainers route.ts).
  it('getPublishedClubs отфильтровывает status=hidden, оставляя published/draft/undefined', async () => {
    await writeCollection('clubs.json', [
      {
        id: 301,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Published Club',
        slug: 'published-club',
        description: 'Опубликованный.',
        shortDescription: 'Опубликованный.',
        city: 'Самара',
        address: 'ул. 1',
        phone: '+7 (846) 000-00-01',
        coordinates: { lat: 53.2, lng: 50.15 },
        sportIds: [1],
        imageUrls: [],
        amenityIds: [],
        tagIds: [],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1000,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'provider' as const,
        status: 'published' as const,
      },
      {
        id: 302,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Hidden Club',
        slug: 'hidden-club',
        description: 'Скрытый админом.',
        shortDescription: 'Скрытый.',
        city: 'Самара',
        address: 'ул. 2',
        phone: '+7 (846) 000-00-02',
        coordinates: { lat: 53.2, lng: 50.15 },
        sportIds: [1],
        imageUrls: [],
        amenityIds: [],
        tagIds: [],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1000,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'provider' as const,
        status: 'hidden' as const,
      },
      {
        id: 303,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Draft Club',
        slug: 'draft-club',
        description: 'Черновик.',
        shortDescription: 'Черновик.',
        city: 'Самара',
        address: 'ул. 3',
        phone: '+7 (846) 000-00-03',
        coordinates: { lat: 53.2, lng: 50.15 },
        sportIds: [1],
        imageUrls: [],
        amenityIds: [],
        tagIds: [],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1000,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'provider' as const,
        status: 'draft' as const,
      },
      {
        id: 304,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Legacy Club Without Status',
        slug: 'legacy-no-status',
        description: 'Запись без поля status (legacy/seed).',
        shortDescription: 'Legacy.',
        city: 'Самара',
        address: 'ул. 4',
        phone: '+7 (846) 000-00-04',
        coordinates: { lat: 53.2, lng: 50.15 },
        sportIds: [1],
        imageUrls: [],
        amenityIds: [],
        tagIds: [],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1000,
        distanceKm: 0,
        managedByUserId: 2,
        source: 'provider' as const,
        // status намеренно опущен
      },
    ]);

    const published = await getPublishedClubs();
    const ids = published.map((club) => club.id);

    expect(ids).toContain(301);
    expect(ids).toContain(303);
    expect(ids).toContain(304);
    expect(ids).not.toContain(302);
  });

  it('getPublishedTrainers отфильтровывает status=hidden, оставляя published/draft/undefined', async () => {
    await writeCollection('trainers.json', [
      {
        id: 401,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Published Trainer',
        slug: 'published-trainer',
        bio: 'Опубликованный тренер.',
        avatarUrl: '',
        experienceYears: 5,
        specialtyIds: [1],
        workFormatIds: [1],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2000,
        sportIds: [2],
        city: 'Самара',
        address: 'Зал',
        coordinates: { lat: 53.2, lng: 50.15 },
        managedByUserId: 2,
        source: 'provider' as const,
        status: 'published' as const,
      },
      {
        id: 402,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Hidden Trainer',
        slug: 'hidden-trainer',
        bio: 'Скрытый админом.',
        avatarUrl: '',
        experienceYears: 5,
        specialtyIds: [1],
        workFormatIds: [1],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2000,
        sportIds: [2],
        city: 'Самара',
        address: 'Зал',
        coordinates: { lat: 53.2, lng: 50.15 },
        managedByUserId: 2,
        source: 'provider' as const,
        status: 'hidden' as const,
      },
      {
        id: 403,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Draft Trainer',
        slug: 'draft-trainer',
        bio: 'Черновик.',
        avatarUrl: '',
        experienceYears: 5,
        specialtyIds: [1],
        workFormatIds: [1],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2000,
        sportIds: [2],
        city: 'Самара',
        address: 'Зал',
        coordinates: { lat: 53.2, lng: 50.15 },
        managedByUserId: 2,
        source: 'provider' as const,
        status: 'draft' as const,
      },
      {
        id: 404,
        createdAt: '2026-04-27T09:00:00.000Z',
        name: 'Legacy Trainer Without Status',
        slug: 'legacy-trainer-no-status',
        bio: 'Запись без поля status (legacy/seed).',
        avatarUrl: '',
        experienceYears: 5,
        specialtyIds: [1],
        workFormatIds: [1],
        rating: 0,
        reviewCount: 0,
        priceFrom: 2000,
        sportIds: [2],
        city: 'Самара',
        address: 'Зал',
        coordinates: { lat: 53.2, lng: 50.15 },
        managedByUserId: 2,
        source: 'provider' as const,
        // status намеренно опущен
      },
    ]);

    const published = await getPublishedTrainers();
    const ids = published.map((trainer) => trainer.id);

    expect(ids).toContain(401);
    expect(ids).toContain(403);
    expect(ids).toContain(404);
    expect(ids).not.toContain(402);
  });
});
