/**
 * Тестовые фикстуры для isolated data directory.
 * После очистки seed-данных в Phase 14 тесты используют эти фикстуры
 * вместо реальных JSON-файлов.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Booking, Club, Offering, Review, Schedule, Trainer } from '@/types';

// --- Фикстуры клубов ---
export const fixtureClub: Club = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Volna Aquatic Club',
  slug: 'volna-aquatic-club',
  description: 'Клуб с бассейном 25 м и секциями плавания, пилатеса.',
  shortDescription: 'Бассейн и пилатес рядом с набережной.',
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  phone: '+7 (846) 200-11-01',
  email: 'hello@volna-club.ru',
  website: 'https://volna-club.ru',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  sportIds: [3, 8],
  imageUrls: ['/images/clubs/volna-1.jpg'],
  amenities: ['Бассейн 25 м'],
  tags: ['Бассейн', 'Восстановление'],
  rating: 4.8,
  reviewCount: 3,
  priceFrom: 900,
  distanceKm: 1.8,
  isFeatured: true,
  managedByUserId: 2,
  source: 'seed',
  status: 'published',
};

export const fixtureClub2: Club = {
  id: 2,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Iron Gym',
  slug: 'iron-gym',
  description: 'Тренажёрный зал полного цикла.',
  shortDescription: 'Тренажёрный зал полного цикла.',
  city: 'Самара',
  address: 'ул. Советская, 10',
  phone: '+7 (846) 200-11-02',
  coordinates: { lat: 53.2001, lng: 50.11 },
  sportIds: [4],
  imageUrls: ['/images/clubs/iron-gym-1.jpg'],
  amenities: ['Тренажёры'],
  tags: ['Силовые'],
  rating: 4.5,
  reviewCount: 2,
  priceFrom: 800,
  distanceKm: 3.0,
  isFeatured: false,
  managedByUserId: 2,
  source: 'seed',
  status: 'published',
};

export const fixtureClub3: Club = {
  id: 3,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Balance Yoga House',
  slug: 'balance-yoga-house',
  description: 'Камерная студия для йоги и пилатеса в центре города.',
  shortDescription: 'Йога и пилатес в центре города.',
  city: 'Самара',
  address: 'ул. Молодогвардейская, 86',
  phone: '+7 (846) 200-11-03',
  email: 'hello@balance-house.ru',
  website: 'https://balance-house.ru',
  coordinates: { lat: 53.1957, lng: 50.1006 },
  sportIds: [1, 8],
  imageUrls: ['/images/clubs/balance-1.jpg'],
  amenities: ['Коврики и блоки'],
  tags: ['Йога', 'Пилатес'],
  rating: 4.9,
  reviewCount: 5,
  priceFrom: 850,
  distanceKm: 2.3,
  isFeatured: true,
  source: 'seed',
  status: 'published',
};

// --- Фикстуры тренеров ---
export const fixtureTrainer: Trainer = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию с 9-летним стажем.',
  avatarUrl: '/images/trainers/marina-sokolova.jpg',
  experienceYears: 9,
  specialties: ['Кроль', 'Постановка дыхания'],
  rating: 4.9,
  reviewCount: 2,
  priceFrom: 1400,
  sportIds: [3],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  affiliatedClubId: 1,
  managedByUserId: 2,
  source: 'seed',
  status: 'published',
};

export const fixtureTrainer3: Trainer = {
  id: 3,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Алексей Петров',
  slug: 'alexey-petrov',
  bio: 'Силовой тренер.',
  avatarUrl: '/images/trainers/alexey-petrov.jpg',
  experienceYears: 6,
  specialties: ['Силовые тренировки'],
  rating: 4.7,
  reviewCount: 1,
  priceFrom: 1600,
  sportIds: [4],
  city: 'Самара',
  address: 'ул. Советская, 10',
  coordinates: { lat: 53.2001, lng: 50.11 },
  affiliatedClubId: 2,
  managedByUserId: 2,
  source: 'seed',
  status: 'published',
};

export const fixtureTrainer5: Trainer = {
  id: 5,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Анна Миронова',
  slug: 'anna-mironova',
  bio: 'Тренер по йоге.',
  avatarUrl: '/images/trainers/anna-mironova.jpg',
  experienceYears: 8,
  specialties: ['Хатха-йога'],
  rating: 5,
  reviewCount: 3,
  priceFrom: 1300,
  sportIds: [1],
  city: 'Самара',
  address: 'ул. Молодогвардейская, 86',
  coordinates: { lat: 53.1957, lng: 50.1006 },
  managedByUserId: 2,
  source: 'seed',
  status: 'published',
};

// --- Фикстуры услуг ---
export const fixtureClubOffering: Offering = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  ownerType: 'club',
  ownerId: 1,
  affiliatedClubId: 1,
  sportId: 3,
  title: 'Утреннее плавание',
  description: 'Групповое утреннее плавание в бассейне 25 м.',
  format: 'group',
  price: 1100,
  durationMinutes: 60,
  capacity: 12,
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
};

export const fixtureTrainerOffering: Offering = {
  id: 101,
  createdAt: '2026-03-17T09:00:00.000Z',
  ownerType: 'trainer',
  ownerId: 1,
  affiliatedClubId: 1,
  sportId: 3,
  title: 'Персональная тренировка: Плавание',
  description: 'Индивидуальная тренировка по плаванию.',
  format: 'personal',
  price: 1400,
  durationMinutes: 60,
  capacity: 1,
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
};

// --- Фикстуры расписания ---
export const fixtureClubSlot1: Schedule = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  offeringId: 1,
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  trainerId: 1,
  sportId: 3,
  title: 'Утреннее плавание',
  date: '2026-03-18',
  startTime: '08:00',
  endTime: '09:00',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 12,
  bookedCount: 2,
  price: 1100,
};

export const fixtureClubSlot2: Schedule = {
  id: 2,
  createdAt: '2026-03-17T09:00:00.000Z',
  offeringId: 1,
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  trainerId: 1,
  sportId: 3,
  title: 'Дневное плавание',
  date: '2026-03-18',
  startTime: '12:00',
  endTime: '13:00',
  durationMinutes: 60,
  level: 'beginner',
  capacity: 12,
  bookedCount: 0,
  price: 1100,
};

export const fixtureClubSlot3: Schedule = {
  id: 3,
  createdAt: '2026-03-17T09:00:00.000Z',
  offeringId: 1,
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  trainerId: 1,
  sportId: 3,
  title: 'Вечернее плавание',
  date: '2026-03-18',
  startTime: '19:00',
  endTime: '20:00',
  durationMinutes: 60,
  level: 'intermediate',
  capacity: 12,
  bookedCount: 1,
  price: 1100,
};

export const fixtureTrainerSlot: Schedule = {
  id: 1001,
  createdAt: '2026-03-17T09:00:00.000Z',
  offeringId: 101,
  ownerType: 'trainer',
  ownerId: 1,
  trainerId: 1,
  affiliatedClubId: 1,
  sportId: 3,
  title: 'Персональная тренировка: Плавание',
  date: '2026-03-20',
  startTime: '08:15',
  endTime: '09:15',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 1,
  bookedCount: 0,
  price: 1400,
};

// --- Фикстуры отзывов ---
export const fixtureReviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-17T10:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отличный бассейн!',
  },
  {
    id: 2,
    createdAt: '2026-03-17T11:00:00.000Z',
    userId: 1,
    trainerId: 1,
    rating: 5,
    text: 'Марина — отличный тренер.',
  },
];

// --- Фикстуры бронирований ---
export const fixtureBookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 2,
    offeringId: 1,
    ownerType: 'club',
    ownerId: 1,
    affiliatedClubId: 1,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-18',
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 3,
    offeringId: 1,
    ownerType: 'club',
    ownerId: 1,
    affiliatedClubId: 1,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-18',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1100,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    scheduleId: 3,
    offeringId: 1,
    ownerType: 'club',
    ownerId: 1,
    affiliatedClubId: 1,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-18',
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: 1100,
  },
];

/**
 * Записывает полный набор тестовых фикстур в указанную директорию.
 * Перезаписывает пустые JSON-файлы тестовыми данными.
 */
export async function seedTestData(dataDirectory: string): Promise<void> {
  const write = (filename: string, data: unknown) =>
    writeFile(path.join(dataDirectory, filename), `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  await Promise.all([
    write('clubs.json', [fixtureClub, fixtureClub2, fixtureClub3]),
    write('trainers.json', [fixtureTrainer, fixtureTrainer3, fixtureTrainer5]),
    write('offerings.json', [fixtureClubOffering, fixtureTrainerOffering]),
    write('schedule.json', [
      fixtureClubSlot1,
      fixtureClubSlot2,
      fixtureClubSlot3,
      fixtureTrainerSlot,
    ]),
    write('reviews.json', fixtureReviews),
    write('bookings.json', fixtureBookings),
  ]);
}
