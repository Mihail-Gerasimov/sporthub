// Тесты бизнес-логики провайдер-кабинета (Step 12.3)
import { describe, expect, it } from 'vitest';

import type { Booking, Club, Review, Trainer } from '@/types';
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
    amenities: [],
    tags: [],
    rating: 4.8,
    reviewCount: 10,
    priceFrom: 900,
    distanceKm: 1.8,
    isFeatured: true,
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
    amenities: [],
    tags: [],
    rating: 4.7,
    reviewCount: 5,
    priceFrom: 1100,
    distanceKm: 5.4,
    isFeatured: true,
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
    amenities: [],
    tags: [],
    rating: 4.9,
    reviewCount: 8,
    priceFrom: 800,
    distanceKm: 2.0,
    isFeatured: false,
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
    specialties: [],
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
    specialties: [],
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
    specialties: [],
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
    date: '2026-03-18',
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
    trainerId: 3,
    sportId: 2,
    date: '2026-03-20',
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
    date: '2026-03-18',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 800,
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
  it('возвращает только букинги на сущности провайдера', () => {
    const providerClubIds = [1, 2];
    const providerTrainerIds = [1, 3];
    const result = getProviderIncomingBookings(bookings, providerClubIds, providerTrainerIds);

    // Букинг 1: clubId 1 (провайдер), Букинг 2: trainerId 3 (провайдер), Букинг 3: clubId 3 (чужой)
    expect(result.map((b) => b.id).sort()).toEqual([1, 2]);
  });

  it('возвращает пустой массив если нет входящих записей', () => {
    const result = getProviderIncomingBookings(bookings, [999], [999]);

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
    const providerBookings = bookings.filter((b) => b.id === 1 || b.id === 2);
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
