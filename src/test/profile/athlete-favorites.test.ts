import { describe, expect, it } from 'vitest';

import { getAthleteFavorites } from '@/components/profile/athlete-favorites';
import type { Booking, Club, Review, Trainer, User } from '@/types';

const users: User[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'athlete',
    name: 'Алексей Смирнов',
    email: 'alexey@sporthub.local',
    phone: '+7 (927) 000-10-10',
    password: 'sporthub123',
    favoriteClubIds: [1, 3],
  },
];

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna-aquatic-club',
    description: 'Клуб с бассейном',
    shortDescription: 'Бассейн рядом с набережной.',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    phone: '+7 (846) 200-11-01',
    email: 'hello@volna-club.ru',
    website: 'https://volna-club.ru',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    sportIds: [3, 8],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
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

const trainers: Trainer[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    sportIds: [3],
    sportId: 3,
    name: 'Марина Соколова',
    slug: 'marina-sokolova',
    bio: 'Тренер по плаванию.',
    avatarUrl: '/images/trainers/marina.jpg',
    experienceYears: 9,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 4.9,
    reviewCount: 28,
    priceFrom: 1400,
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
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    userId: 1,
    trainerId: 5,
    rating: 5,
    text: 'Отзыв о тренере',
  },
];

describe('getAthleteFavorites', () => {
  it('возвращает избранные клубы и тренеров с reason labels', () => {
    const favorites = getAthleteFavorites({
      athleteUserId: 1,
      bookings,
      clubs,
      reviews,
      trainers,
      users,
    });

    expect(favorites.clubs.map((club) => club.name)).toEqual([
      'Volna Aquatic Club',
      'Balance Yoga House',
    ]);
    expect(favorites.trainers).toMatchObject([
      {
        name: 'Анна Миронова',
        reasonLabel: 'Есть отзыв о тренере',
      },
      {
        name: 'Марина Соколова',
        reasonLabel: 'Есть записи к тренеру',
      },
    ]);
  });

  it('без favoriteClubIds и активности возвращает пустые списки', () => {
    const favorites = getAthleteFavorites({
      athleteUserId: 1,
      bookings: [],
      clubs,
      reviews: [],
      trainers,
      users: [
        {
          ...users[0],
          favoriteClubIds: [],
        },
      ],
    });

    expect(favorites.clubs).toEqual([]);
    expect(favorites.trainers).toEqual([]);
  });
});
