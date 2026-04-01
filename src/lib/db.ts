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

type PublicationScheduleInput = EntityWithOverridableFields<
  Schedule,
  | 'id'
  | 'createdAt'
  | 'offeringId'
  | 'ownerType'
  | 'ownerId'
  | 'affiliatedClubId'
  | 'clubId'
  | 'trainerId'
  | 'bookedCount'
>;

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

/**
 * Входные данные для atomic-обновления клуба.
 * В edit-flow разрешены только активные MVP-поля — системные поля сохраняются из текущей сущности.
 */
export interface UpdateClubPublicationInput {
  clubId: EntityId;
  userId: EntityId;
  club: EntityWithOverridableFields<
    Club,
    | 'id'
    | 'createdAt'
    | 'slug'
    | 'website'
    | 'coordinates'
    | 'imageUrls'
    | 'rating'
    | 'reviewCount'
    | 'distanceKm'
    | 'isFeatured'
    | 'managedByUserId'
    | 'source'
    | 'status'
  >;
  offering: EntityWithOverridableFields<
    Offering,
    'id' | 'createdAt' | 'ownerId' | 'affiliatedClubId' | 'coordinates'
  >;
  schedules: PublicationScheduleInput[];
}

/**
 * Входные данные для atomic-обновления тренера.
 * В edit-flow разрешены только активные MVP-поля — системные поля сохраняются из текущей сущности.
 */
export interface UpdateTrainerPublicationInput {
  trainerId: EntityId;
  userId: EntityId;
  trainer: EntityWithOverridableFields<
    Trainer,
    | 'id'
    | 'createdAt'
    | 'slug'
    | 'avatarUrl'
    | 'coordinates'
    | 'clubId'
    | 'sportId'
    | 'rating'
    | 'reviewCount'
    | 'managedByUserId'
    | 'source'
    | 'status'
  >;
  offering: EntityWithOverridableFields<
    Offering,
    'id' | 'createdAt' | 'ownerId' | 'affiliatedClubId' | 'coordinates'
  >;
  schedules: PublicationScheduleInput[];
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

function ensureManagedByUser(
  managedByUserId: EntityId | undefined,
  expectedUserId: EntityId,
  entityLabel: string,
  entityId: EntityId,
): void {
  if (managedByUserId !== expectedUserId) {
    throw new Error(`Недостаточно прав для редактирования ${entityLabel} с id ${entityId}`);
  }
}

function findPrimaryOffering(
  offerings: Offering[],
  ownerType: CatalogOwnerType,
  ownerId: EntityId,
): Offering | null {
  return (
    offerings.find(
      (offering) => offering.ownerType === ownerType && offering.ownerId === ownerId,
    ) ?? null
  );
}

function isClubPublicationSchedule(
  scheduleItem: Schedule,
  clubId: EntityId,
  offeringId: EntityId,
): boolean {
  return (
    scheduleItem.clubId === clubId ||
    scheduleItem.offeringId === offeringId ||
    (scheduleItem.ownerType === 'club' && scheduleItem.ownerId === clubId)
  );
}

function isTrainerPublicationSchedule(
  scheduleItem: Schedule,
  trainerId: EntityId,
  offeringId: EntityId,
): boolean {
  return (
    scheduleItem.offeringId === offeringId ||
    (scheduleItem.ownerType === 'trainer' &&
      (scheduleItem.ownerId === trainerId || scheduleItem.trainerId === trainerId))
  );
}

function assertNoDuplicateScheduleIds(
  schedules: PublicationScheduleInput[],
  entityLabel: string,
): void {
  const existingSlotIds = schedules
    .map((slot) => slot.id)
    .filter((slotId): slotId is EntityId => slotId !== undefined);
  const uniqueIds = new Set(existingSlotIds);

  if (uniqueIds.size !== existingSlotIds.length) {
    throw new Error(`В payload редактирования ${entityLabel} есть повторяющиеся id слотов`);
  }
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

/**
 * Минимальный input для atomic-создания booking.
 * Сервер сам извлекает метаданные слота.
 */
export type CreateBookingAtomicInput = {
  scheduleId: EntityId;
  userId: EntityId;
};

/**
 * Input для отмены booking (hard-delete).
 */
export type CancelBookingInput = {
  bookingId: EntityId;
  userId: EntityId;
};

/**
 * Atomic-создание записи: booking + bookedCount++ единым rollback-сценарием.
 * Проверяет: существование слота, capacity, duplicate.
 * MVP: запись сразу confirmed. pending зарезервирован для будущего payment-flow.
 */
export async function createBookingAtomic(input: CreateBookingAtomicInput): Promise<Booking> {
  const [bookings, schedule, slotContext] = await Promise.all([
    getBookings(),
    readCollection('schedule'),
    getScheduleSlotContext(input.scheduleId),
  ]);

  if (!slotContext) {
    throw new Error('Слот расписания не найден');
  }

  const { affiliatedClub, club, offering, schedule: slot, trainer } = slotContext;

  // После hard-delete cancelled записей нет в JSON → любой existing = duplicate
  const duplicate = bookings.find(
    (booking) => booking.userId === input.userId && booking.scheduleId === input.scheduleId,
  );

  if (duplicate) {
    throw new Error('Пользователь уже записан на это занятие');
  }

  if (slot.bookedCount >= slot.capacity) {
    throw new Error('Свободных мест нет');
  }

  // Собираем booking
  const booking: Booking = {
    id: getNextEntityId(bookings),
    createdAt: createTimestamp(),
    scheduleId: input.scheduleId,
    offeringId: slot.offeringId,
    ownerType: slot.ownerType,
    ownerId: slot.ownerId,
    affiliatedClubId: slot.affiliatedClubId ?? affiliatedClub?.id,
    userId: input.userId,
    clubId: club?.id,
    trainerId: trainer?.id ?? slot.trainerId,
    sportId: offering?.sportId ?? slot.sportId,
    date: slot.date,
    status: 'confirmed',
    paymentStatus: 'unpaid',
    totalPrice: offering?.price ?? slot.price,
  };

  // Обновляем bookedCount в schedule
  const rawSlotIndex = schedule.findIndex((item) => item.id === input.scheduleId);
  const updatedSchedule = [...schedule];

  updatedSchedule[rawSlotIndex] = {
    ...schedule[rawSlotIndex],
    bookedCount: schedule[rawSlotIndex].bookedCount + 1,
  };

  const updatedBookings = [...bookings, booking];

  // Atomic write: bookings + schedule
  await writeCollectionsWithRollback([
    { key: 'bookings', next: updatedBookings, previous: bookings },
    { key: 'schedule', next: updatedSchedule, previous: schedule },
  ]);

  return booking;
}

/**
 * Отмена записи: hard-delete booking + bookedCount-- единым rollback-сценарием.
 * Проверяет ownership: только владелец записи может отменить.
 */
export async function cancelBooking(input: CancelBookingInput): Promise<void> {
  const [bookings, schedule] = await Promise.all([getBookings(), readCollection('schedule')]);

  const bookingIndex = bookings.findIndex((booking) => booking.id === input.bookingId);

  if (bookingIndex === -1) {
    throw new Error('Запись не найдена');
  }

  const booking = bookings[bookingIndex];

  if (booking.userId !== input.userId) {
    throw new Error('Недостаточно прав для отмены записи');
  }

  // Удаляем booking из массива (hard-delete)
  const updatedBookings = bookings.filter((b) => b.id !== input.bookingId);

  // Уменьшаем bookedCount
  const slotIndex = schedule.findIndex((item) => item.id === booking.scheduleId);
  const updatedSchedule = [...schedule];

  if (slotIndex !== -1) {
    updatedSchedule[slotIndex] = {
      ...schedule[slotIndex],
      bookedCount: Math.max(0, schedule[slotIndex].bookedCount - 1),
    };
  }

  // Atomic write: bookings + schedule
  await writeCollectionsWithRollback([
    { key: 'bookings', next: updatedBookings, previous: bookings },
    { key: 'schedule', next: updatedSchedule, previous: schedule },
  ]);
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
 * Pseudo-atomic обновление клуба: club + primary offering + schedule[].
 * Сохраняет системные поля сущности и существующие slot.id / createdAt / bookedCount.
 */
export async function updateClubPublication(
  input: UpdateClubPublicationInput,
): Promise<ClubPublicationResult> {
  const now = createTimestamp();
  const [clubs, offerings, schedule] = await Promise.all([
    readCollection('clubs'),
    readCollection('offerings'),
    readCollection('schedule'),
  ]);

  const currentClub = clubs.find((club) => club.id === input.clubId);

  if (!currentClub) {
    throw new Error(`Клуб с id ${input.clubId} не найден`);
  }

  ensureManagedByUser(currentClub.managedByUserId, input.userId, 'клуба', input.clubId);

  const currentOffering = findPrimaryOffering(offerings, 'club', input.clubId);

  if (!currentOffering) {
    throw new Error(`Основная услуга клуба с id ${input.clubId} не найдена`);
  }

  const currentSchedules = schedule.filter((slot) =>
    isClubPublicationSchedule(slot, input.clubId, currentOffering.id),
  );
  const currentScheduleById = new Map(currentSchedules.map((slot) => [slot.id, slot]));
  let nextScheduleId = getNextEntityId(schedule);

  assertNoDuplicateScheduleIds(input.schedules, 'клуба');

  const club: Club = {
    ...currentClub,
    name: input.club.name,
    description: input.club.description,
    shortDescription: input.club.shortDescription,
    city: input.club.city,
    address: input.club.address,
    phone: input.club.phone,
    email: input.club.email,
    sportIds: input.club.sportIds,
    amenities: input.club.amenities,
    tags: input.club.tags,
    priceFrom: input.club.priceFrom,
  };

  const offering: Offering = {
    ...currentOffering,
    sportId: input.offering.sportId,
    title: input.offering.title,
    description: input.offering.description,
    format: input.offering.format,
    price: input.offering.price,
    durationMinutes: input.offering.durationMinutes,
    capacity: input.offering.capacity,
    address: input.offering.address,
    ownerType: 'club',
    ownerId: input.clubId,
    affiliatedClubId: input.clubId,
  };

  const schedules: Schedule[] = input.schedules.map((slotInput) => {
    const currentSlot =
      slotInput.id !== undefined ? (currentScheduleById.get(slotInput.id) ?? null) : null;

    if (slotInput.id !== undefined && !currentSlot) {
      throw new Error(`Слот клуба с id ${slotInput.id} не найден`);
    }

    const slotId = currentSlot?.id ?? nextScheduleId++;

    return {
      ...currentSlot,
      id: slotId,
      createdAt: currentSlot?.createdAt ?? now,
      offeringId: currentOffering.id,
      ownerType: 'club',
      ownerId: input.clubId,
      affiliatedClubId: input.clubId,
      clubId: input.clubId,
      sportId: slotInput.sportId,
      title: slotInput.title,
      date: slotInput.date,
      startTime: slotInput.startTime,
      endTime: slotInput.endTime,
      durationMinutes: slotInput.durationMinutes,
      level: currentSlot?.level ?? slotInput.level,
      capacity: slotInput.capacity,
      bookedCount: currentSlot?.bookedCount ?? 0,
      price: slotInput.price,
      room: slotInput.room,
    };
  });

  const nextClubs = clubs.map((clubItem) => (clubItem.id === input.clubId ? club : clubItem));
  const nextOfferings = offerings.map((offeringItem) =>
    offeringItem.id === currentOffering.id ? offering : offeringItem,
  );
  const nextSchedule = [
    ...schedule.filter(
      (slot) => !isClubPublicationSchedule(slot, input.clubId, currentOffering.id),
    ),
    ...schedules,
  ];

  await writeCollectionsWithRollback([
    { key: 'clubs', next: nextClubs, previous: clubs },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
  ]);

  return { club, offering, schedules };
}

/**
 * Pseudo-atomic обновление тренера: trainer + primary offering + schedule[].
 * Сохраняет системные поля сущности и существующие slot.id / createdAt / bookedCount.
 */
export async function updateTrainerPublication(
  input: UpdateTrainerPublicationInput,
): Promise<TrainerPublicationResult> {
  const now = createTimestamp();
  const [trainers, offerings, schedule] = await Promise.all([
    readCollection('trainers'),
    readCollection('offerings'),
    readCollection('schedule'),
  ]);

  const currentTrainer = trainers.find((trainer) => trainer.id === input.trainerId);

  if (!currentTrainer) {
    throw new Error(`Тренер с id ${input.trainerId} не найден`);
  }

  ensureManagedByUser(currentTrainer.managedByUserId, input.userId, 'тренера', input.trainerId);

  const currentOffering = findPrimaryOffering(offerings, 'trainer', input.trainerId);

  if (!currentOffering) {
    throw new Error(`Основная услуга тренера с id ${input.trainerId} не найдена`);
  }

  const currentSchedules = schedule.filter((slot) =>
    isTrainerPublicationSchedule(slot, input.trainerId, currentOffering.id),
  );
  const currentScheduleById = new Map(currentSchedules.map((slot) => [slot.id, slot]));
  let nextScheduleId = getNextEntityId(schedule);

  assertNoDuplicateScheduleIds(input.schedules, 'тренера');

  const affiliatedClubId = input.trainer.affiliatedClubId ?? null;
  const trainerBase: Trainer = {
    ...currentTrainer,
    name: input.trainer.name,
    bio: input.trainer.bio,
    experienceYears: input.trainer.experienceYears,
    specialties: input.trainer.specialties,
    priceFrom: input.trainer.priceFrom,
    sportIds: input.trainer.sportIds,
    city: input.trainer.city,
    address: input.trainer.address,
    sportId: input.trainer.sportIds[0],
  };
  const trainer = normalizeTrainer(
    affiliatedClubId === null
      ? {
          ...trainerBase,
          affiliatedClubId: undefined,
          clubId: undefined,
        }
      : {
          ...trainerBase,
          affiliatedClubId,
          clubId: affiliatedClubId,
        },
  );

  const offeringBase: Offering = {
    ...currentOffering,
    sportId: input.offering.sportId,
    title: input.offering.title,
    description: input.offering.description,
    format: input.offering.format,
    price: input.offering.price,
    durationMinutes: input.offering.durationMinutes,
    capacity: input.offering.capacity,
    address: input.offering.address,
    ownerType: 'trainer',
    ownerId: input.trainerId,
  };
  const offering =
    affiliatedClubId === null
      ? {
          ...offeringBase,
          affiliatedClubId: undefined,
        }
      : {
          ...offeringBase,
          affiliatedClubId,
        };

  const schedules: Schedule[] = input.schedules.map((slotInput) => {
    const currentSlot =
      slotInput.id !== undefined ? (currentScheduleById.get(slotInput.id) ?? null) : null;

    if (slotInput.id !== undefined && !currentSlot) {
      throw new Error(`Слот тренера с id ${slotInput.id} не найден`);
    }

    const slotId = currentSlot?.id ?? nextScheduleId++;
    const baseSlot: Schedule = {
      ...currentSlot,
      id: slotId,
      createdAt: currentSlot?.createdAt ?? now,
      offeringId: currentOffering.id,
      ownerType: 'trainer',
      ownerId: input.trainerId,
      trainerId: input.trainerId,
      sportId: slotInput.sportId,
      title: slotInput.title,
      date: slotInput.date,
      startTime: slotInput.startTime,
      endTime: slotInput.endTime,
      durationMinutes: slotInput.durationMinutes,
      level: currentSlot?.level ?? slotInput.level,
      capacity: slotInput.capacity,
      bookedCount: currentSlot?.bookedCount ?? 0,
      price: slotInput.price,
      room: slotInput.room,
    };

    return affiliatedClubId === null
      ? {
          ...baseSlot,
          affiliatedClubId: undefined,
        }
      : {
          ...baseSlot,
          affiliatedClubId,
        };
  });

  const nextTrainers = trainers.map((trainerItem) =>
    trainerItem.id === input.trainerId ? trainer : trainerItem,
  );
  const nextOfferings = offerings.map((offeringItem) =>
    offeringItem.id === currentOffering.id ? offering : offeringItem,
  );
  const nextSchedule = [
    ...schedule.filter(
      (slot) => !isTrainerPublicationSchedule(slot, input.trainerId, currentOffering.id),
    ),
    ...schedules,
  ];

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
