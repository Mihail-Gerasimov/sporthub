// Файловая реализация серверного клиента — только для тестов.
//
// Страницы ходят за данными на бэкенд по HTTP. Тестам страниц бэкенд поднимать
// незачем: они проверяют разметку и отбор данных, а не транспорт. Поэтому на
// время прогона `@/lib/server-api` подменяется этим модулем: он отдаёт те же
// данные, читая их прямо из тестовой директории.
//
// Сам транспорт проверяется в другом месте: контроллер-тестами бэкенда и
// снимком контрактов.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Amenity,
  Booking,
  City,
  Club,
  EntityId,
  Notification,
  Offering,
  ProviderClientNote,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  TrainerClubLink,
  User,
  WorkFormat,
} from '@sporthub/types';

import { getProjectDataDirectory } from '@/lib/projectPaths';

function dataDirectory(): string {
  const override = process.env.SPORT_HUB_DATA_DIRECTORY;

  return override && override.trim() !== '' ? override : getProjectDataDirectory();
}

async function read<T>(fileName: string): Promise<T[]> {
  try {
    const raw = await readFile(path.join(dataDirectory(), fileName), 'utf8');

    return JSON.parse(raw) as T[];
  } catch {
    return [];
  }
}

/** Приведение адреса-ссылки к сравнимому виду — как на бэкенде. */
function normalizeSlug(value: string): string {
  let result = value.trim();

  try {
    result = decodeURIComponent(result);
  } catch {
    // Значение уже раскодировано — оставляем как есть.
  }

  return result.normalize('NFC').toLocaleLowerCase('ru-RU');
}

/** Тренер мог храниться со старым полем одного вида спорта. */
function normalizeTrainer(trainer: Trainer): Trainer {
  const sportIds =
    Array.isArray(trainer.sportIds) && trainer.sportIds.length > 0
      ? trainer.sportIds
      : trainer.sportId !== undefined
        ? [trainer.sportId]
        : [];

  return { ...trainer, sportIds, sportId: trainer.sportId ?? sportIds[0] };
}

/** Слот мог храниться без явного владельца — выводим его из услуги. */
function normalizeSchedule(slot: Schedule, offeringsById: Map<EntityId, Offering>): Schedule {
  const offering =
    slot.offeringId !== undefined ? (offeringsById.get(slot.offeringId) ?? null) : null;
  const ownerType = slot.ownerType ?? offering?.ownerType ?? 'club';
  const ownerId =
    slot.ownerId ?? offering?.ownerId ?? (ownerType === 'club' ? slot.clubId : slot.trainerId);

  return {
    ...slot,
    ownerType,
    ownerId,
    clubId: slot.clubId ?? (ownerType === 'club' && ownerId !== undefined ? ownerId : undefined),
    trainerId:
      slot.trainerId ?? (ownerType === 'trainer' && ownerId !== undefined ? ownerId : undefined),
    offeringId: slot.offeringId ?? offering?.id,
  };
}

export const getSports = (): Promise<Sport[]> => read<Sport>('sports.json');
export const getCities = (): Promise<City[]> => read<City>('cities.json');
export const getTags = (): Promise<Tag[]> => read<Tag>('tags.json');
export const getAmenities = (): Promise<Amenity[]> => read<Amenity>('amenities.json');
export const getSpecialties = (): Promise<Specialty[]> => read<Specialty>('specialties.json');
export const getWorkFormats = (): Promise<WorkFormat[]> => read<WorkFormat>('work-formats.json');

export const getClubs = (): Promise<Club[]> => read<Club>('clubs.json');

export async function getPublishedClubs(): Promise<Club[]> {
  const clubs = await getClubs();

  return clubs.filter((club) => club.status !== 'hidden');
}

export async function getTrainers(): Promise<Trainer[]> {
  const trainers = await read<Trainer>('trainers.json');

  return trainers.map(normalizeTrainer);
}

export async function getPublishedTrainers(): Promise<Trainer[]> {
  const trainers = await getTrainers();

  return trainers.filter((trainer) => trainer.status !== 'hidden');
}

export async function getClubById(id: EntityId): Promise<Club | null> {
  const clubs = await getClubs();

  return clubs.find((club) => club.id === id) ?? null;
}

export async function getTrainerById(id: EntityId): Promise<Trainer | null> {
  const trainers = await getTrainers();

  return trainers.find((trainer) => trainer.id === id) ?? null;
}

export async function getClubBySlug(slug: string): Promise<Club | null> {
  const target = normalizeSlug(slug);
  const clubs = await getClubs();

  return clubs.find((club) => normalizeSlug(club.slug) === target) ?? null;
}

export async function getTrainerBySlug(slug: string): Promise<Trainer | null> {
  const target = normalizeSlug(slug);
  const trainers = await getTrainers();

  return trainers.find((trainer) => normalizeSlug(trainer.slug) === target) ?? null;
}

export const getOfferings = (): Promise<Offering[]> => read<Offering>('offerings.json');

export type GetScheduleOptions = { ownerType?: 'club' | 'trainer' | 'all' };

export async function getSchedule(options: GetScheduleOptions = {}): Promise<Schedule[]> {
  const [offerings, slots] = await Promise.all([getOfferings(), read<Schedule>('schedule.json')]);
  const offeringsById = new Map(offerings.map((offering) => [offering.id, offering]));
  const normalized = slots.map((slot) => normalizeSchedule(slot, offeringsById));
  const ownerType = options.ownerType ?? 'club';

  return ownerType === 'all'
    ? normalized
    : normalized.filter((slot) => slot.ownerType === ownerType);
}

export async function getScheduleSlotContext(scheduleId: EntityId): Promise<{
  affiliatedClub: Club | null;
  club: Club | null;
  offering: Offering | null;
  schedule: Schedule;
  trainer: Trainer | null;
} | null> {
  const slots = await getSchedule({ ownerType: 'all' });
  const slot = slots.find((candidate) => candidate.id === scheduleId);

  if (!slot) return null;

  const [offerings, clubs, trainers, links] = await Promise.all([
    getOfferings(),
    getClubs(),
    getTrainers(),
    getTrainerClubLinks({ status: 'confirmed' }),
  ]);

  const offering = offerings.find((candidate) => candidate.id === slot.offeringId) ?? null;
  const club = clubs.find((candidate) => candidate.id === slot.clubId) ?? null;
  const trainer = trainers.find((candidate) => candidate.id === slot.trainerId) ?? null;

  // Площадка тренера — клуб из подтверждённой связи, привязанной к услуге.
  const link =
    offering?.trainerClubLinkId !== undefined
      ? links.find((candidate) => candidate.id === offering.trainerClubLinkId)
      : trainer
        ? links.find((candidate) => candidate.trainerId === trainer.id)
        : undefined;
  const affiliatedClub =
    link === undefined ? null : (clubs.find((candidate) => candidate.id === link.clubId) ?? null);

  return { affiliatedClub, club, offering, schedule: slot, trainer };
}

export const getBookings = (): Promise<Booking[]> => read<Booking>('bookings.json');

export async function getBookingsByUser(userId: EntityId): Promise<Booking[]> {
  const bookings = await getBookings();

  return bookings.filter((booking) => booking.userId === userId);
}

export const getReviews = (): Promise<Review[]> => read<Review>('reviews.json');
export const getUsers = (): Promise<User[]> => read<User>('users.json');

export async function getUserById(id: EntityId): Promise<User | null> {
  const users = await getUsers();

  return users.find((user) => user.id === id) ?? null;
}

export type GetTrainerClubLinksOptions = {
  trainerId?: EntityId;
  clubId?: EntityId;
  status?: TrainerClubLink['status'];
};

export async function getTrainerClubLinks(
  options: GetTrainerClubLinksOptions = {},
): Promise<TrainerClubLink[]> {
  const links = await read<TrainerClubLink>('trainer-club-links.json');

  return links
    .filter((link) => options.trainerId === undefined || link.trainerId === options.trainerId)
    .filter((link) => options.clubId === undefined || link.clubId === options.clubId)
    .filter((link) => options.status === undefined || link.status === options.status)
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export type GetNotificationsOptions = {
  userId?: EntityId;
  unreadOnly?: boolean;
  offset?: number;
  limit?: number;
  applyPreferences?: boolean;
};

export async function getNotifications(
  options: GetNotificationsOptions = {},
): Promise<Notification[]> {
  const notifications = await read<Notification>('notifications.json');
  let filtered = notifications;

  if (options.userId !== undefined) {
    filtered = filtered.filter((item) => item.userId === options.userId);
  }

  if (options.applyPreferences === true && options.userId !== undefined) {
    const user = await getUserById(options.userId);

    if (user) {
      const { isNotificationTypeEnabled } = await import('@sporthub/domain');
      filtered = filtered.filter((item) => isNotificationTypeEnabled(user, item.type));
    }
  }

  if (options.unreadOnly) {
    filtered = filtered.filter((item) => item.readAt === undefined);
  }

  const sorted = filtered
    .slice()
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
  const offset = options.offset ?? 0;

  return options.limit === undefined
    ? sorted.slice(offset)
    : sorted.slice(offset, offset + options.limit);
}

export const getAllProviderClientNotes = (): Promise<ProviderClientNote[]> =>
  read<ProviderClientNote>('provider-client-notes.json');
