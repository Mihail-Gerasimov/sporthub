// Тесты бизнес-логики провайдер-кабинета (Step 12.3)
import { describe, expect, it } from 'vitest';

import type { Booking, Club, Review, Schedule, Trainer, User } from '@/types';
import {
  getProviderClubs,
  getProviderIncomingBookings,
  getProviderReviews,
  getProviderSummary,
  getProviderTrainers,
} from '@/components/profile/provider-helpers';

// --- Фикстуры ---

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    phone: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [3],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.8,
    reviewCount: 10,
    priceFrom: 900,
    distanceKm: 1.8,
    managedByUserId: 2,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'North Ring',
    slug: 'north-ring',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    phone: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [2],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.7,
    reviewCount: 5,
    priceFrom: 1100,
    distanceKm: 5.4,
    managedByUserId: 2,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Balance Yoga',
    slug: 'balance',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    phone: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [1],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.9,
    reviewCount: 8,
    priceFrom: 800,
    distanceKm: 2.0,
  },
];

const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Марина Соколова',
    slug: 'marina',
    bio: '',
    avatarUrl: '',
    experienceYears: 9,
    specialtyIds: [],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 3,
    priceFrom: 1400,
    sportIds: [3],
    managedByUserId: 2,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Елена Круглова',
    slug: 'elena',
    bio: '',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [],
    workFormatIds: [1],
    rating: 4.5,
    reviewCount: 2,
    priceFrom: 1000,
    sportIds: [8],
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Тимур Каримов',
    slug: 'timur',
    bio: '',
    avatarUrl: '',
    experienceYears: 11,
    specialtyIds: [],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 4,
    priceFrom: 1600,
    sportIds: [2],
    managedByUserId: 2,
  },
];

const bookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-18T10:00:00.000Z',
    scheduleId: 3,
    ownerType: 'club',
    ownerId: 1,
    userId: 1,
    clubId: 1,
    sportId: 3,
    date: '2099-03-18',
    status: 'confirmed',
    paymentStatus: 'paid',
    totalPrice: 1100,
  },
  {
    id: 2,
    createdAt: '2026-03-19T14:30:00.000Z',
    scheduleId: 1003,
    ownerType: 'trainer',
    ownerId: 3,
    userId: 1,
    // Phase 25 Step 25.1b: legacy `affiliatedClubId` удалён. Для связки booking тренера
    // с venue-клубом используется `clubId` напрямую на booking'е.
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    date: '2099-03-20',
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: 1600,
  },
  {
    id: 3,
    createdAt: '2026-03-17T08:00:00.000Z',
    scheduleId: 100,
    ownerType: 'club',
    ownerId: 3,
    userId: 1,
    clubId: 3,
    sportId: 1,
    date: '2099-03-18',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 800,
  },
];

const schedule: Schedule[] = [
  {
    id: 3,
    createdAt: '2026-03-18T09:00:00.000Z',
    ownerType: 'club',
    ownerId: 1,
    clubId: 1,
    sportId: 3,
    title: 'Групповая дорожка',
    date: '2099-03-18',
    startTime: '08:00',
    endTime: '09:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 12,
    bookedCount: 1,
    price: 1100,
    room: 'Дорожка 3',
  },
  {
    id: 1003,
    createdAt: '2026-03-19T13:30:00.000Z',
    ownerType: 'trainer',
    ownerId: 3,
    trainerId: 3,
    sportId: 2,
    title: 'Персональная техника удара',
    date: '2099-03-20',
    startTime: '18:30',
    endTime: '19:30',
    durationMinutes: 60,
    level: 'intermediate',
    capacity: 1,
    bookedCount: 1,
    price: 1600,
    room: 'Зал единоборств',
  },
];

const users: User[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'athlete',
    name: 'Алексей Миронов',
    email: 'alexey@sporthub.local',
    phone: '+7 999 123-45-67',
    password: 'secret',
    favoriteClubIds: [],
  },
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-18T12:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отлично!',
  },
  {
    id: 2,
    createdAt: '2026-03-19T10:00:00.000Z',
    userId: 1,
    trainerId: 3,
    rating: 4,
    text: 'Хорошо.',
  },
  {
    id: 3,
    createdAt: '2026-03-19T11:00:00.000Z',
    userId: 1,
    clubId: 3,
    rating: 5,
    text: 'Супер йога!',
  },
];

const PROVIDER_USER_ID = 2;

// --- Тесты ---

describe('getProviderClubs', () => {
  it('возвращает клубы провайдера по managedByUserId', () => {
    const result = getProviderClubs(clubs, PROVIDER_USER_ID);

    expect(result.map((c) => c.id)).toEqual([1, 2]);
  });

  it('возвращает пустой массив если нет управляемых клубов', () => {
    const result = getProviderClubs(clubs, 999);

    expect(result).toEqual([]);
  });
});

describe('getProviderTrainers', () => {
  it('возвращает тренеров провайдера по managedByUserId', () => {
    const result = getProviderTrainers(trainers, PROVIDER_USER_ID);

    expect(result.map((t) => t.id)).toEqual([1, 3]);
  });

  it('возвращает пустой массив если нет управляемых тренеров', () => {
    const result = getProviderTrainers(trainers, 999);

    expect(result).toEqual([]);
  });
});

describe('getProviderIncomingBookings', () => {
  it('возвращает только активные входящие записи провайдера и обогащает их контекстом карточки', () => {
    const result = getProviderIncomingBookings({
      bookings,
      clubs,
      providerClubIds: [1, 2],
      providerTrainerIds: [1, 3],
      schedule,
      todayDateKey: '2099-03-18',
      trainers,
      users,
    });

    expect(result.map((booking) => booking.id)).toEqual([1, 2]);
    expect(result[0]).toMatchObject({
      athleteEmail: 'alexey@sporthub.local',
      athleteName: 'Алексей Миронов',
      bookingTypeLabel: 'Услуга клуба',
      contextLabel: 'Volna Aquatic Club',
      locationLabel: 'Volna Aquatic Club · Дорожка 3',
      timeLabel: '08:00 - 09:00',
      title: 'Групповая дорожка',
    });
    expect(result[1]).toMatchObject({
      athleteEmail: 'alexey@sporthub.local',
      athleteName: 'Алексей Миронов',
      bookingTypeLabel: 'Услуга тренера',
      contextLabel: 'Тимур Каримов · North Ring',
      locationLabel: 'North Ring · Зал единоборств',
      timeLabel: '18:30 - 19:30',
      title: 'Персональная техника удара',
    });
  });

  it('возвращает пустой массив если нет активных входящих записей на сегодня и позже', () => {
    const result = getProviderIncomingBookings({
      bookings,
      clubs,
      providerClubIds: [1, 2],
      providerTrainerIds: [1, 3],
      schedule,
      todayDateKey: '2100-01-01',
      trainers,
      users,
    });

    expect(result).toEqual([]);
  });
});

describe('getProviderReviews', () => {
  it('возвращает отзывы на клубы и тренеров провайдера', () => {
    const result = getProviderReviews(reviews, [1, 2], [1, 3]);

    // Отзыв 1: clubId 1 (провайдер), Отзыв 2: trainerId 3 (провайдер), Отзыв 3: clubId 3 (чужой)
    expect(result.map((r) => r.id).sort()).toEqual([1, 2]);
  });

  it('возвращает пустой массив если нет отзывов', () => {
    const result = getProviderReviews(reviews, [999], [999]);

    expect(result).toEqual([]);
  });
});

describe('getProviderSummary', () => {
  it('считает правильную сводку', () => {
    const providerClubs = clubs.filter((c) => c.managedByUserId === PROVIDER_USER_ID);
    const providerTrainers = trainers.filter((t) => t.managedByUserId === PROVIDER_USER_ID);
    const providerBookings = getProviderIncomingBookings({
      bookings,
      clubs,
      providerClubIds: [1, 2],
      providerTrainerIds: [1, 3],
      schedule,
      todayDateKey: '2099-03-18',
      trainers,
      users,
    });
    const providerReviews = reviews.filter((r) => r.id === 1 || r.id === 2);
    const result = getProviderSummary(
      providerClubs,
      providerTrainers,
      providerBookings,
      providerReviews,
    );

    expect(result.publicationsCount).toBe(4); // 2 клуба + 2 тренера
    expect(result.activeBookingsCount).toBe(2);
    expect(result.reviewsCount).toBe(2);
    expect(result.averageRating).toBe(4.5); // (5 + 4) / 2
  });

  it('возвращает 0 среднего рейтинга при отсутствии отзывов', () => {
    const result = getProviderSummary([], [], [], []);

    expect(result.publicationsCount).toBe(0);
    expect(result.activeBookingsCount).toBe(0);
    expect(result.reviewsCount).toBe(0);
    expect(result.averageRating).toBe(0);
  });
});
