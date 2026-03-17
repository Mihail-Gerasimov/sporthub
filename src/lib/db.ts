import 'server-only';

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type { Booking, Club, EntityId, Review, Schedule, Sport, Trainer } from '@/types';

// STUB: заменить на Prisma при переходе на PostgreSQL.

type DataCollectionMap = {
  bookings: Booking[];
  clubs: Club[];
  reviews: Review[];
  schedule: Schedule[];
  sports: Sport[];
  trainers: Trainer[];
};

export type CreateBookingInput = Omit<Booking, 'id' | 'createdAt'>;
export type CreateReviewInput = Omit<Review, 'id' | 'createdAt'>;

const DATA_DIRECTORY = path.join(process.cwd(), 'src', 'data');

const DATA_FILES: { [Key in keyof DataCollectionMap]: string } = {
  bookings: 'bookings.json',
  clubs: 'clubs.json',
  reviews: 'reviews.json',
  schedule: 'schedule.json',
  sports: 'sports.json',
  trainers: 'trainers.json',
};

async function readCollection<Key extends keyof DataCollectionMap>(
  key: Key,
): Promise<DataCollectionMap[Key]> {
  const filePath = path.join(DATA_DIRECTORY, DATA_FILES[key]);
  const raw = await readFile(filePath, 'utf8');

  return JSON.parse(raw) as DataCollectionMap[Key];
}

async function writeCollection<Key extends keyof DataCollectionMap>(
  key: Key,
  data: DataCollectionMap[Key],
): Promise<void> {
  const filePath = path.join(DATA_DIRECTORY, DATA_FILES[key]);
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

export async function getSports(): Promise<Sport[]> {
  return readCollection('sports');
}

export async function getReviews(): Promise<Review[]> {
  return readCollection('reviews');
}

export async function getBookings(): Promise<Booking[]> {
  return readCollection('bookings');
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
