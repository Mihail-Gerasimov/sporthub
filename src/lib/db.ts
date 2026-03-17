import 'server-only';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Booking, Club, EntityId, Review, Schedule, Sport, Trainer, User } from '@/types';

// STUB: заменить на Prisma при переходе на PostgreSQL.

type DataCollectionMap = {
  bookings: Booking[];
  clubs: Club[];
  reviews: Review[];
  schedule: Schedule[];
  sports: Sport[];
  trainers: Trainer[];
  users: User[];
};

export type CreateBookingInput = Omit<Booking, 'id' | 'createdAt'>;
export type CreateReviewInput = Omit<Review, 'id' | 'createdAt'>;

const DATA_FILES: { [Key in keyof DataCollectionMap]: string } = {
  bookings: 'bookings.json',
  clubs: 'clubs.json',
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

export async function getClubs(): Promise<Club[]> {
  return readCollection('clubs');
}

export async function getClubById(id: EntityId): Promise<Club | null> {
  const clubs = await getClubs();
  return clubs.find((club) => club.id === id) ?? null;
}

export async function getTrainers(): Promise<Trainer[]> {
  return readCollection('trainers');
}

export async function getTrainerById(id: EntityId): Promise<Trainer | null> {
  const trainers = await getTrainers();
  return trainers.find((trainer) => trainer.id === id) ?? null;
}

export async function getSchedule(): Promise<Schedule[]> {
  return readCollection('schedule');
}

export async function getScheduleById(id: EntityId): Promise<Schedule | null> {
  const schedule = await getSchedule();
  return schedule.find((slot) => slot.id === id) ?? null;
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
  const schedule = await getSchedule();
  const slot = schedule.find((item) => item.id === scheduleId);

  if (!slot || slot.bookedCount >= slot.capacity) {
    return null;
  }

  slot.bookedCount += 1;
  await writeCollection('schedule', schedule);

  return slot;
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
