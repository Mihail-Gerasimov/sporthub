// Тест: при обновлении даты слота расписания, букинги синхронизируют свою дату
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createBookingAtomic,
  createClubPublication,
  createTrainerPublication,
  getBookings,
  updateClubPublication,
  updateTrainerPublication,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

/* --- Фикстуры --- */

const clubInput = {
  club: {
    name: 'Клуб для теста синхронизации',
    slug: 'sync-test-club',
    description: 'Описание клуба.',
    shortDescription: 'Клуб.',
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
    isFeatured: false,
    managedByUserId: 2,
    source: 'provider' as const,
    status: 'published' as const,
  },
  offering: {
    ownerType: 'club' as const,
    sportId: 1,
    title: 'Занятия — Sync Club',
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
      date: '2026-04-11',
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
    name: 'Тренер Синхро',
    slug: 'sync-test-trainer',
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
      date: '2026-04-11',
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

describe('синхронизация даты букинга при обновлении расписания', () => {
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

  it('updateClubPublication синхронизирует дату букинга при изменении даты слота', async () => {
    // 1. Создаём клуб с расписанием на 2026-04-11
    const created = await createClubPublication(clubInput);
    const scheduleSlot = created.schedules[0];
    expect(scheduleSlot.date).toBe('2026-04-11');

    // 2. Спортсмен записывается на этот слот
    const booking = await createBookingAtomic({
      scheduleId: scheduleSlot.id,
      userId: 1,
    });
    expect(booking.date).toBe('2026-04-11');

    // 3. Провайдер переносит слот на 2026-04-14
    await updateClubPublication({
      clubId: created.club.id,
      userId: 2,
      club: { ...clubInput.club },
      offering: { ...clubInput.offering },
      schedules: [
        {
          ...clubInput.schedules[0],
          id: scheduleSlot.id,
          date: '2026-04-14',
        },
      ],
    });

    // 4. Дата букинга должна обновиться
    const bookings = await getBookings();
    const updatedBooking = bookings.find((b) => b.id === booking.id);
    expect(updatedBooking).toBeDefined();
    expect(updatedBooking!.date).toBe('2026-04-14');
  });

  it('updateTrainerPublication синхронизирует дату букинга при изменении даты слота', async () => {
    // 1. Создаём тренера с расписанием на 2026-04-11
    const created = await createTrainerPublication(trainerInput);
    const scheduleSlot = created.schedules[0];
    expect(scheduleSlot.date).toBe('2026-04-11');

    // 2. Спортсмен записывается
    const booking = await createBookingAtomic({
      scheduleId: scheduleSlot.id,
      userId: 1,
    });
    expect(booking.date).toBe('2026-04-11');

    // 3. Провайдер переносит слот на 2026-04-16
    await updateTrainerPublication({
      trainerId: created.trainer.id,
      userId: 2,
      trainer: { ...trainerInput.trainer },
      offering: { ...trainerInput.offering },
      schedules: [
        {
          ...trainerInput.schedules[0],
          id: scheduleSlot.id,
          date: '2026-04-16',
        },
      ],
    });

    // 4. Дата букинга должна обновиться
    const bookings = await getBookings();
    const updatedBooking = bookings.find((b) => b.id === booking.id);
    expect(updatedBooking).toBeDefined();
    expect(updatedBooking!.date).toBe('2026-04-16');
  });

  it('не трогает букинги если дата слота не менялась', async () => {
    // 1. Создаём клуб + букинг
    const created = await createClubPublication(clubInput);
    const scheduleSlot = created.schedules[0];
    const booking = await createBookingAtomic({
      scheduleId: scheduleSlot.id,
      userId: 1,
    });

    // 2. Обновляем клуб БЕЗ смены даты (только название)
    await updateClubPublication({
      clubId: created.club.id,
      userId: 2,
      club: { ...clubInput.club, name: 'Новое название' },
      offering: { ...clubInput.offering },
      schedules: [
        {
          ...clubInput.schedules[0],
          id: scheduleSlot.id,
        },
      ],
    });

    // 3. Дата букинга не изменилась
    const bookings = await getBookings();
    const updatedBooking = bookings.find((b) => b.id === booking.id);
    expect(updatedBooking!.date).toBe('2026-04-11');
    expect(updatedBooking!.createdAt).toBe(booking.createdAt);
  });
});
