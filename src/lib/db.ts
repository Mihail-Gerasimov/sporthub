import 'server-only';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

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

export type CreateBookingInput = Omit<Booking, 'id' | 'createdAt'>;
export type CreateReviewInput = Omit<Review, 'id' | 'createdAt'>;
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

  return path.join(process.cwd(), 'src', 'data');
}

async function readCollection<Key extends keyof DataCollectionMap>(
  key: Key,
): Promise<DataCollectionMap[Key]> {
  const filePath = path.join(getDataDirectory(), DATA_FILES[key]);
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw) as DataCollectionMap[Key];
}

async function writeCollection<Key extends keyof DataCollectionMap>(
  key: Key,
  data: DataCollectionMap[Key],
): Promise<void> {
  const filePath = path.join(getDataDirectory(), DATA_FILES[key]);
  await writeFile(filePath, `${JSON.stringify(data, null, 2)}\n`, 'utf8');
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
    scheduleItem.offeringId !== undefined ? offeringsById.get(scheduleItem.offeringId) ?? null : null;
  const ownerType = scheduleItem.ownerType ?? offering?.ownerType ?? 'club';
  const ownerId =
    scheduleItem.ownerId ??
    offering?.ownerId ??
    (ownerType === 'club' ? scheduleItem.clubId : scheduleItem.trainerId);
  const affiliatedClubId =
    scheduleItem.affiliatedClubId ?? offering?.affiliatedClubId ?? scheduleItem.clubId ?? undefined;
  const clubId =
    scheduleItem.clubId ??
    (ownerType === 'club' && ownerId !== undefined ? ownerId : undefined);
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

export async function getTrainers(): Promise<Trainer[]> {
  const trainers = await readCollection('trainers');
  return trainers.map(normalizeTrainer);
}

export async function getTrainerById(id: EntityId): Promise<Trainer | null> {
  const trainers = await getTrainers();
  return trainers.find((trainer) => trainer.id === id) ?? null;
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
  return offerings.filter((offering) => offering.ownerType === 'club' && offering.ownerId === clubId);
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
      ? offerings.find((item) => item.id === scheduleItem.offeringId) ?? null
      : null;
  const club =
    scheduleItem.clubId !== undefined
      ? clubById.get(scheduleItem.clubId) ?? null
      : offering?.ownerType === 'club'
        ? clubById.get(offering.ownerId) ?? null
        : null;
  const trainer =
    scheduleItem.trainerId !== undefined
      ? trainerById.get(scheduleItem.trainerId) ?? null
      : offering?.ownerType === 'trainer'
        ? trainerById.get(offering.ownerId) ?? null
        : null;
  const affiliatedClub =
    scheduleItem.affiliatedClubId !== undefined
      ? clubById.get(scheduleItem.affiliatedClubId) ?? null
      : offering?.affiliatedClubId !== undefined
        ? clubById.get(offering.affiliatedClubId) ?? null
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
