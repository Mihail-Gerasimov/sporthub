// Тесты модерации публикаций (Phase 22)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createClubPublication,
  createTrainerPublication,
  getClubs,
  getTrainers,
  hideEntity,
  unhideEntity,
  updateClubPublication,
  updateTrainerPublication,
  getBookings,
  getLogs,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

/* --- Фикстуры --- */

const clubInput = {
  club: {
    name: 'Клуб для модерации',
    slug: 'moderation-club',
    description: 'Описание клуба для тестов модерации.',
    shortDescription: 'Тестовый клуб.',
    city: 'Самара',
    address: 'ул. Тестовая, 1',
    phone: '+7 (846) 000-00-00',
    coordinates: { lat: 0, lng: 0 },
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
  offering: {
    ownerType: 'club' as const,
    sportId: 1,
    title: 'Занятия — Модерация',
    description: 'Описание.',
    format: 'group' as const,
    price: 1000,
    durationMinutes: 60,
    capacity: 10,
    address: 'ул. Тестовая, 1',
    coordinates: { lat: 0, lng: 0 },
  },
  schedules: [
    {
      ownerType: 'club' as const,
      sportId: 1,
      title: 'Утренняя йога',
      date: '2026-04-20',
      startTime: '08:00',
      endTime: '09:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 10,
      bookedCount: 0,
      price: 1000,
      room: 'Зал №1',
    },
  ],
};

const trainerInput = {
  trainer: {
    name: 'Тренер для модерации',
    slug: 'moderation-trainer',
    bio: 'Тестовый тренер.',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 0,
    reviewCount: 0,
    priceFrom: 2000,
    sportIds: [2],
    city: 'Самара',
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 0, lng: 0 },
    managedByUserId: 2,
    source: 'provider' as const,
    status: 'published' as const,
  },
  offering: {
    ownerType: 'trainer' as const,
    sportId: 2,
    title: 'Персональная тренировка',
    description: 'Описание.',
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
      date: '2026-04-20',
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

describe('модерация — hide/unhide (Step 22.1–22.2)', () => {
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

  it('hideEntity скрывает клуб с причиной и moderatorId', async () => {
    const created = await createClubPublication(clubInput);
    const hidden = await hideEntity('club', created.club.id, 'Нарушение правил', 3);

    expect(hidden.status).toBe('hidden');
    expect(hidden.hideReason).toBe('Нарушение правил');
    expect((hidden as { hiddenByUserId?: number }).hiddenByUserId).toBe(3);
    expect((hidden as { hiddenAt?: string }).hiddenAt).toBeDefined();
  });

  it('unhideEntity возвращает клуб в published', async () => {
    const created = await createClubPublication(clubInput);
    await hideEntity('club', created.club.id, 'Тест', 3);
    const restored = await unhideEntity('club', created.club.id);

    expect(restored.status).toBe('published');
    expect(restored.hideReason).toBeUndefined();
    expect((restored as { hiddenByUserId?: number }).hiddenByUserId).toBeUndefined();
    expect((restored as { hiddenAt?: string }).hiddenAt).toBeUndefined();
  });

  it('hideEntity скрывает тренера', async () => {
    const created = await createTrainerPublication(trainerInput);
    const hidden = await hideEntity('trainer', created.trainer.id, 'Спам', 3);

    expect(hidden.status).toBe('hidden');
    expect(hidden.hideReason).toBe('Спам');
  });

  it('unhideEntity возвращает тренера в published', async () => {
    const created = await createTrainerPublication(trainerInput);
    await hideEntity('trainer', created.trainer.id, 'Тест', 3);
    const restored = await unhideEntity('trainer', created.trainer.id);

    expect(restored.status).toBe('published');
    expect(restored.hideReason).toBeUndefined();
  });

  it('hideEntity бросает ошибку для несуществующей сущности', async () => {
    await expect(hideEntity('club', 99999, 'Тест', 3)).rejects.toThrow();
  });

  it('unhideEntity идемпотентен для published сущности', async () => {
    const created = await createClubPublication(clubInput);
    const result = await unhideEntity('club', created.club.id);
    expect(result.status).toBe('published');
  });

  it('hideEntity сохраняет данные в JSON-файл', async () => {
    const created = await createClubPublication(clubInput);
    await hideEntity('club', created.club.id, 'Проверка записи', 3);

    const clubs = await getClubs();
    const club = clubs.find((c) => c.id === created.club.id);
    expect(club?.status).toBe('hidden');
    expect(club?.hideReason).toBe('Проверка записи');
  });
});

describe('модерация — auto-restore при редактировании (Step 22.6)', () => {
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

  it('PATCH hidden клуба → status published, поля модерации очищены', async () => {
    const created = await createClubPublication(clubInput);
    await hideEntity('club', created.club.id, 'Нарушение', 3);

    // Провайдер редактирует скрытый клуб
    await updateClubPublication({
      clubId: created.club.id,
      userId: 2,
      club: { ...clubInput.club, name: 'Исправленный клуб' },
      offering: { ...clubInput.offering },
      schedules: [
        {
          ...clubInput.schedules[0],
          id: created.schedules[0].id,
        },
      ],
    });

    const clubs = await getClubs();
    const club = clubs.find((c) => c.id === created.club.id);
    expect(club?.status).toBe('published');
    expect(club?.hideReason).toBeUndefined();
    expect(club?.hiddenByUserId).toBeUndefined();
    expect(club?.hiddenAt).toBeUndefined();
    expect(club?.name).toBe('Исправленный клуб');
  });

  it('PATCH hidden тренера → status published, поля модерации очищены', async () => {
    const created = await createTrainerPublication(trainerInput);
    await hideEntity('trainer', created.trainer.id, 'Спам', 3);

    await updateTrainerPublication({
      trainerId: created.trainer.id,
      userId: 2,
      trainer: { ...trainerInput.trainer, name: 'Исправленный тренер' },
      offering: { ...trainerInput.offering },
      schedules: [
        {
          ...trainerInput.schedules[0],
          id: created.schedules[0].id,
        },
      ],
    });

    const trainers = await getTrainers();
    const trainer = trainers.find((t) => t.id === created.trainer.id);
    expect(trainer?.status).toBe('published');
    expect(trainer?.hideReason).toBeUndefined();
    expect(trainer?.name).toBe('Исправленный тренер');
  });

  it('PATCH published клуба → нет изменения status', async () => {
    const created = await createClubPublication(clubInput);

    await updateClubPublication({
      clubId: created.club.id,
      userId: 2,
      club: { ...clubInput.club, name: 'Обновлённый' },
      offering: { ...clubInput.offering },
      schedules: [
        {
          ...clubInput.schedules[0],
          id: created.schedules[0].id,
        },
      ],
    });

    const clubs = await getClubs();
    const club = clubs.find((c) => c.id === created.club.id);
    expect(club?.status).toBe('published');
  });
});
