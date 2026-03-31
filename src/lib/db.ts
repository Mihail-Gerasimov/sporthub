import 'server-only';

import * as fs from 'node:fs/promises';
import path from 'node:path';

import { getProjectDataDirectory } from '@/lib/projectPaths';
import type {
  Booking,
  CatalogOwnerType,
  Club,
  EntityId,
  Offering,
  Review,
  Schedule,
  Sport,
  Trainer,
  User,
} from '@/types';

// STUB: заменить на Prisma при переходе на PostgreSQL.

type DataCollectionMap = {
  bookings: Booking[];
  clubs: Club[];
  offerings: Offering[];
  reviews: Review[];
  schedule: Schedule[];
  sports: Sport[];
  trainers: Trainer[];
  users: User[];
};

type EntityWithOverridableFields<Entity, Keys extends keyof Entity> = Omit<Entity, Keys> &
  Partial<Pick<Entity, Keys>>;

export type CreateBookingInput = Omit<Booking, 'id' | 'createdAt'>;
export type CreateReviewInput = Omit<Review, 'id' | 'createdAt'>;

/**
 * Входные данные для atomic-создания клуба.
 * Принимает полные сущности из контракта — db перезаписывает id, createdAt и кросс-ссылки.
 */
export interface CreateClubPublicationInput {
  club: EntityWithOverridableFields<Club, 'id' | 'createdAt'>;
  offering: EntityWithOverridableFields<
    Offering,
    'id' | 'createdAt' | 'ownerId' | 'affiliatedClubId'
  >;
  schedules: EntityWithOverridableFields<
    Schedule,
    'id' | 'createdAt' | 'ownerId' | 'clubId' | 'offeringId' | 'affiliatedClubId'
  >[];
}

/** Результат atomic-создания клуба */
export interface ClubPublicationResult {
  club: Club;
  offering: Offering;
  schedules: Schedule[];
}

/**
 * Входные данные для atomic-создания тренера.
 * Принимает полные сущности из контракта — db перезаписывает id, createdAt и кросс-ссылки.
 */
export interface CreateTrainerPublicationInput {
  trainer: EntityWithOverridableFields<Trainer, 'id' | 'createdAt'>;
  offering: EntityWithOverridableFields<Offering, 'id' | 'createdAt' | 'ownerId'>;
  schedules: EntityWithOverridableFields<
    Schedule,
    'id' | 'createdAt' | 'ownerId' | 'trainerId' | 'offeringId' | 'affiliatedClubId'
  >[];
}

/** Результат atomic-создания тренера */
export interface TrainerPublicationResult {
  trainer: Trainer;
  offering: Offering;
  schedules: Schedule[];
}
export type GetScheduleOptions = {
  ownerType?: CatalogOwnerType | 'all';
};
export type ScheduleSlotContext = {
  affiliatedClub: Club | null;
  club: Club | null;
  offering: Offering | null;
  schedule: Schedule;
  trainer: Trainer | null;
};

const DATA_FILES: { [Key in keyof DataCollectionMap]: string } = {
  bookings: 'bookings.json',
  clubs: 'clubs.json',
  offerings: 'offerings.json',
  reviews: 'reviews.json',
  schedule: 'schedule.json',
  sports: 'sports.json',
  trainers: 'trainers.json',
  users: 'users.json',
};

function getDataDirectory(): string {
  const overrideDirectory = process.env.SPORT_HUB_DATA_DIRECTORY;

  if (overrideDirectory && overrideDirectory.trim() !== '') {
    return overrideDirectory;
  }

  return getProjectDataDirectory();
}

async function readCollection<Key extends keyof DataCollectionMap>(
  key: Key,
): Promise<DataCollectionMap[Key]> {
  const filePath = path.join(getDataDirectory(), DATA_FILES[key]);
  const raw = await fs.readFile(filePath, 'utf8');

  return JSON.parse(raw) as DataCollectionMap[Key];
}

async function writeCollection<Key extends keyof DataCollectionMap>(
  key: Key,
  data: DataCollectionMap[Key],
): Promise<void> {
  const filePath = path.join(getDataDirectory(), DATA_FILES[key]);

  if (writeCollectionTestHook) {
    await writeCollectionTestHook(key, data);
  }

  await fs.writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

type CollectionWrite<Key extends keyof DataCollectionMap> = {
  key: Key;
  next: DataCollectionMap[Key];
  previous: DataCollectionMap[Key];
};

type WriteCollectionTestHook = <Key extends keyof DataCollectionMap>(
  key: Key,
  data: DataCollectionMap[Key],
) => Promise<void> | void;

let writeCollectionTestHook: WriteCollectionTestHook | null = null;

/** Тестовый хук для симуляции ошибок записи без моков ESM-модуля fs/promises. */
export function __setWriteCollectionTestHookForTests(hook: WriteCollectionTestHook | null): void {
  writeCollectionTestHook = hook;
}

/**
 * Пишет несколько коллекций единым сценарием и откатывает уже записанные,
 * если одна из операций завершилась с ошибкой.
 */
async function writeCollectionsWithRollback<Key extends keyof DataCollectionMap>(
  writes: CollectionWrite<Key>[],
): Promise<void> {
  const completedWrites: CollectionWrite<Key>[] = [];

  try {
    for (const write of writes) {
      await writeCollection(write.key, write.next);
      completedWrites.push(write);
    }
  } catch (error) {
    for (const write of [...completedWrites].reverse()) {
      try {
        await writeCollection(write.key, write.previous);
      } catch (rollbackError) {
        console.error('Не удалось откатить коллекцию после ошибки записи:', rollbackError);
      }
    }

    throw error;
  }
}

function getNextEntityId(items: Array<{ id: EntityId }>): EntityId {
  if (items.length === 0) {
    return 1;
  }

  return Math.max(...items.map((item) => item.id)) + 1;
}

function createTimestamp(): string {
  return new Date().toISOString();
}

function normalizeSlugLookupValue(slug: string): string {
  const trimmedSlug = slug.trim();

  if (trimmedSlug === '') {
    return '';
  }

  let decodedSlug = trimmedSlug;

  try {
    decodedSlug = decodeURIComponent(trimmedSlug);
  } catch {
    decodedSlug = trimmedSlug;
  }

  return decodedSlug.normalize('NFC').toLocaleLowerCase('ru-RU');
}

function normalizeTrainer(trainer: Trainer): Trainer {
  const affiliatedClubId = trainer.affiliatedClubId ?? trainer.clubId;
  const sportIds =
    Array.isArray(trainer.sportIds) && trainer.sportIds.length > 0
      ? trainer.sportIds
      : trainer.sportId !== undefined
        ? [trainer.sportId]
        : [];

  return {
    ...trainer,
    affiliatedClubId,
    clubId: trainer.clubId ?? affiliatedClubId,
    sportIds,
    sportId: trainer.sportId ?? sportIds[0],
  };
}

function normalizeSchedule(
  scheduleItem: Schedule,
  offeringsById: Map<EntityId, Offering>,
): Schedule {
  const offering =
    scheduleItem.offeringId !== undefined
      ? (offeringsById.get(scheduleItem.offeringId) ?? null)
      : null;
  const ownerType = scheduleItem.ownerType ?? offering?.ownerType ?? 'club';
  const ownerId =
    scheduleItem.ownerId ??
    offering?.ownerId ??
    (ownerType === 'club' ? scheduleItem.clubId : scheduleItem.trainerId);
  const affiliatedClubId =
    scheduleItem.affiliatedClubId ?? offering?.affiliatedClubId ?? scheduleItem.clubId ?? undefined;
  const clubId =
    scheduleItem.clubId ?? (ownerType === 'club' && ownerId !== undefined ? ownerId : undefined);
  const trainerId =
    scheduleItem.trainerId ??
    (ownerType === 'trainer' && ownerId !== undefined ? ownerId : undefined);

  return {
    ...scheduleItem,
    affiliatedClubId,
    clubId,
    offeringId: scheduleItem.offeringId ?? offering?.id,
    ownerId,
    ownerType,
    trainerId,
  };
}

export async function getClubs(): Promise<Club[]> {
  return readCollection('clubs');
}

export async function getClubById(id: EntityId): Promise<Club | null> {
  const clubs = await getClubs();
  return clubs.find((club) => club.id === id) ?? null;
}

export async function getClubBySlug(slug: string): Promise<Club | null> {
  const clubs = await getClubs();
  const normalizedSlug = normalizeSlugLookupValue(slug);

  return clubs.find((club) => normalizeSlugLookupValue(club.slug) === normalizedSlug) ?? null;
}

export async function getTrainers(): Promise<Trainer[]> {
  const trainers = await readCollection('trainers');
  return trainers.map(normalizeTrainer);
}

export async function getTrainerById(id: EntityId): Promise<Trainer | null> {
  const trainers = await getTrainers();
  return trainers.find((trainer) => trainer.id === id) ?? null;
}

export async function getTrainerBySlug(slug: string): Promise<Trainer | null> {
  const trainers = await getTrainers();
  const normalizedSlug = normalizeSlugLookupValue(slug);

  return (
    trainers.find((trainer) => normalizeSlugLookupValue(trainer.slug) === normalizedSlug) ?? null
  );
}

export async function getOfferings(): Promise<Offering[]> {
  return readCollection('offerings');
}

export async function getOfferingById(id: EntityId): Promise<Offering | null> {
  const offerings = await getOfferings();
  return offerings.find((offering) => offering.id === id) ?? null;
}

export async function getClubOfferings(clubId: EntityId): Promise<Offering[]> {
  const offerings = await getOfferings();
  return offerings.filter(
    (offering) => offering.ownerType === 'club' && offering.ownerId === clubId,
  );
}

export async function getTrainerOfferings(trainerId: EntityId): Promise<Offering[]> {
  const offerings = await getOfferings();
  return offerings.filter(
    (offering) => offering.ownerType === 'trainer' && offering.ownerId === trainerId,
  );
}

export async function getSchedule(options: GetScheduleOptions = {}): Promise<Schedule[]> {
  const ownerType = options.ownerType ?? 'club';
  const [offerings, schedule] = await Promise.all([getOfferings(), readCollection('schedule')]);
  const offeringsById = new Map(offerings.map((offering) => [offering.id, offering]));
  let normalizedSchedule = schedule.map((slot) => normalizeSchedule(slot, offeringsById));

  if (ownerType !== 'all') {
    normalizedSchedule = normalizedSchedule.filter((slot) => slot.ownerType === ownerType);
  }

  return normalizedSchedule;
}

export async function getScheduleById(id: EntityId): Promise<Schedule | null> {
  const schedule = await getSchedule({
    ownerType: 'all',
  });
  return schedule.find((slot) => slot.id === id) ?? null;
}

export async function getScheduleSlotContext(id: EntityId): Promise<ScheduleSlotContext | null> {
  const [scheduleItem, offerings, clubs, trainers] = await Promise.all([
    getScheduleById(id),
    getOfferings(),
    getClubs(),
    getTrainers(),
  ]);

  if (!scheduleItem) {
    return null;
  }

  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const trainerById = new Map(trainers.map((trainer) => [trainer.id, trainer]));
  const offering =
    scheduleItem.offeringId !== undefined
      ? (offerings.find((item) => item.id === scheduleItem.offeringId) ?? null)
      : null;
  const club =
    scheduleItem.clubId !== undefined
      ? (clubById.get(scheduleItem.clubId) ?? null)
      : offering?.ownerType === 'club'
        ? (clubById.get(offering.ownerId) ?? null)
        : null;
  const trainer =
    scheduleItem.trainerId !== undefined
      ? (trainerById.get(scheduleItem.trainerId) ?? null)
      : offering?.ownerType === 'trainer'
        ? (trainerById.get(offering.ownerId) ?? null)
        : null;
  const affiliatedClub =
    scheduleItem.affiliatedClubId !== undefined
      ? (clubById.get(scheduleItem.affiliatedClubId) ?? null)
      : offering?.affiliatedClubId !== undefined
        ? (clubById.get(offering.affiliatedClubId) ?? null)
        : null;

  return {
    affiliatedClub,
    club,
    offering,
    schedule: scheduleItem,
    trainer,
  };
}

export async function getSports(): Promise<Sport[]> {
  return readCollection('sports');
}

export async function getReviews(): Promise<Review[]> {
  return readCollection('reviews');
}

export async function getBookings(): Promise<Booking[]> {
  return readCollection('bookings');
}

export async function getUsers(): Promise<User[]> {
  return readCollection('users');
}

export async function getUserById(id: EntityId): Promise<User | null> {
  const users = await getUsers();
  return users.find((user) => user.id === id) ?? null;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const bookings = await getBookings();

  const booking: Booking = {
    id: getNextEntityId(bookings),
    createdAt: createTimestamp(),
    ...input,
  };

  bookings.push(booking);
  await writeCollection('bookings', bookings);

  return booking;
}

export async function incrementScheduleBookedCount(scheduleId: EntityId): Promise<Schedule | null> {
  const [offerings, schedule] = await Promise.all([getOfferings(), readCollection('schedule')]);
  const offeringsById = new Map(offerings.map((offering) => [offering.id, offering]));
  const slotIndex = schedule.findIndex((item) => item.id === scheduleId);

  if (slotIndex === -1) {
    return null;
  }

  const slot = schedule[slotIndex];

  if (slot.bookedCount >= slot.capacity) {
    return null;
  }

  const updatedSlot = {
    ...slot,
    bookedCount: slot.bookedCount + 1,
  };

  schedule[slotIndex] = updatedSlot;
  await writeCollection('schedule', schedule);

  return normalizeSchedule(updatedSlot, offeringsById);
}

export async function createReview(input: CreateReviewInput): Promise<Review> {
  const reviews = await getReviews();

  const review: Review = {
    id: getNextEntityId(reviews),
    createdAt: createTimestamp(),
    ...input,
  };

  reviews.push(review);
  await writeCollection('reviews', reviews);

  return review;
}

/**
 * Pseudo-atomic создание клуба: club + offering + schedule[].
 * Сначала собирает все сущности в памяти, затем пишет коллекции с rollback.
 */
export async function createClubPublication(
  input: CreateClubPublicationInput,
): Promise<ClubPublicationResult> {
  const now = createTimestamp();

  // Читаем все нужные коллекции одним batch
  const [clubs, offerings, schedule] = await Promise.all([
    readCollection('clubs'),
    readCollection('offerings'),
    readCollection('schedule'),
  ]);

  // Назначаем ID через max+1
  const clubId = getNextEntityId(clubs);
  const offeringId = getNextEntityId(offerings);
  let nextScheduleId = getNextEntityId(schedule);

  const club: Club = {
    ...input.club,
    id: clubId,
    createdAt: now,
  };

  const offering: Offering = {
    ...input.offering,
    id: offeringId,
    createdAt: now,
    ownerId: clubId,
    affiliatedClubId: clubId,
  };

  const schedules: Schedule[] = input.schedules.map((slot) => {
    const id = nextScheduleId++;

    return {
      ...slot,
      id,
      createdAt: now,
      offeringId,
      ownerId: clubId,
      clubId,
      affiliatedClubId: clubId,
    };
  });

  const nextClubs = [...clubs, club];
  const nextOfferings = [...offerings, offering];
  const nextSchedule = [...schedule, ...schedules];

  await writeCollectionsWithRollback([
    { key: 'clubs', next: nextClubs, previous: clubs },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
  ]);

  return { club, offering, schedules };
}

/**
 * Pseudo-atomic создание тренера: trainer + offering + schedule[].
 * Сначала собирает все сущности в памяти, затем пишет коллекции с rollback.
 */
export async function createTrainerPublication(
  input: CreateTrainerPublicationInput,
): Promise<TrainerPublicationResult> {
  const now = createTimestamp();

  const [trainers, offerings, schedule] = await Promise.all([
    readCollection('trainers'),
    readCollection('offerings'),
    readCollection('schedule'),
  ]);

  const trainerId = getNextEntityId(trainers);
  const offeringId = getNextEntityId(offerings);
  let nextScheduleId = getNextEntityId(schedule);

  const trainer: Trainer = {
    ...input.trainer,
    id: trainerId,
    createdAt: now,
  };

  const offering: Offering = {
    ...input.offering,
    id: offeringId,
    createdAt: now,
    ownerId: trainerId,
  };

  const affiliatedClubId = trainer.affiliatedClubId ?? offering.affiliatedClubId;
  const schedules: Schedule[] = input.schedules.map((slot) => {
    const id = nextScheduleId++;

    return {
      ...slot,
      id,
      createdAt: now,
      offeringId,
      ownerId: trainerId,
      trainerId,
      ...(affiliatedClubId !== undefined ? { affiliatedClubId } : {}),
    };
  });

  const nextTrainers = [...trainers, trainer];
  const nextOfferings = [...offerings, offering];
  const nextSchedule = [...schedule, ...schedules];

  await writeCollectionsWithRollback([
    { key: 'trainers', next: nextTrainers, previous: trainers },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
  ]);

  return { trainer, offering, schedules };
}

/**
 * Каскадное удаление клуба: club + offerings + schedule + bookings + reviews.
 * Атомарная операция через writeCollectionsWithRollback.
 */
export async function deleteClubPublication(clubId: EntityId): Promise<void> {
  const [clubs, offerings, schedule, bookings, reviews] = await Promise.all([
    readCollection('clubs'),
    readCollection('offerings'),
    readCollection('schedule'),
    readCollection('bookings'),
    readCollection('reviews'),
  ]);

  const club = clubs.find((c) => c.id === clubId);

  if (!club) {
    throw new Error(`Клуб с id ${clubId} не найден`);
  }

  // ID связанных offerings для фильтрации schedule
  const relatedOfferingIds = new Set(
    offerings.filter((o) => o.ownerType === 'club' && o.ownerId === clubId).map((o) => o.id),
  );

  const nextClubs = clubs.filter((c) => c.id !== clubId);
  const nextOfferings = offerings.filter((o) => !relatedOfferingIds.has(o.id));
  const nextSchedule = schedule.filter(
    (s) => s.clubId !== clubId && !relatedOfferingIds.has(s.offeringId ?? -1),
  );
  const nextBookings = bookings.filter((b) => b.clubId !== clubId);
  const nextReviews = reviews.filter((r) => r.clubId !== clubId);

  await writeCollectionsWithRollback([
    { key: 'clubs', next: nextClubs, previous: clubs },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
    { key: 'bookings', next: nextBookings, previous: bookings },
    { key: 'reviews', next: nextReviews, previous: reviews },
  ]);
}

/**
 * Каскадное удаление тренера: trainer + offerings + schedule + bookings + reviews.
 * Атомарная операция через writeCollectionsWithRollback.
 */
export async function deleteTrainerPublication(trainerId: EntityId): Promise<void> {
  const [trainers, offerings, schedule, bookings, reviews] = await Promise.all([
    readCollection('trainers'),
    readCollection('offerings'),
    readCollection('schedule'),
    readCollection('bookings'),
    readCollection('reviews'),
  ]);

  const trainer = trainers.find((t) => t.id === trainerId);

  if (!trainer) {
    throw new Error(`Тренер с id ${trainerId} не найден`);
  }

  const relatedOfferingIds = new Set(
    offerings.filter((o) => o.ownerType === 'trainer' && o.ownerId === trainerId).map((o) => o.id),
  );

  const nextTrainers = trainers.filter((t) => t.id !== trainerId);
  const nextOfferings = offerings.filter((o) => !relatedOfferingIds.has(o.id));
  const nextSchedule = schedule.filter(
    (s) => s.trainerId !== trainerId && !relatedOfferingIds.has(s.offeringId ?? -1),
  );
  const nextBookings = bookings.filter((b) => b.trainerId !== trainerId);
  const nextReviews = reviews.filter((r) => r.trainerId !== trainerId);

  await writeCollectionsWithRollback([
    { key: 'trainers', next: nextTrainers, previous: trainers },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
    { key: 'bookings', next: nextBookings, previous: bookings },
    { key: 'reviews', next: nextReviews, previous: reviews },
  ]);
}
