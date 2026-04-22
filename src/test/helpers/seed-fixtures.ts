/**
 * Тестовые фикстуры для isolated data directory.
 * После очистки seed-данных в Phase 14 тесты используют эти фикстуры
 * вместо реальных JSON-файлов.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Booking, Club, Offering, Review, Schedule, Trainer, User } from '@/types';

// --- Фикстуры пользователей (Phase 26 Step 26.6) ---
// Копия исходных 3 users из production-seed. Нужна для изоляции тестов от
// расширенного production users.json (после 26.6 там 7 записей — athlete+
// provider-stage testing). analytics.route.test.ts с `totalUsers=3` продолжает
// работать благодаря этим fixtures.
export const fixtureUsers: User[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'athlete',
    status: 'active',
    name: 'Алексей Смирнов',
    email: 'alexey@sporthub.local',
    phone: '+7 (927) 000-10-10',
    password: 'sporthub123',
    avatarUrl: '/images/users/alexey-smirnov.jpg',
    favoriteClubIds: [],
    city: 'Самара',
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'club_owner',
    status: 'active',
    name: 'Марина Крылова',
    email: 'marina@studio.local',
    phone: '+7 (927) 000-20-20',
    password: 'sporthub123',
    avatarUrl: '/images/users/marina-krylova.jpg',
    favoriteClubIds: [],
    city: 'Самара',
  },
  {
    id: 3,
    createdAt: '2026-04-07T09:00:00.000Z',
    role: 'admin',
    status: 'active',
    name: 'Администратор SportHub',
    email: 'admin@sporthub.local',
    phone: '+7 (927) 000-30-30',
    password: 'admin-sporthub-2026',
    avatarUrl: '/images/users/admin.jpg',
    favoriteClubIds: [],
  },
];

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
  amenityIds: [1],
  tagIds: [1, 2],
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
  amenityIds: [2],
  tagIds: [1],
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
  amenityIds: [1],
  tagIds: [1, 2],
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
  specialtyIds: [1, 2],
  workFormatIds: [1],
  rating: 4.9,
  reviewCount: 2,
  priceFrom: 1400,
  sportIds: [3],
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
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
  specialtyIds: [1],
  workFormatIds: [1],
  rating: 4.7,
  reviewCount: 1,
  priceFrom: 1600,
  sportIds: [4],
  city: 'Самара',
  address: 'ул. Советская, 10',
  coordinates: { lat: 53.2001, lng: 50.11 },
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
  specialtyIds: [1],
  workFormatIds: [2],
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
// Phase 24: все offering-фикстуры получают cancellationPolicy='free_until_24h' по дефолту.
export const fixtureClubOffering: Offering = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  ownerType: 'club',
  ownerId: 1,
  sportId: 3,
  title: 'Утреннее плавание',
  description: 'Групповое утреннее плавание в бассейне 25 м.',
  format: 'group',
  price: 1100,
  durationMinutes: 60,
  capacity: 12,
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  cancellationPolicy: 'free_until_24h',
};

export const fixtureTrainerOffering: Offering = {
  id: 101,
  createdAt: '2026-03-17T09:00:00.000Z',
  ownerType: 'trainer',
  ownerId: 1,
  sportId: 3,
  title: 'Персональная тренировка: Плавание',
  description: 'Индивидуальная тренировка по плаванию.',
  format: 'personal',
  price: 1400,
  durationMinutes: 60,
  capacity: 1,
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
  cancellationPolicy: 'free_until_24h',
  // Phase 25 Step 25.1b: ссылка на seeded link (trainer1↔club1). Резолвится в
  // `affiliatedClub` только если тест вызвал `seedDefaultTrainerClubLink` и у
  // записи status='confirmed'. Иначе affiliatedClub остаётся null.
  trainerClubLinkId: 1,
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

// --- Фикстуры справочников (Phase 23) ---
// Минимальный seed для тестов — покрывает основные сценарии
export const fixtureCities = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Самара',
    coordinates: { lat: 53.195878, lng: 50.100202 },
  },
  {
    id: 2,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Москва',
    coordinates: { lat: 55.7558, lng: 37.6173 },
  },
];

export const fixtureTags = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'Для начинающих' },
  { id: 2, createdAt: '2026-03-17T09:00:00.000Z', name: 'Бассейн' },
];

export const fixtureAmenities = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'Парковка' },
  { id: 2, createdAt: '2026-03-17T09:00:00.000Z', name: 'Душевые' },
];

export const fixtureWorkFormats = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'В зале' },
  { id: 2, createdAt: '2026-03-17T09:00:00.000Z', name: 'Онлайн' },
];

export const fixtureSpecialties = [
  { id: 1, createdAt: '2026-03-17T09:00:00.000Z', name: 'Подготовка к соревнованиям' },
  { id: 2, createdAt: '2026-03-17T09:00:00.000Z', name: 'Реабилитация' },
];

// Phase 25 Step 25.1b: confirmed TrainerClubLink — вместо legacy fixtureTrainer.affiliatedClubId=1.
// Тесты, проверяющие «тренер 1 связан с клубом 1», засеивают через seedDefaultTrainerClubLink.
const DEFAULT_TRAINER_CLUB_LINK = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  trainerId: 1,
  clubId: 1,
  status: 'confirmed' as const,
  initiatedBy: 'trainer' as const,
  approvedAt: '2026-03-17T09:00:00.000Z',
  approvedByUserId: 2,
};

/**
 * Phase 25 Step 25.1b: засеивает confirmed-link trainer1↔club1 для тестов, которые
 * в старой модели полагались на `fixtureTrainer.affiliatedClubId=1`. Вызывать после
 * `seedTestData`, перед тестом.
 */
export async function seedDefaultTrainerClubLink(dataDirectory: string): Promise<void> {
  await writeFile(
    path.join(dataDirectory, 'trainer-club-links.json'),
    `${JSON.stringify([DEFAULT_TRAINER_CLUB_LINK], null, 2)}\n`,
    'utf8',
  );
}

/**
 * Записывает полный набор тестовых фикстур в указанную директорию.
 * Перезаписывает пустые JSON-файлы тестовыми данными.
 */
export async function seedTestData(dataDirectory: string): Promise<void> {
  const write = (filename: string, data: unknown) =>
    writeFile(path.join(dataDirectory, filename), `${JSON.stringify(data, null, 2)}\n`, 'utf8');

  await Promise.all([
    // Phase 26 Step 26.6: users.json пишется из fixtures, изолируя тесты от
    // расширенного production users.json (7 записей после этого шага).
    write('users.json', fixtureUsers),
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
    write('logs.json', []),
    // Справочники (Phase 23)
    write('cities.json', fixtureCities),
    write('tags.json', fixtureTags),
    write('amenities.json', fixtureAmenities),
    write('work-formats.json', fixtureWorkFormats),
    write('specialties.json', fixtureSpecialties),
    // Phase 24: новые коллекции (по умолчанию пустые — тесты сами засеивают при необходимости).
    // Phase 25 Step 25.1b: trainer-club-links остаются пустыми по умолчанию, чтобы
    // CRUD-тесты ссылок работали на чистом срезе. Тесты, которым нужен confirmed-link
    // тренера 1 к клубу 1, засеивают его сами через seedTrainerClubLink helper ниже.
    write('notifications.json', []),
    write('trainer-club-links.json', []),
  ]);
}
