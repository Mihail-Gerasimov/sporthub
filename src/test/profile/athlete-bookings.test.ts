import { describe, expect, it, vi } from 'vitest';

import {
  getAthleteActiveFutureBookings,
  getAthleteUpcomingProfileBookings,
} from '@/components/profile/athlete-bookings';
import type { Booking, Club, Schedule, Trainer } from '@/types';

const FROZEN_UPCOMING_TEST_DATE = new Date('2026-03-19T12:00:00+04:00');

const bookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 21,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-19',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 22,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-20',
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 23,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-18',
    status: 'confirmed',
    paymentStatus: 'paid',
    totalPrice: 900,
  },
  {
    id: 4,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 24,
    userId: 1,
    clubId: 2,
    trainerId: 2,
    sportId: 2,
    date: '2026-03-21',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1400,
  },
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 25,
    userId: 1,
    clubId: 2,
    trainerId: 2,
    sportId: 2,
    date: '2026-03-21',
    status: 'cancelled_by_athlete',
    paymentStatus: 'refunded',
    totalPrice: 1400,
  },
  {
    id: 6,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 26,
    userId: 2,
    clubId: 2,
    trainerId: 2,
    sportId: 2,
    date: '2026-03-21',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1400,
  },
];

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna-aquatic-club',
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
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'North Ring Boxing Lab',
    slug: 'north-ring-boxing-lab',
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
    reviewCount: 9,
    priceFrom: 1200,
    distanceKm: 5.4,
  },
];

const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    sportIds: [3],
    sportId: 3,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: '',
    avatarUrl: '',
    experienceYears: 9,
    specialtyIds: [],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 2,
    sportIds: [2],
    sportId: 2,
    name: 'Тимур Каримов',
    slug: 'timur-karimov',
    bio: '',
    avatarUrl: '',
    experienceYears: 11,
    specialtyIds: [],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 21,
    priceFrom: 1600,
  },
];

const schedule: Schedule[] = [
  {
    id: 21,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Утреннее плавание',
    date: '2026-03-19',
    startTime: '07:30',
    endTime: '08:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн A',
  },
  {
    id: 22,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Вечернее плавание',
    date: '2026-03-20',
    startTime: '19:30',
    endTime: '20:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн B',
  },
];

describe('getAthleteActiveFutureBookings', () => {
  it('оставляет только активные future-bookings текущего спортсмена, включая same-day без проверки времени', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_UPCOMING_TEST_DATE);

    const result = getAthleteActiveFutureBookings({
      athleteUserId: 1,
      bookings,
    });

    expect(result.map((booking) => booking.id)).toEqual([1, 2]);

    vi.useRealTimers();
  });
});

describe('getAthleteUpcomingProfileBookings', () => {
  it('строит upcoming-карточки и сортирует их по дате и времени', () => {
    vi.useFakeTimers();
    vi.setSystemTime(FROZEN_UPCOMING_TEST_DATE);

    const result = getAthleteUpcomingProfileBookings({
      athleteUserId: 1,
      bookings,
      clubs,
      schedule,
      trainers,
    });

    expect(result.map((booking) => booking.title)).toEqual([
      'Утреннее плавание',
      'Вечернее плавание',
    ]);
    expect(result.map((booking) => booking.bookingTypeLabel)).toEqual([
      'Услуга клуба',
      'Услуга клуба',
    ]);
    expect(result.map((booking) => booking.locationLabel)).toEqual([
      'Volna Aquatic Club · Бассейн A',
      'Volna Aquatic Club · Бассейн B',
    ]);
    expect(result.map((booking) => booking.timeLabel)).toEqual(['07:30 - 08:30', '19:30 - 20:30']);
    expect(result.map((booking) => booking.statusLabel)).toEqual([
      'Подтверждена',
      'Ожидает подтверждения',
    ]);
    expect(result.map((booking) => booking.statusTone)).toEqual(['success', 'outline']);

    vi.useRealTimers();
  });
});
