/**
 * Тестовые фикстуры для isolated data directory.
 * После очистки seed-данных в Phase 14 тесты используют эти фикстуры
 * вместо реальных JSON-файлов.
 */
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Booking, Club, Offering, Review, Schedule, Trainer, User } from '@sporthub/types';

import { fixtureSports } from './dictionaries';

// --- Фикстуры пользователей (Phase 26 Step 26.6) ---
// Копия исходных users из production-seed. Нужна для изоляции тестов от
// расширенного production users.json (после 26.6 там 7 записей — athlete+
// provider-stage testing).
// Фаза 34, этап Э8a: к трём исходным добавлен тренер — теперь по человеку на
// каждую роль площадки. Сверка контрактов снята ДО его появления и засеивает
// набор без него (см. `contract-parity.test.ts`): иначе сравнение сводки
// платформы пришлось бы выключить из-за лишнего пользователя.
// Phase 33 Step 33.9: пароля открытым текстом в фикстурах не остаётся —
// поле хранит готовый argon2id-хеш с теми же параметрами, что и рабочий код
// (19456 КиБ / 2 прохода / 1 дорожка). Хеши посчитаны заранее и записаны
// константами: считать их при загрузке модуля нельзя — расчёт асинхронный,
// а данные должны быть готовы сразу.
/** argon2id-хеш пароля `sporthub123` — им пользуются атлет и провайдер. */
export const FIXTURE_PASSWORD_PLAIN = 'sporthub123';
export const FIXTURE_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$CgCRS3ngEJKeoa9semqLSQ$mxTjcFt/GVvJAZbQTbeV5i5sS3ZgO47vH9a6KwZhLN8';

/** argon2id-хеш пароля `admin-sporthub-2026` — администратор фикстур. */
export const FIXTURE_ADMIN_PASSWORD_PLAIN = 'admin-sporthub-2026';
export const FIXTURE_ADMIN_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$J4aplICq3nY8up+XpROw9g$DIZtaXmthO840qf0k84Y0G+ZC+ZSvBOJYpD3Pl+GYb4';

export const fixtureUsers: User[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    role: 'athlete',
    status: 'active',
    name: 'Алексей Смирнов',
    email: 'alexey@sporthub.local',
    phone: '+7 (927) 000-10-10',
    passwordHash: FIXTURE_PASSWORD_HASH,
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
    passwordHash: FIXTURE_PASSWORD_HASH,
    avatarUrl: '/images/users/marina-krylova.jpg',
    favoriteClubIds: [],
    city: 'Самара',
  },
  {
    id: 3,
    createdAt: '2026-04-07T09:00:00.000Z',
    role: 'admin',
    // Вид учётной записи (фаза 35): единственное различие, которое не выводится
    // из владения. У прочих он подразумевается человеком по умолчанию.
    accountKind: 'admin',
    status: 'active',
    name: 'Администратор SportHub',
    email: 'admin@sporthub.local',
    phone: '+7 (927) 000-30-30',
    passwordHash: FIXTURE_ADMIN_PASSWORD_HASH,
    avatarUrl: '/images/users/admin.jpg',
    favoriteClubIds: [],
  },
  {
    // Этап Э8a фазы 34: тренер как отдельная роль. До него общий набор знал
    // только спортсмена, представителя услуг и администратора — и ветка входа
    // тренером не была покрыта ни одним тестом, хотя роль существовала с фазы 4.
    // Публикаций у него нет намеренно: карточки набора принадлежат представителю
    // услуг, и переписывать их владельца ради одного пользователя значило бы
    // менять данные, на которых снят эталон контрактов.
    id: 4,
    createdAt: '2026-04-07T09:00:00.000Z',
    role: 'trainer',
    status: 'active',
    name: 'Павел Тренеров',
    email: 'pavel@sporthub.local',
    phone: '+7 (927) 000-40-40',
    passwordHash: FIXTURE_PASSWORD_HASH,
    favoriteClubIds: [],
    city: 'Самара',
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
 * Услуга тренера БЕЗ ссылки на связь — то, что лежит в базовом срезе.
 *
 * `fixtureTrainerOffering` хранит `trainerClubLinkId: 1`, а связей базовый срез
 * не засеивает: это ссылка в пустоту. Файлы её терпели, база — нет, у услуги
 * внешний ключ на связь. Отцепленная копия оставляет наблюдаемый ответ прежним
 * (номер связи не всплывает нигде, кроме карточки тренера) и делает срез целостным.
 * Наборам, которым нужна сама ссылка, её выдают наборы ниже — вместе со связью.
 */
export const fixtureTrainerOfferingDetached: Offering = (() => {
  const { trainerClubLinkId: _linked, ...rest } = fixtureTrainerOffering;

  return rest;
})();

/**
 * Недействующая связь тренер1↔клуб1 плюс услуга, которая на неё ссылается.
 *
 * Ровно то состояние, в котором снят эталон контрактов: у услуги номер связи есть,
 * а `affiliatedClub` пуст. Публичные поверхности читают только подтверждённые связи,
 * поэтому разорванная связь наблюдаемого ответа не меняет — но ссылке есть на что
 * указывать, и внешний ключ базы выполнен.
 */
export const fixtureHistoricLinkCollections = {
  'trainer-club-links': [
    {
      id: 1,
      createdAt: '2026-03-17T09:00:00.000Z',
      trainerId: 1,
      clubId: 1,
      status: 'revoked' as const,
      initiatedBy: 'trainer' as const,
      revokedAt: '2026-03-17T09:00:00.000Z',
      revokedBy: 'trainer' as const,
    },
  ],
  offerings: [fixtureClubOffering, fixtureTrainerOffering],
} as const;

/**
 * Справочники одним значением.
 *
 * Публикация ссылается на вид спорта, тег и удобство. В файлах такая ссылка ни на что
 * не опиралась, в базе это внешние ключи, поэтому справочники засеиваются вместе
 * с любой публикацией — и списком, а не по одному.
 */
export const fixtureDictionaryCollections = {
  sports: fixtureSports,
  cities: fixtureCities,
  tags: fixtureTags,
  amenities: fixtureAmenities,
  specialties: fixtureSpecialties,
  'work-formats': fixtureWorkFormats,
} as const;

/** Подтверждённая связь тренер1↔клуб1 плюс услуга, которая на неё ссылается. */
export const fixtureConfirmedLinkCollections = {
  'trainer-club-links': [DEFAULT_TRAINER_CLUB_LINK],
  offerings: [fixtureClubOffering, fixtureTrainerOffering],
} as const;

/**
 * Полный срез фикстур ДАННЫМИ, а не файлами.
 *
 * Появился в шаге 33.43: до него набор умел записываться только в директорию,
 * то есть годился одному хранилищу из двух. Ключи — имена коллекций, ровно те же,
 * что у файлов; кто пишет их на диск, а кто переносит в базу, решает потребитель.
 *
 * Срез ЦЕЛОСТНЫЙ: пользователи, справочники и публикации в нём есть всегда,
 * потому что на них ссылается всё остальное. У файлов это было необязательно —
 * у базы это внешние ключи.
 */
export const fixtureCollections = {
  users: fixtureUsers,
  clubs: [fixtureClub, fixtureClub2, fixtureClub3],
  trainers: [fixtureTrainer, fixtureTrainer3, fixtureTrainer5],
  offerings: [fixtureClubOffering, fixtureTrainerOfferingDetached],
  schedule: [fixtureClubSlot1, fixtureClubSlot2, fixtureClubSlot3, fixtureTrainerSlot],
  reviews: fixtureReviews,
  bookings: fixtureBookings,
  logs: [],
  sports: fixtureSports,
  cities: fixtureCities,
  tags: fixtureTags,
  amenities: fixtureAmenities,
  'work-formats': fixtureWorkFormats,
  specialties: fixtureSpecialties,
  notifications: [],
  // Связь тренер1↔клуб1 по умолчанию пуста: CRUD-наборы ссылок работают
  // на чистом срезе и заводят её сами.
  'trainer-club-links': [],
} as const;

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
    write('offerings.json', [fixtureClubOffering, fixtureTrainerOfferingDetached]),
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
    // Виды спорта добавлены в фазе 33: раньше они приезжали копией рабочего каталога
    // `data/`, и после его удаления сверку контрактов стало бы нечем поднять.
    write('sports.json', fixtureSports),
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
