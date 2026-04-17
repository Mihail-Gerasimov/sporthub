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
  updateClubPublication,
  updateTrainerPublication,
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
    amenityIds: [1],
    tagIds: [1],
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
    specialtyIds: [1],
    workFormatIds: [1],
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

const clubUpdateInput = {
  clubId: 1,
  userId: 2,
  club: {
    name: 'Volna Aquatic Club Premium',
    slug: 'slug-не-должен-меняться',
    description:
      'Обновлённое описание клуба для проверки atomic update-flow и сохранения системных полей.',
    shortDescription: 'Обновлённое описание клуба.',
    city: 'Самара',
    address: 'ул. Лесная, 25',
    phone: '+7 (846) 200-11-99',
    email: 'premium@volna-club.ru',
    website: 'https://new-volna.example',
    coordinates: { lat: 53.2135, lng: 50.1251 },
    sportIds: [3, 8],
    imageUrls: ['/images/should-not-overwrite.jpg'],
    amenityIds: [1, 2],
    tagIds: [1, 2],
    rating: 0,
    reviewCount: 0,
    priceFrom: 1500,
    distanceKm: 99,
    isFeatured: false,
    managedByUserId: 999,
    source: 'provider' as const,
    status: 'draft' as const,
  },
  offering: {
    ownerType: 'club' as const,
    sportId: 3,
    title: 'Занятия — Volna Aquatic Club Premium',
    description: 'Новая основная услуга клуба с обновлённым описанием.',
    format: 'group' as const,
    price: 1500,
    durationMinutes: 75,
    capacity: 18,
    address: 'ул. Лесная, 25',
    coordinates: { lat: 53.2135, lng: 50.1251 },
  },
  schedules: [
    {
      id: 1,
      ownerType: 'club' as const,
      sportId: 3,
      title: 'Утреннее плавание PRO',
      date: '2026-04-02',
      startTime: '07:30',
      endTime: '08:45',
      durationMinutes: 75,
      level: 'all_levels' as const,
      capacity: 16,
      bookedCount: 99,
      price: 1500,
      room: 'Большой бассейн',
    },
    {
      ownerType: 'club' as const,
      sportId: 8,
      title: 'Вечерний пилатес',
      date: '2026-04-03',
      startTime: '18:30',
      endTime: '19:30',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 10,
      bookedCount: 0,
      price: 1200,
      room: 'Студия пилатеса',
    },
  ],
};

const trainerUpdateInput = {
  trainerId: 1,
  userId: 2,
  trainer: {
    name: 'Марина Сергеевна',
    slug: 'slug-не-должен-меняться',
    bio: 'Обновлённая биография тренера для проверки редактирования существующей публикации.',
    avatarUrl: '/avatars/should-not-overwrite.jpg',
    experienceYears: 10,
    specialtyIds: [1, 2],
    workFormatIds: [1],
    rating: 0,
    reviewCount: 0,
    priceFrom: 1900,
    sportIds: [3],
    city: 'Самара',
    address: 'ул. Лесная, 25',
    coordinates: { lat: 53.2135, lng: 50.1251 },
    affiliatedClubId: 2,
    managedByUserId: 999,
    source: 'provider' as const,
    status: 'draft' as const,
  },
  offering: {
    ownerType: 'trainer' as const,
    sportId: 3,
    title: 'Персональная тренировка: Плавание PRO',
    description: 'Новая версия основной услуги тренера.',
    format: 'personal' as const,
    price: 1900,
    durationMinutes: 75,
    capacity: 1,
    address: 'ул. Лесная, 25',
    coordinates: { lat: 53.2135, lng: 50.1251 },
    affiliatedClubId: 2,
  },
  schedules: [
    {
      id: 1001,
      ownerType: 'trainer' as const,
      sportId: 3,
      title: 'Индивидуальная работа на технику',
      date: '2026-04-04',
      startTime: '09:00',
      endTime: '10:15',
      durationMinutes: 75,
      level: 'all_levels' as const,
      capacity: 1,
      bookedCount: 99,
      price: 1900,
      room: 'Бассейн 2',
    },
    {
      ownerType: 'trainer' as const,
      sportId: 3,
      title: 'Вечерняя персональная тренировка',
      date: '2026-04-05',
      startTime: '18:00',
      endTime: '19:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 1,
      bookedCount: 0,
      price: 2100,
      room: 'Бассейн 2',
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

  /* --- Update клуба --- */

  describe('updateClubPublication', () => {
    it('обновляет существующий клуб, не создаёт дубликат offering и диффит расписание', async () => {
      const clubBefore = (await getClubs()).find((club) => club.id === clubUpdateInput.clubId);
      const offeringBefore = (await getOfferings()).find((offering) => offering.id === 1);
      const scheduleBefore = (await getSchedule({ ownerType: 'all' })).filter(
        (slot) => slot.clubId === clubUpdateInput.clubId,
      );

      expect(clubBefore).toBeTruthy();
      expect(offeringBefore).toBeTruthy();
      expect(scheduleBefore).toHaveLength(3);

      const result = await updateClubPublication(clubUpdateInput);

      expect(result.club.id).toBe(clubUpdateInput.clubId);
      expect(result.club.name).toBe('Volna Aquatic Club Premium');
      expect(result.club.slug).toBe(clubBefore?.slug);
      expect(result.club.createdAt).toBe(clubBefore?.createdAt);
      expect(result.club.managedByUserId).toBe(clubBefore?.managedByUserId);
      expect(result.club.imageUrls).toEqual(clubBefore?.imageUrls);
      expect(result.club.rating).toBe(clubBefore?.rating);

      expect(result.offering.id).toBe(offeringBefore?.id);
      expect(result.offering.ownerId).toBe(clubUpdateInput.clubId);
      expect(result.offering.affiliatedClubId).toBe(clubUpdateInput.clubId);

      expect(result.schedules).toHaveLength(2);
      expect(result.schedules.find((slot) => slot.id === 1)?.createdAt).toBe(
        scheduleBefore.find((slot) => slot.id === 1)?.createdAt,
      );
      expect(result.schedules.find((slot) => slot.id === 1)?.bookedCount).toBe(
        scheduleBefore.find((slot) => slot.id === 1)?.bookedCount,
      );

      const offeringsAfter = await getOfferings();
      const clubOfferingsAfter = offeringsAfter.filter(
        (offering) => offering.ownerType === 'club' && offering.ownerId === clubUpdateInput.clubId,
      );
      const clubScheduleAfter = (await getSchedule({ ownerType: 'all' })).filter(
        (slot) => slot.clubId === clubUpdateInput.clubId,
      );
      const newSlot = clubScheduleAfter.find((slot) => slot.id !== 1);

      expect(clubOfferingsAfter).toHaveLength(1);
      expect(clubScheduleAfter).toHaveLength(2);
      expect(clubScheduleAfter.find((slot) => slot.id === 2)).toBeUndefined();
      expect(clubScheduleAfter.find((slot) => slot.id === 3)).toBeUndefined();
      expect(newSlot).toBeTruthy();
      expect(newSlot?.createdAt).toBeTruthy();
      expect(newSlot?.bookedCount).toBe(0);
    });

    it('отклоняет update чужого клуба по ownership guard', async () => {
      await expect(
        updateClubPublication({
          ...clubUpdateInput,
          userId: 999,
        }),
      ).rejects.toThrow(/прав/i);
    });

    it('не делает partial write при ошибке записи во время update клуба', async () => {
      const clubsBefore = await getClubs();
      const offeringsBefore = await getOfferings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      let shouldFail = true;

      __setWriteCollectionTestHookForTests((key) => {
        if (shouldFail && key === 'schedule') {
          shouldFail = false;
          throw new Error('Simulated update write failure');
        }
      });

      await expect(updateClubPublication(clubUpdateInput)).rejects.toThrow(
        'Simulated update write failure',
      );

      const clubsAfter = await getClubs();
      const offeringsAfter = await getOfferings();
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(clubsAfter).toEqual(clubsBefore);
      expect(offeringsAfter).toEqual(offeringsBefore);
      expect(scheduleAfter).toEqual(scheduleBefore);
    });
  });

  /* --- Update тренера --- */

  describe('updateTrainerPublication', () => {
    it('обновляет существующего тренера, сохраняет slug и primary offering, обновляет расписание по diff', async () => {
      const trainerBefore = (await getTrainers()).find(
        (trainer) => trainer.id === trainerUpdateInput.trainerId,
      );
      const offeringBefore = (await getOfferings()).find((offering) => offering.id === 101);
      const scheduleBefore = (await getSchedule({ ownerType: 'trainer' })).filter(
        (slot) => slot.trainerId === trainerUpdateInput.trainerId,
      );

      expect(trainerBefore).toBeTruthy();
      expect(offeringBefore).toBeTruthy();
      expect(scheduleBefore).toHaveLength(1);

      const result = await updateTrainerPublication(trainerUpdateInput);

      expect(result.trainer.id).toBe(trainerUpdateInput.trainerId);
      expect(result.trainer.name).toBe('Марина Сергеевна');
      expect(result.trainer.slug).toBe(trainerBefore?.slug);
      expect(result.trainer.createdAt).toBe(trainerBefore?.createdAt);
      expect(result.trainer.managedByUserId).toBe(trainerBefore?.managedByUserId);
      expect(result.trainer.avatarUrl).toBe(trainerBefore?.avatarUrl);
      expect(result.trainer.rating).toBe(trainerBefore?.rating);

      expect(result.offering.id).toBe(offeringBefore?.id);
      expect(result.offering.ownerId).toBe(trainerUpdateInput.trainerId);
      expect(result.offering.affiliatedClubId).toBe(2);

      expect(result.schedules).toHaveLength(2);
      expect(result.schedules.find((slot) => slot.id === 1001)?.createdAt).toBe(
        scheduleBefore.find((slot) => slot.id === 1001)?.createdAt,
      );
      expect(result.schedules.find((slot) => slot.id === 1001)?.bookedCount).toBe(
        scheduleBefore.find((slot) => slot.id === 1001)?.bookedCount,
      );

      const offeringsAfter = await getOfferings();
      const trainerOfferingsAfter = offeringsAfter.filter(
        (offering) =>
          offering.ownerType === 'trainer' && offering.ownerId === trainerUpdateInput.trainerId,
      );
      const trainerScheduleAfter = (await getSchedule({ ownerType: 'trainer' })).filter(
        (slot) => slot.trainerId === trainerUpdateInput.trainerId,
      );
      const newSlot = trainerScheduleAfter.find((slot) => slot.id !== 1001);

      expect(trainerOfferingsAfter).toHaveLength(1);
      expect(trainerScheduleAfter).toHaveLength(2);
      expect(newSlot).toBeTruthy();
      expect(newSlot?.createdAt).toBeTruthy();
      expect(newSlot?.bookedCount).toBe(0);
    });

    it('отклоняет update несуществующего тренера', async () => {
      await expect(
        updateTrainerPublication({
          ...trainerUpdateInput,
          trainerId: 9999,
        }),
      ).rejects.toThrow(/не найден/i);
    });

    it('отклоняет update чужого тренера по ownership guard', async () => {
      await expect(
        updateTrainerPublication({
          ...trainerUpdateInput,
          userId: 999,
        }),
      ).rejects.toThrow(/прав/i);
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
