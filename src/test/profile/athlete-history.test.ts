import { describe, expect, it } from 'vitest';

import { getAthleteHistoryItems } from '@/components/profile/athlete-history';
import type { Booking, Club, Review, Schedule, Trainer } from '@/types';

const historyBookings: Booking[] = [
  {
    id: 11,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 31,
    userId: 1,
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    date: '2026-03-11',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1600,
  },
  {
    id: 12,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 32,
    userId: 1,
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    date: '2026-03-09',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1200,
  },
  {
    id: 13,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 33,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-19',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
];

const historySchedule: Schedule[] = [
  {
    id: 31,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    title: 'Персональная хатха-йога',
    date: '2026-03-11',
    startTime: '09:30',
    endTime: '10:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 1,
    bookedCount: 1,
    price: 1600,
    room: 'Private room',
  },
  {
    id: 32,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    title: 'Бокс. Базовая техника',
    date: '2026-03-09',
    startTime: '18:00',
    endTime: '19:00',
    durationMinutes: 60,
    level: 'beginner',
    capacity: 16,
    bookedCount: 10,
    price: 1200,
    room: 'Ринг 1',
  },
];

const historyClubs: Club[] = [
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'North Ring Boxing Lab',
    slug: 'north-ring-boxing-lab',
    description: 'Клуб бокса',
    shortDescription: 'Бокс и спарринги.',
    city: 'Самара',
    address: 'Московское шоссе, 41',
    phone: '+7 (846) 200-11-02',
    email: 'hello@north-ring.ru',
    website: 'https://north-ring.ru',
    coordinates: { lat: 53.2337, lng: 50.1966 },
    sportIds: [2, 7],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.7,
    reviewCount: 51,
    priceFrom: 1100,
    distanceKm: 5.4,
    isFeatured: true,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Balance Yoga House',
    slug: 'balance-yoga-house',
    description: 'Клуб йоги',
    shortDescription: 'Йога в центре города.',
    city: 'Самара',
    address: 'ул. Молодогвардейская, 86',
    phone: '+7 (846) 200-11-03',
    email: 'hello@balance-house.ru',
    website: 'https://balance-house.ru',
    coordinates: { lat: 53.1957, lng: 50.1006 },
    sportIds: [1, 8],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.9,
    reviewCount: 72,
    priceFrom: 850,
    distanceKm: 2.3,
    isFeatured: true,
  },
];

const historyTrainers: Trainer[] = [
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 2,
    sportIds: [2],
    sportId: 2,
    name: 'Тимур Каримов',
    slug: 'timur-karimov',
    bio: 'Тренер по боксу.',
    avatarUrl: '/images/trainers/timur.jpg',
    experienceYears: 11,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 4.8,
    reviewCount: 31,
    priceFrom: 1600,
  },
  {
    id: 5,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    sportIds: [1],
    sportId: 1,
    name: 'Анна Миронова',
    slug: 'anna-mironova',
    bio: 'Тренер по йоге.',
    avatarUrl: '/images/trainers/anna.jpg',
    experienceYears: 8,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 5,
    reviewCount: 36,
    priceFrom: 1300,
  },
];

const historyReviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    clubId: 3,
    rating: 5,
    text: 'Отзыв о клубе',
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    trainerId: 5,
    rating: 5,
    text: 'Отзыв о тренере',
  },
];

describe('getAthleteHistoryItems', () => {
  it('собирает завершённую историю, формат и связь с отзывами', () => {
    const historyItems = getAthleteHistoryItems({
      athleteUserId: 1,
      bookings: historyBookings,
      clubs: historyClubs,
      reviews: historyReviews,
      schedule: historySchedule,
      trainers: historyTrainers,
    });

    expect(historyItems).toHaveLength(2);
    expect(historyItems[0]).toMatchObject({
      title: 'Персональная хатха-йога',
      clubName: 'Balance Yoga House',
      trainerName: 'Анна Миронова',
      formatLabel: 'Персональная тренировка',
      reviewStatusLabel: 'Отзыв уже оставлен',
    });
    expect(historyItems[1]).toMatchObject({
      title: 'Бокс. Базовая техника',
      clubName: 'North Ring Boxing Lab',
      trainerName: 'Тимур Каримов',
      formatLabel: 'Групповое занятие',
      reviewStatusLabel: 'Можно оставить отзыв',
    });
  });

  it('без завершённых занятий возвращает пустую историю', () => {
    const historyItems = getAthleteHistoryItems({
      athleteUserId: 1,
      bookings: [],
      clubs: historyClubs,
      reviews: historyReviews,
      schedule: historySchedule,
      trainers: historyTrainers,
    });

    expect(historyItems).toEqual([]);
  });
});
