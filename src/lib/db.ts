import 'server-only';

import * as fs from 'node:fs/promises';
import path from 'node:path';

import { ACTIVE_BOOKING_STATUSES } from '@/lib/booking-status';
import { DISCIPLINE_CONFIG, type DisciplineConfig } from '@/lib/discipline-config';
import { notify } from '@/lib/notify';
import { getProjectDataDirectory } from '@/lib/projectPaths';
import type {
  Amenity,
  Booking,
  BookingActor,
  BookingStatus,
  BookingStatusTransition,
  CancellationPolicy,
  CancelReason,
  CatalogOwnerType,
  City,
  Club,
  EntityId,
  ISODateTimeString,
  LogEntry,
  Notification,
  NotificationType,
  Offering,
  ProviderClientNote,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  TrainerClubLink,
  TrainerClubLinkStatus,
  User,
  WorkFormat,
} from '@/types';

// STUB: заменить на Prisma при переходе на PostgreSQL.

type DataCollectionMap = {
  amenities: Amenity[];
  bookings: Booking[];
  cities: City[];
  clubs: Club[];
  logs: LogEntry[];
  notifications: Notification[];
  offerings: Offering[];
  providerClientNotes: ProviderClientNote[];
  reviews: Review[];
  schedule: Schedule[];
  specialties: Specialty[];
  sports: Sport[];
  tags: Tag[];
  trainers: Trainer[];
  trainerClubLinks: TrainerClubLink[];
  users: User[];
  workFormats: WorkFormat[];
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
  offering: EntityWithOverridableFields<Offering, 'id' | 'createdAt' | 'ownerId'>;
  schedules: EntityWithOverridableFields<
    Schedule,
    'id' | 'createdAt' | 'ownerId' | 'clubId' | 'offeringId'
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
    'id' | 'createdAt' | 'ownerId' | 'trainerId' | 'offeringId'
  >[];
  /**
   * Phase 25 Step 25.1b: если указан, при создании тренера автоматически создаётся
   * confirmed `TrainerClubLink` (MVP provider управляет обеими сторонами). Пришло
   * на замену legacy `trainer.affiliatedClubId`/`offering.affiliatedClubId`.
   */
  clubId?: EntityId;
  /**
   * Phase 24 Step 24.10: дополнительные услуги (multi-offering). Каждый элемент —
   * пара offering + его собственные schedule-слоты. id/createdAt/ownerId/offeringId
   * проставляются атомарно внутри createTrainerPublication.
   */
  additionalOfferings?: Array<{
    offering: EntityWithOverridableFields<Offering, 'id' | 'createdAt' | 'ownerId'>;
    schedules: EntityWithOverridableFields<
      Schedule,
      'id' | 'createdAt' | 'ownerId' | 'trainerId' | 'offeringId'
    >[];
  }>;
}

/** Результат atomic-создания тренера */
export interface TrainerPublicationResult {
  trainer: Trainer;
  offering: Offering;
  schedules: Schedule[];
  /** Phase 24 Step 24.10: созданные дополнительные услуги + их расписание (в том же порядке, что вход). */
  additionalOfferings?: Array<{
    offering: Offering;
    schedules: Schedule[];
  }>;
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
  offering: EntityWithOverridableFields<Offering, 'id' | 'createdAt' | 'ownerId' | 'coordinates'>;
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
    | 'sportId'
    | 'rating'
    | 'reviewCount'
    | 'managedByUserId'
    | 'source'
    | 'status'
  >;
  offering: EntityWithOverridableFields<Offering, 'id' | 'createdAt' | 'ownerId' | 'coordinates'>;
  schedules: PublicationScheduleInput[];
  /**
   * Phase 25 Step 25.1a: дополнительные услуги (multi-offering) в режиме full-replace.
   * Diff по id: элементы с существующим `offering.id` обновляются (сохраняют createdAt),
   * элементы без id создаются заново, не упомянутые существующие — удаляются (вместе с их schedule).
   * Отсутствие поля в input означает «не трогать дополнительные услуги»; пустой массив `[]` —
   * удалить все дополнительные услуги. Опциональное поле для обратной совместимости с местами,
   * которые ещё не передают его.
   */
  additionalOfferings?: Array<{
    offering: EntityWithOverridableFields<Offering, 'id' | 'createdAt' | 'ownerId' | 'coordinates'>;
    schedules: PublicationScheduleInput[];
  }>;
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
  amenities: 'amenities.json',
  bookings: 'bookings.json',
  cities: 'cities.json',
  clubs: 'clubs.json',
  logs: 'logs.json',
  notifications: 'notifications.json',
  offerings: 'offerings.json',
  providerClientNotes: 'provider-client-notes.json',
  reviews: 'reviews.json',
  schedule: 'schedule.json',
  specialties: 'specialties.json',
  sports: 'sports.json',
  tags: 'tags.json',
  trainers: 'trainers.json',
  trainerClubLinks: 'trainer-club-links.json',
  users: 'users.json',
  workFormats: 'work-formats.json',
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

// Phase 25 Step 25.1b: normalizeTrainer больше не проставляет legacy
// `affiliatedClubId`/`clubId` — связь с клубом живёт в trainer-club-links.json.
function normalizeTrainer(trainer: Trainer): Trainer {
  const sportIds =
    Array.isArray(trainer.sportIds) && trainer.sportIds.length > 0
      ? trainer.sportIds
      : trainer.sportId !== undefined
        ? [trainer.sportId]
        : [];

  return {
    ...trainer,
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
  // Phase 25 Step 25.1b: legacy `affiliatedClubId` удалён. `clubId` остаётся:
  // для club-слотов = ownerId; для trainer-слотов — резолвится на уровне потребителя
  // через offering.trainerClubLinkId → link.clubId (здесь не обогащаем).
  const clubId =
    scheduleItem.clubId ?? (ownerType === 'club' && ownerId !== undefined ? ownerId : undefined);
  const trainerId =
    scheduleItem.trainerId ??
    (ownerType === 'trainer' && ownerId !== undefined ? ownerId : undefined);

  return {
    ...scheduleItem,
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
  const [scheduleItem, offerings, clubs, trainers, links] = await Promise.all([
    getScheduleById(id),
    getOfferings(),
    getClubs(),
    getTrainers(),
    getTrainerClubLinks({ status: 'confirmed' }),
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
  // Phase 25 Step 25.1b: affiliatedClub для trainer-слотов резолвится через
  // offering.trainerClubLinkId → confirmed TrainerClubLink. Для club-слотов =
  // тот же club. Legacy offering.affiliatedClubId / schedule.affiliatedClubId удалены.
  let affiliatedClub: Club | null = null;
  if (offering?.ownerType === 'club') {
    affiliatedClub = club;
  } else if (offering?.ownerType === 'trainer' && offering.trainerClubLinkId !== undefined) {
    const link = links.find((entry) => entry.id === offering.trainerClubLinkId);
    affiliatedClub = link ? (clubById.get(link.clubId) ?? null) : null;
  }

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

// --- Справочники (Phase 23) ---

/** Нормализация названия города для сравнения при дедупликации. */
function normalizeCity(name: string): string {
  return name.trim().toLocaleLowerCase('ru-RU');
}

/** Чтение списка городов. */
export async function getCities(): Promise<City[]> {
  return readCollection('cities');
}

/**
 * Добавление города с дедупликацией.
 * Если город с таким именем уже существует — возвращает его без создания дубликата.
 */
export async function appendCity(data: Omit<City, 'id' | 'createdAt'>): Promise<City> {
  const cities = await readCollection('cities');

  // Дедупликация по нормализованному имени
  const existing = cities.find((c) => normalizeCity(c.name) === normalizeCity(data.name));

  if (existing) {
    return existing;
  }

  const city: City = {
    id: getNextEntityId(cities),
    createdAt: createTimestamp(),
    ...data,
  };

  cities.push(city);
  await writeCollection('cities', cities);

  return city;
}

/** Чтение справочника тегов. */
export async function getTags(): Promise<Tag[]> {
  return readCollection('tags');
}

/** Чтение справочника удобств. */
export async function getAmenities(): Promise<Amenity[]> {
  return readCollection('amenities');
}

/** Чтение справочника форматов работы тренера. */
export async function getWorkFormats(): Promise<WorkFormat[]> {
  return readCollection('workFormats');
}

/** Чтение справочника специализаций тренера. */
export async function getSpecialties(): Promise<Specialty[]> {
  return readCollection('specialties');
}

// --- Phase 24: Уведомления (in-app notifications) ---

/** Опции фильтрации при чтении списка уведомлений. */
export type GetNotificationsOptions = {
  userId?: EntityId;
  unreadOnly?: boolean;
  offset?: number;
  limit?: number;
};

/**
 * Чтение уведомлений с опциональными фильтрами. Сортировка — по createdAt DESC
 * (самые свежие первыми). offset/limit применяются после фильтрации.
 */
export async function getNotifications(
  options: GetNotificationsOptions = {},
): Promise<Notification[]> {
  const all = await readCollection('notifications');

  let filtered = all;

  if (options.userId !== undefined) {
    filtered = filtered.filter((notification) => notification.userId === options.userId);
  }

  if (options.unreadOnly) {
    filtered = filtered.filter((notification) => notification.readAt === undefined);
  }

  // Сортировка по createdAt DESC — свежие уведомления выводятся первыми
  const sorted = filtered
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));

  const offset = options.offset ?? 0;
  const limit = options.limit;

  return limit === undefined ? sorted.slice(offset) : sorted.slice(offset, offset + limit);
}

/**
 * Создание уведомления. Payload сериализуем (JSON-совместим). id и createdAt
 * проставляются сервером — вызывающий передаёт только userId/type/payload.
 */
export async function createNotification(
  data: Omit<Notification, 'id' | 'createdAt'>,
): Promise<Notification> {
  const notifications = await readCollection('notifications');

  const notification: Notification = {
    id: getNextEntityId(notifications),
    createdAt: createTimestamp(),
    ...data,
  };

  notifications.push(notification);
  await writeCollection('notifications', notifications);

  return notification;
}

/**
 * Пометка одного уведомления прочитанным (устанавливает readAt = сейчас).
 * Бросает ошибку, если id не найден. Если readAt уже установлен — перезаписывает
 * текущим временем (идемпотентно безопасно, но в UI вызов делается один раз).
 */
export async function markNotificationRead(id: EntityId): Promise<Notification> {
  const notifications = await readCollection('notifications');
  const index = notifications.findIndex((notification) => notification.id === id);

  if (index === -1) {
    throw new Error('Уведомление не найдено');
  }

  const updated: Notification = {
    ...notifications[index],
    readAt: createTimestamp(),
  };

  notifications[index] = updated;
  await writeCollection('notifications', notifications);

  return updated;
}

/**
 * Массовая пометка всех непрочитанных уведомлений пользователя прочитанными.
 * Возвращает количество обновлённых записей (0, если непрочитанных не было).
 */
export async function markAllNotificationsRead(userId: EntityId): Promise<number> {
  const notifications = await readCollection('notifications');
  const timestamp = createTimestamp();
  let updatedCount = 0;

  const next = notifications.map((notification) => {
    if (notification.userId === userId && notification.readAt === undefined) {
      updatedCount += 1;
      return { ...notification, readAt: timestamp };
    }

    return notification;
  });

  if (updatedCount > 0) {
    await writeCollection('notifications', next);
  }

  return updatedCount;
}

/** Быстрый счётчик непрочитанных уведомлений пользователя — для bell-icon. */
export async function getUnreadNotificationCount(userId: EntityId): Promise<number> {
  const notifications = await readCollection('notifications');
  return notifications.filter(
    (notification) => notification.userId === userId && notification.readAt === undefined,
  ).length;
}

// --- Phase 24: Двусторонняя привязка тренер↔клуб ---

/** Опции фильтрации при чтении списка TrainerClubLink. */
export type GetTrainerClubLinksOptions = {
  trainerId?: EntityId;
  clubId?: EntityId;
  status?: TrainerClubLinkStatus;
};

/**
 * Чтение привязок тренер↔клуб с опциональными фильтрами. Сортировка —
 * по createdAt DESC (самые свежие сверху). Для публичных поверхностей обычно
 * используется фильтр status='confirmed'. inbox-подача провайдера — status='pending'.
 */
export async function getTrainerClubLinks(
  options: GetTrainerClubLinksOptions = {},
): Promise<TrainerClubLink[]> {
  const all = await readCollection('trainerClubLinks');

  let filtered = all;

  if (options.trainerId !== undefined) {
    filtered = filtered.filter((link) => link.trainerId === options.trainerId);
  }

  if (options.clubId !== undefined) {
    filtered = filtered.filter((link) => link.clubId === options.clubId);
  }

  if (options.status !== undefined) {
    filtered = filtered.filter((link) => link.status === options.status);
  }

  return filtered.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Точечное чтение одной привязки по id — для админских инструментов и guard'ов. */
export async function getTrainerClubLinkById(id: EntityId): Promise<TrainerClubLink | null> {
  const links = await readCollection('trainerClubLinks');
  return links.find((link) => link.id === id) ?? null;
}

/**
 * Создание нового link-request'а. Базовый статус — любой из TrainerClubLinkStatus,
 * но в типовом сценарии (Step 24.9) тренер создаёт связь со status='pending'.
 * id и createdAt проставляются сервером.
 */
export async function createTrainerClubLink(
  data: Omit<TrainerClubLink, 'id' | 'createdAt'>,
): Promise<TrainerClubLink> {
  const links = await readCollection('trainerClubLinks');

  const link: TrainerClubLink = {
    id: getNextEntityId(links),
    createdAt: createTimestamp(),
    ...data,
  };

  links.push(link);
  await writeCollection('trainerClubLinks', links);

  return link;
}

/**
 * Обновление существующей привязки — для approve/reject/revoke переходов
 * (Step 24.8). Принимает частичный patch с новым статусом и actor/timestamp
 * полями. id и createdAt из patch игнорируются. Бросает ошибку, если не найден.
 */
export async function updateTrainerClubLink(
  id: EntityId,
  patch: Partial<Omit<TrainerClubLink, 'id' | 'createdAt'>>,
): Promise<TrainerClubLink> {
  const links = await readCollection('trainerClubLinks');
  const index = links.findIndex((link) => link.id === id);

  if (index === -1) {
    throw new Error('Привязка тренер↔клуб не найдена');
  }

  const updated: TrainerClubLink = {
    ...links[index],
    ...patch,
  };

  links[index] = updated;
  await writeCollection('trainerClubLinks', links);

  return updated;
}

/**
 * Phase 24 Step 24.10d: отвязывает все offerings, привязанные к указанному link'у
 * (поле `trainerClubLinkId` сбрасывается в undefined → услуга становится «частной»).
 * Возвращает количество обновлённых offerings. Вызывается из revoke-эндпоинта после
 * успешной смены статуса link'а: при разрыве связи тренер↔клуб услуги автоматически
 * переходят в приватные, чтобы публичные поверхности не показывали «в клубе X».
 */
export async function detachOfferingsFromLink(linkId: EntityId): Promise<number> {
  const offerings = await readCollection('offerings');
  let updatedCount = 0;

  const next = offerings.map((offering) => {
    if (offering.trainerClubLinkId === linkId) {
      updatedCount += 1;
      const { trainerClubLinkId: _unused, ...rest } = offering;
      return rest as Offering;
    }
    return offering;
  });

  if (updatedCount > 0) {
    await writeCollection('offerings', next);
  }

  return updatedCount;
}

// --- Phase 25 Step 25.10: CRM-заметки провайдера ---

/** Опции фильтрации заметок провайдера. */
export type GetProviderClientNotesOptions = {
  providerUserId: EntityId;
  clientUserId?: EntityId;
};

/**
 * Чтение заметок провайдера. Всегда требует providerUserId (чужие заметки
 * не отдаём). Сортировка — по createdAt DESC (самые свежие сверху).
 * Опциональный clientUserId сужает выборку до одного клиента.
 */
export async function getProviderClientNotes(
  options: GetProviderClientNotesOptions,
): Promise<ProviderClientNote[]> {
  const all = await readCollection('providerClientNotes');

  let filtered = all.filter((note) => note.providerUserId === options.providerUserId);

  if (options.clientUserId !== undefined) {
    filtered = filtered.filter((note) => note.clientUserId === options.clientUserId);
  }

  return filtered.slice().sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

/** Точечное чтение одной заметки по id — для ownership-guard'ов в PATCH/DELETE. */
export async function getProviderClientNoteById(id: EntityId): Promise<ProviderClientNote | null> {
  const notes = await readCollection('providerClientNotes');
  return notes.find((note) => note.id === id) ?? null;
}

/**
 * SSR-чтение всех заметок в системе без фильтров. Используется только server-side
 * из `/profile/provider/clients/page.tsx`, где providerUserId на момент рендера
 * ещё неизвестен (auth живёт в клиентском store). Клиент сам фильтрует по текущей
 * сессии через `notesByClient`. НЕ должна использоваться в API-роутах.
 */
export async function getAllProviderClientNotes(): Promise<ProviderClientNote[]> {
  return readCollection('providerClientNotes');
}

/**
 * Создание новой заметки провайдера. id/createdAt/updatedAt проставляются сервером
 * (updatedAt при создании === createdAt). Никакой guard-логики здесь нет — вызывающий
 * API-эндпоинт обязан сам проверить `isClientOfProvider`.
 */
export async function createProviderClientNote(
  data: Omit<ProviderClientNote, 'id' | 'createdAt' | 'updatedAt'>,
): Promise<ProviderClientNote> {
  const notes = await readCollection('providerClientNotes');
  const now = createTimestamp();

  const note: ProviderClientNote = {
    id: getNextEntityId(notes),
    createdAt: now,
    updatedAt: now,
    ...data,
  };

  notes.push(note);
  await writeCollection('providerClientNotes', notes);

  return note;
}

/**
 * Обновление заметки (note + bookingId). Пересчитывает updatedAt. providerUserId,
 * clientUserId, id, createdAt не меняются. Если bookingId явно передан — пишем
 * новое значение (включая undefined для сброса привязки). Если поле отсутствует
 * в patch — оставляем как было.
 */
export async function updateProviderClientNote(
  id: EntityId,
  patch: { note?: string; bookingId?: EntityId },
): Promise<ProviderClientNote> {
  const notes = await readCollection('providerClientNotes');
  const index = notes.findIndex((note) => note.id === id);

  if (index === -1) {
    throw new Error('Заметка провайдера не найдена');
  }

  const current = notes[index];
  const updated: ProviderClientNote = {
    ...current,
    note: patch.note ?? current.note,
    bookingId: 'bookingId' in patch ? patch.bookingId : current.bookingId,
    updatedAt: createTimestamp(),
  };

  notes[index] = updated;
  await writeCollection('providerClientNotes', notes);

  return updated;
}

/**
 * Полное удаление заметки. Вызывается только из DELETE-эндпоинта после ownership-guard.
 * Если заметка уже удалена — no-op (не бросаем).
 */
export async function deleteProviderClientNote(id: EntityId): Promise<void> {
  const notes = await readCollection('providerClientNotes');
  const next = notes.filter((note) => note.id !== id);

  if (next.length === notes.length) {
    return;
  }

  await writeCollection('providerClientNotes', next);
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
 * Phase 24 Step 24.15: admin-снятие карантина атлета. Ставит `quarantineLiftedAt = now`
 * в `users.json`. Используется в `POST /api/admin/users/[id]/lift-quarantine`.
 * Возвращает обновлённого User. Бросает 'Пользователь не найден' если user.id отсутствует.
 */
export async function liftUserQuarantine(userId: EntityId): Promise<User> {
  const users = await getUsers();
  const targetIndex = users.findIndex((user) => user.id === userId);

  if (targetIndex === -1) {
    throw new Error('Пользователь не найден');
  }

  const now = new Date().toISOString() as ISODateTimeString;
  const updated: User = { ...users[targetIndex], quarantineLiftedAt: now };
  const nextUsers = [...users];
  nextUsers[targetIndex] = updated;

  await writeCollectionsWithRollback([{ key: 'users', next: nextUsers, previous: users }]);
  return updated;
}

/**
 * Phase 25 Step 25.7: запись/очистка дедуп-маркера quarantine уведомлений.
 * `value: null` → удаляет поле (при quarantine_end). `value: ISODateTimeString`
 * записывает `until` начавшегося карантина, чтобы второй hit с тем же окном
 * не слал повторный quarantine_start. Атомарно через writeCollectionsWithRollback.
 */
export async function setUserNotifiedQuarantineUntil(
  userId: EntityId,
  value: ISODateTimeString | null,
): Promise<User> {
  const users = await getUsers();
  const targetIndex = users.findIndex((user) => user.id === userId);

  if (targetIndex === -1) {
    throw new Error('Пользователь не найден');
  }

  const current = users[targetIndex];
  // Для value=null оставляем поле как undefined — JSON.stringify пропустит его при
  // записи, так что в users.json поле отсутствует (как до Step 25.7).
  const updated: User =
    value === null
      ? { ...current, notifiedQuarantineUntil: undefined }
      : { ...current, notifiedQuarantineUntil: value };
  const nextUsers = [...users];
  nextUsers[targetIndex] = updated;

  await writeCollectionsWithRollback([{ key: 'users', next: nextUsers, previous: users }]);
  return updated;
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
 * Input для отмены booking атлетом (Phase 24: soft-cancel через FSM).
 * Hard-delete доступен только через hardDeleteBooking (admin).
 */
export type CancelBookingInput = {
  bookingId: EntityId;
  userId: EntityId;
};

// --- Phase 24: FSM booking'а ---

/**
 * Карта допустимых переходов FSM. Финальные статусы (completed, no_show, unmarked,
 * rejected_by_provider, cancelled_by_*) не имеют исходящих переходов — админ использует
 * hardDeleteBooking для полного удаления. pending ведёт в 4 ветви финала; confirmed
 * добавляет check-in (completed / no_show) и ленивый unmarked.
 */
const FSM_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'rejected_by_provider', 'cancelled_by_athlete', 'cancelled_by_provider'],
  confirmed: ['completed', 'no_show', 'cancelled_by_athlete', 'cancelled_by_provider', 'unmarked'],
  completed: [],
  no_show: [],
  unmarked: [],
  rejected_by_provider: [],
  cancelled_by_athlete: [],
  cancelled_by_provider: [],
};

/**
 * Карта разрешённых акторов на каждый переход. Ключ — "from->to".
 * admin опускается в проверке — админ имеет право на любой валидный FSM-переход
 * (через инструменты Step 24.15). system — только для ленивых автопереходов.
 */
const TRANSITION_ACTORS: Partial<Record<string, BookingActor[]>> = {
  'pending->confirmed': ['provider'],
  'pending->rejected_by_provider': ['provider'],
  'pending->cancelled_by_athlete': ['athlete'],
  'pending->cancelled_by_provider': ['provider', 'system'],
  'confirmed->completed': ['provider'],
  'confirmed->no_show': ['provider'],
  'confirmed->cancelled_by_athlete': ['athlete'],
  'confirmed->cancelled_by_provider': ['provider'],
  'confirmed->unmarked': ['system'],
};

/**
 * Валидирует переход FSM по двум осям: допустимость (from→to есть в FSM_TRANSITIONS)
 * и право актора (admin — всегда; остальные — по TRANSITION_ACTORS). Бросает ошибку
 * с понятным русским сообщением, маппится на 4xx в API-роутах Step 24.4.
 */
function validateTransition(from: BookingStatus, to: BookingStatus, actor: BookingActor): void {
  const allowed = FSM_TRANSITIONS[from];

  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Недопустимый переход booking: ${from} → ${to}`);
  }

  if (actor === 'admin') {
    return;
  }

  const key = `${from}->${to}`;
  const allowedActors = TRANSITION_ACTORS[key];

  if (!allowedActors || !allowedActors.includes(actor)) {
    throw new Error(`Actor '${actor}' не может выполнять переход ${from} → ${to}`);
  }
}

/**
 * Правила изменения Schedule.bookedCount при переходе. Phase 24-семантика:
 * bookedCount — "физически занятые места", не "активные записи". Любая ветка отмены
 * или отказа освобождает место; финалы проведения (completed/no_show/unmarked)
 * не трогают счётчик — место уже было занято.
 */
function getBookedCountDelta(from: BookingStatus, to: BookingStatus): number {
  if (
    to === 'cancelled_by_athlete' ||
    to === 'cancelled_by_provider' ||
    to === 'rejected_by_provider'
  ) {
    return -1;
  }

  return 0;
}

// Парсит дату+время слота в абсолютный Date. MVP-конвенция: datetime в локальной TZ
// процесса. При миграции на Prisma — переход на TIMESTAMPTZ без смены API utility.
function getSlotStartAt(slot: Schedule): Date {
  return new Date(`${slot.date}T${slot.startTime}:00`);
}

function getSlotEndAt(slot: Schedule): Date {
  return new Date(`${slot.date}T${slot.endTime}:00`);
}

// Phase 24 Step 24.12: computeCancelReason — теперь чистая функция в reliability.ts,
// импортируется как единый источник правды. Здесь оставлен re-export внутреннего
// имени, чтобы не менять call-сайты внутри db.ts.
import { computeCancelReason as computeCancelReasonPure } from '@/lib/reliability';

function computeCancelReason(
  booking: Booking,
  slot: Schedule | null,
  now: Date,
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): CancelReason {
  return computeCancelReasonPure(booking, slot, now, config);
}

/**
 * Маппит FSM-переход в NotificationType и awaitит notify() для заинтересованной
 * стороны. Phase 24 Step 24.5: notify() awaitable — запись в notifications.json
 * гарантирована до возврата transitionBooking. Получателя провайдерских уведомлений
 * расширим в Step 24.8 (через slot-context и link-данные).
 */
async function dispatchTransitionNotifications(
  booking: Booking,
  transition: BookingStatusTransition,
): Promise<void> {
  const athleteId = booking.userId;

  switch (transition.to) {
    case 'confirmed':
      await notify(athleteId, 'booking_confirmed', { bookingId: booking.id });
      return;
    case 'rejected_by_provider':
      await notify(athleteId, 'booking_rejected', {
        bookingId: booking.id,
        reason: transition.reason,
      });
      return;
    case 'cancelled_by_athlete':
      // TODO Step 24.8: notify провайдеру через slot-context / link-данные.
      await notify(athleteId, 'booking_cancelled_by_athlete', {
        bookingId: booking.id,
        cancelReason: booking.cancelReason,
      });
      return;
    case 'cancelled_by_provider': {
      // actor='system' — ленивый auto-expire pending (см. runLazyBookingTransitions).
      const type: NotificationType =
        transition.actor === 'system' ? 'booking_auto_expired' : 'booking_cancelled_by_provider';
      await notify(athleteId, type, { bookingId: booking.id });
      return;
    }
    case 'completed':
      await notify(athleteId, 'booking_completed', { bookingId: booking.id });
      return;
    case 'no_show': {
      await notify(athleteId, 'booking_no_show', { bookingId: booking.id });

      // Step 25.7: после no_show пересчитываем карантин атлета и шлём quarantine_start
      // при первом hit. Пересчёт читает свежий bookings-snapshot, чтобы свеже
      // записанный no_show попал в relevant-выборку isAthleteInQuarantine.
      const [athleteUser, bookingsAfter] = await Promise.all([
        getUserById(athleteId),
        getBookings(),
      ]);
      if (athleteUser) {
        const { isAthleteInQuarantine } = await import('@/lib/reliability');
        const { maybeNotifyQuarantineStart } = await import('@/lib/quarantine-notifier');
        const quarantine = isAthleteInQuarantine(bookingsAfter, athleteId, new Date(), {
          quarantineLiftedAt: athleteUser.quarantineLiftedAt ?? null,
        });
        await maybeNotifyQuarantineStart({ user: athleteUser, quarantine });
      }
      return;
    }
    case 'unmarked':
      // Служебный финал — атлету не шлём, попадёт в админ-аналитику.
      return;
    default:
      return;
  }
}

/** Input универсального FSM-перехода. API-роуты Step 24.4 — тонкие обёртки над transitionBooking. */
export interface TransitionBookingInput {
  bookingId: EntityId;
  to: BookingStatus;
  actor: BookingActor;
  actorUserId?: EntityId;
  reason?: string;
  /** Overridable для тестов и ленивых автопереходов (now фиксируется на старте сканирования). */
  now?: Date;
}

/**
 * Ядро FSM: атомарно переводит booking в target-статус с записью в bookings.json
 * и schedule.json (bookedCount по таблице), добавляет запись в statusHistory,
 * фиксирует cancelledBy/cancelReason/completedAt по семантике target'а, уведомляет
 * получателей через notify(). Rollback при ошибке любой записи коллекции.
 */
export async function transitionBooking(input: TransitionBookingInput): Promise<Booking> {
  const now = input.now ?? new Date();
  const [bookings, schedule] = await Promise.all([getBookings(), readCollection('schedule')]);

  const bookingIndex = bookings.findIndex((candidate) => candidate.id === input.bookingId);

  if (bookingIndex === -1) {
    throw new Error('Запись не найдена');
  }

  const booking = bookings[bookingIndex];

  validateTransition(booking.status, input.to, input.actor);

  const transition: BookingStatusTransition = {
    from: booking.status,
    to: input.to,
    actor: input.actor,
    actorUserId: input.actorUserId,
    at: now.toISOString(),
    reason: input.reason,
  };

  const updatedBooking: Booking = {
    ...booking,
    status: input.to,
    statusHistory: [...(booking.statusHistory ?? []), transition],
  };

  if (input.to === 'cancelled_by_athlete') {
    const slot = schedule.find((candidate) => candidate.id === booking.scheduleId) ?? null;
    updatedBooking.cancelledBy = input.actor;
    updatedBooking.cancelReason = computeCancelReason(booking, slot, now);
  } else if (input.to === 'cancelled_by_provider' || input.to === 'rejected_by_provider') {
    updatedBooking.cancelledBy = input.actor;
  } else if (input.to === 'completed') {
    updatedBooking.completedAt = now.toISOString();
  }

  const delta = getBookedCountDelta(booking.status, input.to);
  const updatedSchedule = [...schedule];

  if (delta !== 0) {
    const slotIndex = schedule.findIndex((slot) => slot.id === booking.scheduleId);

    if (slotIndex !== -1) {
      updatedSchedule[slotIndex] = {
        ...schedule[slotIndex],
        bookedCount: Math.max(0, schedule[slotIndex].bookedCount + delta),
      };
    }
  }

  const updatedBookings = [...bookings];
  updatedBookings[bookingIndex] = updatedBooking;

  await writeCollectionsWithRollback([
    { key: 'bookings', next: updatedBookings, previous: bookings },
    { key: 'schedule', next: updatedSchedule, previous: schedule },
  ]);

  await dispatchTransitionNotifications(updatedBooking, transition);

  return updatedBooking;
}

/**
 * Atomic-создание booking (Phase 24): каждая новая запись стартует в pending, ждёт
 * подтверждения провайдером. statusHistory фиксирует первый переход (from=null →
 * to=pending, actor=athlete). cancellationPolicySnapshot клонируется с offering
 * (read-fallback 'free_until_24h' защищает от seed без policy). bookedCount +1
 * с момента pending — слот физически занят ожиданием подтверждения.
 * Duplicate guard блокируется только при наличии ACTIVE booking'а (pending/confirmed);
 * после финала атлет может заново записаться на тот же слот.
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

  const duplicate = bookings.find(
    (booking) =>
      booking.userId === input.userId &&
      booking.scheduleId === input.scheduleId &&
      ACTIVE_BOOKING_STATUSES.has(booking.status),
  );

  if (duplicate) {
    throw new Error('Пользователь уже записан на это занятие');
  }

  if (slot.bookedCount >= slot.capacity) {
    throw new Error('Свободных мест нет');
  }

  const timestamp = createTimestamp();
  const snapshot: CancellationPolicy = offering?.cancellationPolicy ?? 'free_until_24h';

  const initialTransition: BookingStatusTransition = {
    from: null,
    to: 'pending',
    actor: 'athlete',
    actorUserId: input.userId,
    at: timestamp,
  };

  const booking: Booking = {
    id: getNextEntityId(bookings),
    createdAt: timestamp,
    scheduleId: input.scheduleId,
    offeringId: slot.offeringId,
    ownerType: slot.ownerType,
    ownerId: slot.ownerId,
    userId: input.userId,
    // Phase 25 Step 25.1b: legacy `affiliatedClubId` удалён. `clubId` booking'а —
    // для club-слотов = сам club; для trainer-слотов = affiliatedClub (резолвится
    // через offering.trainerClubLinkId → confirmed link) если есть, иначе undefined.
    clubId: club?.id ?? affiliatedClub?.id,
    trainerId: trainer?.id ?? slot.trainerId,
    sportId: offering?.sportId ?? slot.sportId,
    date: slot.date,
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: offering?.price ?? slot.price,
    cancellationPolicySnapshot: snapshot,
    statusHistory: [initialTransition],
  };

  const slotIndex = schedule.findIndex((item) => item.id === input.scheduleId);
  const updatedSchedule = [...schedule];

  updatedSchedule[slotIndex] = {
    ...schedule[slotIndex],
    bookedCount: schedule[slotIndex].bookedCount + 1,
  };

  const updatedBookings = [...bookings, booking];

  await writeCollectionsWithRollback([
    { key: 'bookings', next: updatedBookings, previous: bookings },
    { key: 'schedule', next: updatedSchedule, previous: schedule },
  ]);

  return booking;
}

/**
 * Отмена booking атлетом (Phase 24: soft-cancel через FSM). Тонкая обёртка над
 * transitionBooking(to=cancelled_by_athlete). Ownership-guard — до вызова FSM,
 * чтобы ошибка прав шла конкретным русским сообщением (маппится на 403 в роуте).
 */
export async function cancelBooking(input: CancelBookingInput): Promise<void> {
  const bookings = await getBookings();
  const booking = bookings.find((candidate) => candidate.id === input.bookingId);

  if (!booking) {
    throw new Error('Запись не найдена');
  }

  if (booking.userId !== input.userId) {
    throw new Error('Недостаточно прав для отмены записи');
  }

  await transitionBooking({
    bookingId: input.bookingId,
    to: 'cancelled_by_athlete',
    actor: 'athlete',
    actorUserId: input.userId,
  });
}

/** Input админского hard-delete booking'а (Step 24.4 — DELETE /api/admin/bookings/[id]). */
export interface HardDeleteBookingInput {
  bookingId: EntityId;
  adminUserId: EntityId;
}

/**
 * Phase 24 admin-only: физическое удаление booking'а. Используется только в
 * DELETE /api/admin/bookings/[id] под admin-guard (Step 24.4). В отличие от
 * cancelBooking (soft-cancel), запись полностью исчезает из bookings.json вместе
 * со statusHistory — не остаётся в источнике правды для рейтинга/аналитики.
 * Откатывает bookedCount, только если booking был в ACTIVE-фазе; терминальные
 * статусы не трогает (слот уже прошёл или был освобождён переходом).
 */
export async function hardDeleteBooking(input: HardDeleteBookingInput): Promise<void> {
  const [bookings, schedule] = await Promise.all([getBookings(), readCollection('schedule')]);

  const booking = bookings.find((candidate) => candidate.id === input.bookingId);

  if (!booking) {
    throw new Error('Запись не найдена');
  }

  const updatedBookings = bookings.filter((candidate) => candidate.id !== input.bookingId);
  const updatedSchedule = [...schedule];

  if (ACTIVE_BOOKING_STATUSES.has(booking.status)) {
    const slotIndex = schedule.findIndex((slot) => slot.id === booking.scheduleId);

    if (slotIndex !== -1) {
      updatedSchedule[slotIndex] = {
        ...schedule[slotIndex],
        bookedCount: Math.max(0, schedule[slotIndex].bookedCount - 1),
      };
    }
  }

  await writeCollectionsWithRollback([
    { key: 'bookings', next: updatedBookings, previous: bookings },
    { key: 'schedule', next: updatedSchedule, previous: schedule },
  ]);
}

/** Сводка по ленивым автопереходам — для отчётов вызывающей стороны и тестов. */
export interface LazyBookingTransitionsResult {
  autoCancelledPending: number;
  autoUnmarked: number;
}

/**
 * Phase 24: ленивые автопереходы FSM без cron. Идемпотентная — повторный вызов
 * на тех же данных не триггерит повторных переходов (pending уже ушёл в
 * cancelled_by_provider, confirmed уже в unmarked). Вызывается в 3 точках
 * (Step 24.4):
 *   - GET /api/bookings
 *   - src/app/profile/athlete/page.tsx (до чтения bookings)
 *   - src/app/profile/provider/page.tsx (до чтения bookings)
 */
export async function runLazyBookingTransitions(
  now: Date = new Date(),
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): Promise<LazyBookingTransitionsResult> {
  const [bookings, schedule] = await Promise.all([getBookings(), readCollection('schedule')]);

  const scheduleById = new Map(schedule.map((slot) => [slot.id, slot]));
  const autoCancelMs = config.pending.autoCancelHoursBeforeStart * 60 * 60 * 1000;
  const unmarkMs = config.checkIn.windowHoursAfterEnd * 60 * 60 * 1000;

  const toCancel: Booking[] = [];
  const toUnmark: Booking[] = [];

  for (const booking of bookings) {
    const slot = scheduleById.get(booking.scheduleId);

    if (!slot) {
      continue;
    }

    if (booking.status === 'pending') {
      const startAt = getSlotStartAt(slot);

      if (now.getTime() >= startAt.getTime() - autoCancelMs) {
        toCancel.push(booking);
      }
    } else if (booking.status === 'confirmed') {
      const endAt = getSlotEndAt(slot);

      if (now.getTime() > endAt.getTime() + unmarkMs) {
        toUnmark.push(booking);
      }
    }
  }

  // Последовательное применение: если один переход упадёт (race по файлу), остальные
  // попадут в следующий вызов — идемпотентность сохраняется.
  for (const booking of toCancel) {
    await transitionBooking({
      bookingId: booking.id,
      to: 'cancelled_by_provider',
      actor: 'system',
      reason: 'auto_cancel_pending_expired',
      now,
    });
  }

  for (const booking of toUnmark) {
    await transitionBooking({
      bookingId: booking.id,
      to: 'unmarked',
      actor: 'system',
      now,
    });
  }

  // Step 25.7: lazy quarantine_end — если у атлета была активная quarantine-метка,
  // а окно уже истекло (или admin сделал lift позже последнего no_show), шлём end
  // и очищаем notifiedQuarantineUntil. Проход идемпотентен: helper no-op, пока user
  // не был notified, либо пока карантин ещё активен.
  const users = await getUsers();
  const quarantinedUsers = users.filter((user) => user.notifiedQuarantineUntil);

  if (quarantinedUsers.length > 0) {
    const [bookingsAfter, { isAthleteInQuarantine }, { maybeNotifyQuarantineEnd }] =
      await Promise.all([
        getBookings(),
        import('@/lib/reliability'),
        import('@/lib/quarantine-notifier'),
      ]);

    for (const user of quarantinedUsers) {
      const quarantine = isAthleteInQuarantine(bookingsAfter, user.id, now, {
        quarantineLiftedAt: user.quarantineLiftedAt ?? null,
      });
      await maybeNotifyQuarantineEnd({ user, quarantine });
    }
  }

  return {
    autoCancelledPending: toCancel.length,
    autoUnmarked: toUnmark.length,
  };
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

// --- Логи активности платформы (Phase 20) ---

/** Чтение всех записей логов. */
export async function getLogs(): Promise<LogEntry[]> {
  return readCollection('logs');
}

/** Добавление одной записи лога с автогенерацией id и createdAt. */
export async function appendLog(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry> {
  const logs = await readCollection('logs');

  const logEntry: LogEntry = {
    id: getNextEntityId(logs),
    createdAt: createTimestamp(),
    ...entry,
  };

  logs.push(logEntry);
  await writeCollection('logs', logs);

  return logEntry;
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

  const [trainers, offerings, schedule, existingLinks] = await Promise.all([
    readCollection('trainers'),
    readCollection('offerings'),
    readCollection('schedule'),
    readCollection('trainerClubLinks'),
  ]);

  const trainerId = getNextEntityId(trainers);
  const offeringId = getNextEntityId(offerings);
  let nextScheduleId = getNextEntityId(schedule);

  const trainer: Trainer = {
    ...input.trainer,
    id: trainerId,
    createdAt: now,
  };

  // Phase 25 Step 25.1b: клуб для авто-создания confirmed-link берём из input.clubId
  // (прежние legacy поля `trainer.affiliatedClubId`/`offering.affiliatedClubId` удалены).
  // Id будущего link'а аллоцируется ДО atomic write — чтобы primary offering получил
  // корректный `trainerClubLinkId` и публичные поверхности сразу резолвили club через link.
  const affiliatedClubId = input.clubId;
  const nextLinkId = affiliatedClubId !== undefined ? getNextEntityId(existingLinks) : undefined;

  const offering: Offering = {
    ...input.offering,
    id: offeringId,
    createdAt: now,
    ownerId: trainerId,
    ...(nextLinkId !== undefined ? { trainerClubLinkId: nextLinkId } : {}),
  };
  const schedules: Schedule[] = input.schedules.map((slot) => {
    const id = nextScheduleId++;

    return {
      ...slot,
      id,
      createdAt: now,
      offeringId,
      ownerId: trainerId,
      trainerId,
    };
  });

  // Phase 24 Step 24.10: дополнительные услуги (multi-offering).
  // Аллокация id идёт последовательно от next-значения существующих коллекций,
  // так все новые offerings + schedule попадают в один атомарный write.
  let nextOfferingId = offeringId + 1;
  const additionalOfferingsOut: Array<{ offering: Offering; schedules: Schedule[] }> = [];
  const additionalOfferingEntities: Offering[] = [];
  const additionalScheduleEntities: Schedule[] = [];

  if (input.additionalOfferings) {
    for (const extra of input.additionalOfferings) {
      const extraOfferingId = nextOfferingId++;
      const extraOffering: Offering = {
        ...extra.offering,
        id: extraOfferingId,
        createdAt: now,
        ownerId: trainerId,
      };
      const extraSchedules: Schedule[] = extra.schedules.map((slot) => ({
        ...slot,
        id: nextScheduleId++,
        createdAt: now,
        offeringId: extraOfferingId,
        ownerId: trainerId,
        trainerId,
      }));
      additionalOfferingEntities.push(extraOffering);
      additionalScheduleEntities.push(...extraSchedules);
      additionalOfferingsOut.push({ offering: extraOffering, schedules: extraSchedules });
    }
  }

  const nextTrainers = [...trainers, trainer];
  const nextOfferings = [...offerings, offering, ...additionalOfferingEntities];
  const nextSchedule = [...schedule, ...schedules, ...additionalScheduleEntities];

  // Phase 24 Step 24.9c / Phase 25 Step 25.1b: auto-confirmed link для MVP provider
  // (одна сторона управляет обеими). Пишется атомарно в одном write с trainers/offerings/schedule,
  // чтобы public-поверхности, которые читают offering.trainerClubLinkId → link, видели
  // согласованное состояние сразу.
  const writes: Parameters<typeof writeCollectionsWithRollback>[0] = [
    { key: 'trainers', next: nextTrainers, previous: trainers },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
  ];
  if (affiliatedClubId !== undefined && nextLinkId !== undefined) {
    const autoLink: TrainerClubLink = {
      id: nextLinkId,
      createdAt: now,
      trainerId,
      clubId: affiliatedClubId,
      status: 'confirmed',
      initiatedBy: 'trainer',
      approvedAt: now,
      approvedByUserId: input.trainer.managedByUserId,
    };
    writes.push({
      key: 'trainerClubLinks',
      next: [...existingLinks, autoLink],
      previous: existingLinks,
    });
  }
  await writeCollectionsWithRollback(writes);

  return {
    trainer,
    offering,
    schedules,
    ...(additionalOfferingsOut.length > 0 ? { additionalOfferings: additionalOfferingsOut } : {}),
  };
}

/**
 * Pseudo-atomic обновление клуба: club + primary offering + schedule[].
 * Сохраняет системные поля сущности и существующие slot.id / createdAt / bookedCount.
 */
export async function updateClubPublication(
  input: UpdateClubPublicationInput,
): Promise<ClubPublicationResult> {
  const now = createTimestamp();
  const [clubs, offerings, schedule, bookings] = await Promise.all([
    readCollection('clubs'),
    readCollection('offerings'),
    readCollection('schedule'),
    readCollection('bookings'),
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

  // Auto-restore: если клуб скрыт модератором — восстановить при редактировании
  const wasHidden = currentClub.status === 'hidden';
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
    amenityIds: input.club.amenityIds,
    tagIds: input.club.tagIds,
    vk: input.club.vk,
    telegram: input.club.telegram,
    facebook: input.club.facebook,
    priceFrom: input.club.priceFrom,
    ...(wasHidden
      ? {
          status: 'published' as const,
          hideReason: undefined,
          hiddenByUserId: undefined,
          hiddenAt: undefined,
        }
      : {}),
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

  // Синхронизация даты букингов при переносе слота расписания
  let nextBookings = bookings;
  for (const newSlot of schedules) {
    const oldSlot = currentScheduleById.get(newSlot.id);
    if (oldSlot && oldSlot.date !== newSlot.date) {
      nextBookings = nextBookings.map((b) =>
        b.scheduleId === newSlot.id ? { ...b, date: newSlot.date } : b,
      );
    }
  }

  const collections: Parameters<typeof writeCollectionsWithRollback>[0] = [
    { key: 'clubs', next: nextClubs, previous: clubs },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
  ];

  // Bookings пишем только если были изменения
  if (nextBookings !== bookings) {
    collections.push({ key: 'bookings', next: nextBookings, previous: bookings });
  }

  await writeCollectionsWithRollback(collections);

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
  const [trainers, offerings, schedule, bookings] = await Promise.all([
    readCollection('trainers'),
    readCollection('offerings'),
    readCollection('schedule'),
    readCollection('bookings'),
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

  // Phase 25 Step 25.1a: текущие additional offerings тренера (всё, кроме primary).
  const currentAdditionalOfferings = offerings.filter(
    (offeringItem) =>
      offeringItem.ownerType === 'trainer' &&
      offeringItem.ownerId === input.trainerId &&
      offeringItem.id !== currentOffering.id,
  );
  const currentAdditionalOfferingById = new Map(
    currentAdditionalOfferings.map((offeringItem) => [offeringItem.id, offeringItem]),
  );

  const currentPrimarySchedules = schedule.filter((slot) => slot.offeringId === currentOffering.id);
  const currentPrimaryScheduleById = new Map(
    currentPrimarySchedules.map((slot) => [slot.id, slot]),
  );
  let nextScheduleId = getNextEntityId(schedule);
  let nextOfferingId = getNextEntityId(offerings);

  assertNoDuplicateScheduleIds(input.schedules, 'тренера');

  // Auto-restore: если тренер скрыт модератором — восстановить при редактировании.
  // Phase 25 Step 25.1b: legacy `trainer.affiliatedClubId`/`clubId` удалены; связь
  // с клубом живёт в TrainerClubLink и не меняется через updateTrainerPublication.
  const wasHidden = currentTrainer.status === 'hidden';
  const trainerBase: Trainer = {
    ...currentTrainer,
    name: input.trainer.name,
    bio: input.trainer.bio,
    experienceYears: input.trainer.experienceYears,
    specialtyIds: input.trainer.specialtyIds,
    workFormatIds: input.trainer.workFormatIds,
    priceFrom: input.trainer.priceFrom,
    sportIds: input.trainer.sportIds,
    city: input.trainer.city,
    address: input.trainer.address,
    phone: input.trainer.phone,
    vk: input.trainer.vk,
    telegram: input.trainer.telegram,
    facebook: input.trainer.facebook,
    sportId: input.trainer.sportIds[0],
    ...(wasHidden
      ? {
          status: 'published' as const,
          hideReason: undefined,
          hiddenByUserId: undefined,
          hiddenAt: undefined,
        }
      : {}),
  };
  const trainer = normalizeTrainer(trainerBase);

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
    ownerType: 'trainer',
    ownerId: input.trainerId,
  };

  const primarySchedules: Schedule[] = input.schedules.map((slotInput) => {
    const currentSlot =
      slotInput.id !== undefined ? (currentPrimaryScheduleById.get(slotInput.id) ?? null) : null;

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

    return baseSlot;
  });

  // Phase 25 Step 25.1a: full-replace дополнительных услуг.
  // Вход — список entries (offering + schedules). Diff по id:
  //   - offering.id указан и есть среди текущих → UPDATE (createdAt сохраняется)
  //   - offering.id указан, но не найден → throw
  //   - offering.id отсутствует → CREATE (новый id)
  //   - текущая additional не упомянута во вход → REMOVE (вместе со schedule)
  // Если input.additionalOfferings === undefined — не трогаем существующие (обратная совместимость).
  const processedAdditionalOfferings: Array<{ offering: Offering; schedules: Schedule[] }> = [];
  const keptAdditionalOfferingIds = new Set<EntityId>();
  const keptAdditionalScheduleIds = new Set<EntityId>();

  if (input.additionalOfferings !== undefined) {
    for (const extraInput of input.additionalOfferings) {
      let extraOffering: Offering;
      if (extraInput.offering.id !== undefined) {
        const existing = currentAdditionalOfferingById.get(extraInput.offering.id);
        if (!existing) {
          throw new Error(
            `Дополнительная услуга тренера с id ${extraInput.offering.id} не найдена`,
          );
        }
        extraOffering = {
          ...existing,
          sportId: extraInput.offering.sportId,
          title: extraInput.offering.title,
          description: extraInput.offering.description,
          format: extraInput.offering.format,
          price: extraInput.offering.price,
          durationMinutes: extraInput.offering.durationMinutes,
          capacity: extraInput.offering.capacity,
          address: extraInput.offering.address,
          ...(extraInput.offering.cancellationPolicy
            ? { cancellationPolicy: extraInput.offering.cancellationPolicy }
            : {}),
          ...(extraInput.offering.trainerClubLinkId !== undefined
            ? { trainerClubLinkId: extraInput.offering.trainerClubLinkId }
            : {}),
          ownerType: 'trainer',
          ownerId: input.trainerId,
        };
      } else {
        extraOffering = {
          ...(extraInput.offering as Omit<Offering, 'id' | 'createdAt' | 'ownerId'> & {
            id?: EntityId;
          }),
          id: nextOfferingId++,
          createdAt: now,
          ownerType: 'trainer',
          ownerId: input.trainerId,
        } as Offering;
      }
      keptAdditionalOfferingIds.add(extraOffering.id);

      // Schedules этой additional offering: diff по id (как у primary).
      const existingSchedulesForExtra =
        extraInput.offering.id !== undefined
          ? schedule.filter((slot) => slot.offeringId === extraInput.offering.id)
          : [];
      const existingScheduleByIdForExtra = new Map(
        existingSchedulesForExtra.map((slot) => [slot.id, slot]),
      );

      const extraSchedules: Schedule[] = extraInput.schedules.map((slotInput) => {
        const currentSlot =
          slotInput.id !== undefined
            ? (existingScheduleByIdForExtra.get(slotInput.id) ?? null)
            : null;

        if (slotInput.id !== undefined && !currentSlot) {
          throw new Error(`Слот дополнительной услуги тренера с id ${slotInput.id} не найден`);
        }

        const slotId = currentSlot?.id ?? nextScheduleId++;
        const baseSlot: Schedule = {
          ...currentSlot,
          id: slotId,
          createdAt: currentSlot?.createdAt ?? now,
          offeringId: extraOffering.id,
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
        keptAdditionalScheduleIds.add(slotId);
        return baseSlot;
      });

      processedAdditionalOfferings.push({
        offering: extraOffering,
        schedules: extraSchedules,
      });
    }
  } else {
    // Не переданы — сохраняем существующие как есть.
    for (const existing of currentAdditionalOfferings) {
      keptAdditionalOfferingIds.add(existing.id);
    }
    for (const slot of schedule) {
      if (slot.offeringId !== undefined && currentAdditionalOfferingById.has(slot.offeringId)) {
        keptAdditionalScheduleIds.add(slot.id);
      }
    }
  }

  // Собираем итоговые коллекции. Offerings: сохраняем чужие как есть; primary — обновлённая;
  // additional — либо обновлённые/новые (если input передан), либо существующие без правок.
  const nextOfferings: Offering[] = [];
  const additionalOfferingIdsInResult = new Set(
    processedAdditionalOfferings.map((entry) => entry.offering.id),
  );
  for (const o of offerings) {
    // Primary — уже заменяем на новую версию ниже.
    if (o.id === currentOffering.id) continue;
    // Существующая additional этого тренера — если input передан, мы уже обработали.
    if (currentAdditionalOfferingById.has(o.id)) {
      if (input.additionalOfferings === undefined) {
        nextOfferings.push(o); // сохраняем как есть
      }
      // иначе — обработана в processedAdditionalOfferings (добавим в цикле ниже)
      continue;
    }
    nextOfferings.push(o);
  }
  nextOfferings.push(offering);
  for (const entry of processedAdditionalOfferings) {
    if (!nextOfferings.some((o) => o.id === entry.offering.id)) {
      nextOfferings.push(entry.offering);
    } else {
      // update — заменяем
      const idx = nextOfferings.findIndex((o) => o.id === entry.offering.id);
      nextOfferings[idx] = entry.offering;
    }
  }
  void additionalOfferingIdsInResult;

  // Schedule: не трогаем чужие, обновляем primary, и собираем additional.
  const nextSchedule: Schedule[] = [];
  for (const slot of schedule) {
    // Не-тренерский или чужой тренер — сохраняем.
    const isThisTrainerSlot =
      slot.ownerType === 'trainer' &&
      (slot.ownerId === input.trainerId || slot.trainerId === input.trainerId);
    if (!isThisTrainerSlot) {
      nextSchedule.push(slot);
      continue;
    }
    // Primary-слоты этого тренера — уже заменяются на `primarySchedules` ниже.
    if (slot.offeringId === currentOffering.id) continue;
    // Additional-слоты: если input передан, сохраняем только kept; иначе — все.
    if (input.additionalOfferings === undefined) {
      nextSchedule.push(slot);
      continue;
    }
    if (keptAdditionalScheduleIds.has(slot.id)) {
      // будет заменён ниже обновлённой версией
      continue;
    }
    // Этот additional-slot больше не в input — удаляем (не добавляем).
  }
  nextSchedule.push(...primarySchedules);
  for (const entry of processedAdditionalOfferings) {
    nextSchedule.push(...entry.schedules);
  }

  // Синхронизация даты букингов при переносе слота расписания (primary + additional)
  let nextBookings = bookings;
  for (const newSlot of primarySchedules) {
    const oldSlot = currentPrimaryScheduleById.get(newSlot.id);
    if (oldSlot && oldSlot.date !== newSlot.date) {
      nextBookings = nextBookings.map((b) =>
        b.scheduleId === newSlot.id ? { ...b, date: newSlot.date } : b,
      );
    }
  }
  for (const entry of processedAdditionalOfferings) {
    for (const newSlot of entry.schedules) {
      const oldSlot = schedule.find((slot) => slot.id === newSlot.id);
      if (oldSlot && oldSlot.date !== newSlot.date) {
        nextBookings = nextBookings.map((b) =>
          b.scheduleId === newSlot.id ? { ...b, date: newSlot.date } : b,
        );
      }
    }
  }

  const nextTrainers = trainers.map((trainerItem) =>
    trainerItem.id === input.trainerId ? trainer : trainerItem,
  );

  const collections: Parameters<typeof writeCollectionsWithRollback>[0] = [
    { key: 'trainers', next: nextTrainers, previous: trainers },
    { key: 'offerings', next: nextOfferings, previous: offerings },
    { key: 'schedule', next: nextSchedule, previous: schedule },
  ];

  // Bookings пишем только если были изменения
  if (nextBookings !== bookings) {
    collections.push({ key: 'bookings', next: nextBookings, previous: bookings });
  }

  await writeCollectionsWithRollback(collections);

  return {
    trainer,
    offering,
    schedules: primarySchedules,
    ...(processedAdditionalOfferings.length > 0
      ? { additionalOfferings: processedAdditionalOfferings }
      : {}),
  };
}

/**
 * Скрыть публикацию (клуб или тренер) — модерация.
 * Устанавливает status='hidden', причину скрытия и id модератора.
 */
export async function hideEntity(
  entityType: CatalogOwnerType,
  entityId: EntityId,
  reason: string,
  moderatorId: EntityId,
): Promise<Club | Trainer> {
  if (entityType === 'club') {
    const clubs = await readCollection('clubs');
    const idx = clubs.findIndex((c) => c.id === entityId);
    if (idx === -1) throw new Error('Клуб не найден');
    const updated: Club = {
      ...clubs[idx],
      status: 'hidden',
      hideReason: reason,
      hiddenByUserId: moderatorId,
      hiddenAt: createTimestamp(),
    };
    const next = [...clubs];
    next[idx] = updated;
    await writeCollection('clubs', next);
    return updated;
  }

  const trainers = await readCollection('trainers');
  const idx = trainers.findIndex((t) => t.id === entityId);
  if (idx === -1) throw new Error('Тренер не найден');
  const updated: Trainer = {
    ...trainers[idx],
    status: 'hidden',
    hideReason: reason,
    hiddenByUserId: moderatorId,
    hiddenAt: createTimestamp(),
  };
  const next = [...trainers];
  next[idx] = updated;
  await writeCollection('trainers', next);
  return updated;
}

/**
 * Восстановить публикацию (клуб или тренер) — снять скрытие.
 * Возвращает status='published', очищает поля модерации.
 */
export async function unhideEntity(
  entityType: CatalogOwnerType,
  entityId: EntityId,
): Promise<Club | Trainer> {
  if (entityType === 'club') {
    const clubs = await readCollection('clubs');
    const idx = clubs.findIndex((c) => c.id === entityId);
    if (idx === -1) throw new Error('Клуб не найден');
    const updated: Club = {
      ...clubs[idx],
      status: 'published',
      hideReason: undefined,
      hiddenByUserId: undefined,
      hiddenAt: undefined,
    };
    const next = [...clubs];
    next[idx] = updated;
    await writeCollection('clubs', next);
    return updated;
  }

  const trainers = await readCollection('trainers');
  const idx = trainers.findIndex((t) => t.id === entityId);
  if (idx === -1) throw new Error('Тренер не найден');
  const updated: Trainer = {
    ...trainers[idx],
    status: 'published',
    hideReason: undefined,
    hiddenByUserId: undefined,
    hiddenAt: undefined,
  };
  const next = [...trainers];
  next[idx] = updated;
  await writeCollection('trainers', next);
  return updated;
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
