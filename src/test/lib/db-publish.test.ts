// Тесты atomic JSON write-flow для публикации клуба и тренера (Step 14.5)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __setWriteCollectionTestHookForTests,
  createClubPublication,
  createTrainerPublication,
  getClubs,
  getOfferings,
  getSchedule,
  getTrainers,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

/* Входные данные — результат контракт-маппинга (без реальных ID) */

const clubInput = {
  club: {
    name: 'Test Club',
    slug: 'test-club',
    description: 'Описание тестового клуба для проверки создания.',
    shortDescription: 'Тестовый клуб.',
    city: 'Самара',
    address: 'ул. Тестовая, 1',
    phone: '+7 (846) 000-00-00',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [1],
    imageUrls: [],
    amenities: ['Парковка'],
    tags: ['Тест'],
    rating: 0,
    reviewCount: 0,
    priceFrom: 1000,
    distanceKm: 0,
    isFeatured: false,
    managedByUserId: 2,
    source: 'provider' as const,
    status: 'published' as const,
  },
  offering: {
    ownerType: 'club' as const,
    sportId: 1,
    title: 'Занятия — Test Club',
    description: 'Описание тестового клуба для проверки создания.',
    format: 'group' as const,
    price: 1000,
    durationMinutes: 60,
    capacity: 20,
    address: 'ул. Тестовая, 1',
    coordinates: { lat: 0, lng: 0 },
  },
  schedules: [
    {
      ownerType: 'club' as const,
      sportId: 1,
      title: 'Утренняя йога',
      date: '2026-04-01',
      startTime: '08:00',
      endTime: '09:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 15,
      bookedCount: 0,
      price: 900,
      room: 'Зал №1',
    },
  ],
};

const trainerInput = {
  trainer: {
    name: 'Тест Тренер',
    slug: 'тест-тренер',
    bio: 'Тестовый тренер для проверки создания.',
    avatarUrl: '',
    experienceYears: 5,
    specialties: ['Бокс'],
    rating: 0,
    reviewCount: 0,
    priceFrom: 2000,
    sportIds: [2],
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 0, lng: 0 },
    managedByUserId: 2,
    source: 'provider' as const,
    status: 'published' as const,
  },
  offering: {
    ownerType: 'trainer' as const,
    sportId: 2,
    title: 'Персональная тренировка по боксу',
    description: 'Индивидуальное занятие.',
    format: 'personal' as const,
    price: 2000,
    durationMinutes: 60,
    capacity: 1,
    address: 'Зал единоборств',
    coordinates: { lat: 0, lng: 0 },
  },
  schedules: [
    {
      ownerType: 'trainer' as const,
      sportId: 2,
      title: 'Утренняя тренировка',
      date: '2026-04-01',
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 1,
      bookedCount: 0,
      price: 2000,
      room: 'Зал единоборств',
    },
  ],
};

describe('db publish — atomic create (Step 14.5)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    __setWriteCollectionTestHookForTests(null);
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  /* --- Club publication --- */

  describe('createClubPublication', () => {
    it('создаёт клуб, offering и schedule[] в JSON-файлах', async () => {
      const result = await createClubPublication(clubInput);

      expect(result.club.name).toBe('Test Club');
      expect(result.offering.title).toBe('Занятия — Test Club');
      expect(result.schedules).toHaveLength(1);
    });

    it('назначает ID через max(existing)+1', async () => {
      const clubsBefore = await getClubs();
      const maxClubId = Math.max(...clubsBefore.map((c) => c.id));

      const result = await createClubPublication(clubInput);

      expect(result.club.id).toBe(maxClubId + 1);
    });

    it('проставляет createdAt на всех сущностях', async () => {
      const result = await createClubPublication(clubInput);

      expect(result.club.createdAt).toBeTruthy();
      expect(result.offering.createdAt).toBeTruthy();
      expect(result.schedules[0].createdAt).toBeTruthy();
    });

    it('кросс-ссылки согласованы: offering.ownerId = club.id, schedule[].clubId = club.id', async () => {
      const result = await createClubPublication(clubInput);

      expect(result.offering.ownerId).toBe(result.club.id);
      expect(result.offering.affiliatedClubId).toBe(result.club.id);
      expect(result.schedules[0].ownerId).toBe(result.club.id);
      expect(result.schedules[0].clubId).toBe(result.club.id);
      expect(result.schedules[0].offeringId).toBe(result.offering.id);
    });

    it('данные читаются обратно из JSON через getClubs/getOfferings/getSchedule', async () => {
      const result = await createClubPublication(clubInput);

      const clubs = await getClubs();
      const offerings = await getOfferings();
      const schedule = await getSchedule({ ownerType: 'club' });

      expect(clubs.find((c) => c.id === result.club.id)).toBeTruthy();
      expect(offerings.find((o) => o.id === result.offering.id)).toBeTruthy();
      expect(schedule.find((s) => s.id === result.schedules[0].id)).toBeTruthy();
    });

    it('не затирает существующие данные', async () => {
      const clubsBefore = await getClubs();
      await createClubPublication(clubInput);
      const clubsAfter = await getClubs();

      expect(clubsAfter.length).toBe(clubsBefore.length + 1);
      // Старые клубы на месте
      for (const club of clubsBefore) {
        expect(clubsAfter.find((c) => c.id === club.id)).toBeTruthy();
      }
    });
  });

  /* --- Trainer publication --- */

  describe('createTrainerPublication', () => {
    it('создаёт тренера, offering и schedule[] в JSON-файлах', async () => {
      const result = await createTrainerPublication(trainerInput);

      expect(result.trainer.name).toBe('Тест Тренер');
      expect(result.offering.title).toBe('Персональная тренировка по боксу');
      expect(result.schedules).toHaveLength(1);
    });

    it('назначает ID через max(existing)+1', async () => {
      const trainersBefore = await getTrainers();
      const maxTrainerId = Math.max(...trainersBefore.map((t) => t.id));

      const result = await createTrainerPublication(trainerInput);

      expect(result.trainer.id).toBe(maxTrainerId + 1);
    });

    it('кросс-ссылки согласованы: offering.ownerId = trainer.id, schedule[].trainerId = trainer.id', async () => {
      const result = await createTrainerPublication(trainerInput);

      expect(result.offering.ownerId).toBe(result.trainer.id);
      expect(result.schedules[0].ownerId).toBe(result.trainer.id);
      expect(result.schedules[0].trainerId).toBe(result.trainer.id);
      expect(result.schedules[0].offeringId).toBe(result.offering.id);
    });

    it('данные читаются обратно из JSON через getTrainers/getOfferings/getSchedule', async () => {
      const result = await createTrainerPublication(trainerInput);

      const trainers = await getTrainers();
      const offerings = await getOfferings();
      const schedule = await getSchedule({ ownerType: 'trainer' });

      expect(trainers.find((t) => t.id === result.trainer.id)).toBeTruthy();
      expect(offerings.find((o) => o.id === result.offering.id)).toBeTruthy();
      expect(schedule.find((s) => s.id === result.schedules[0].id)).toBeTruthy();
    });

    it('с clubId — проставляет affiliatedClubId на тренере и offering', async () => {
      const inputWithClub = {
        ...trainerInput,
        trainer: { ...trainerInput.trainer, affiliatedClubId: 1 },
        offering: { ...trainerInput.offering, affiliatedClubId: 1 },
      };
      const result = await createTrainerPublication(inputWithClub);

      expect(result.trainer.affiliatedClubId).toBe(1);
      expect(result.offering.affiliatedClubId).toBe(1);
    });

    it('не затирает существующие данные', async () => {
      const trainersBefore = await getTrainers();
      await createTrainerPublication(trainerInput);
      const trainersAfter = await getTrainers();

      expect(trainersAfter.length).toBe(trainersBefore.length + 1);
    });
  });

  /* --- Множественные слоты --- */

  it('создаёт несколько schedule-слотов с уникальными ID', async () => {
    const multiSlotInput = {
      ...clubInput,
      schedules: [
        ...clubInput.schedules,
        {
          ownerType: 'club' as const,
          sportId: 1,
          title: 'Вечерняя йога',
          date: '2026-04-01',
          startTime: '19:00',
          endTime: '20:00',
          durationMinutes: 60,
          level: 'all_levels' as const,
          capacity: 10,
          bookedCount: 0,
          price: 1000,
          room: 'Зал №2',
        },
      ],
    };

    const result = await createClubPublication(multiSlotInput);

    expect(result.schedules).toHaveLength(2);
    expect(result.schedules[0].id).not.toBe(result.schedules[1].id);
    // Оба ссылаются на один offering
    expect(result.schedules[0].offeringId).toBe(result.offering.id);
    expect(result.schedules[1].offeringId).toBe(result.offering.id);
  });

  it('при ошибке записи откатывает уже изменённые коллекции и не оставляет partial write', async () => {
    const clubsBefore = await getClubs();
    const offeringsBefore = await getOfferings();
    const scheduleBefore = await getSchedule({ ownerType: 'all' });
    let shouldFail = true;

    __setWriteCollectionTestHookForTests((key) => {
      if (shouldFail && key === 'offerings') {
        shouldFail = false;
        throw new Error('Simulated write failure');
      }
    });

    await expect(createClubPublication(clubInput)).rejects.toThrow('Simulated write failure');

    const clubsAfter = await getClubs();
    const offeringsAfter = await getOfferings();
    const scheduleAfter = await getSchedule({ ownerType: 'all' });

    expect(clubsAfter).toEqual(clubsBefore);
    expect(offeringsAfter).toEqual(offeringsBefore);
    expect(scheduleAfter).toEqual(scheduleBefore);
  });
});
