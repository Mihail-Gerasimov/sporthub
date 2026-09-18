import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  buildReferenceSourceData,
  seedReferenceData,
} from '../storage/seed/dev-seed';

import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

let db: TestDatabase;

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
  await db.truncateAll();
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('Справочный сид для боевой базы', () => {
  it('исходный набор не содержит пользовательских и витринных данных', () => {
    const source = buildReferenceSourceData();

    expect(source.users).toEqual([]);
    expect(source.clubs).toEqual([]);
    expect(source.trainers).toEqual([]);
    expect(source.reviews).toEqual([]);
    expect(source.schedule).toEqual([]);
    expect(source.bookings).toEqual([]);
  });

  it('наполняет только справочники и безопасен при повторном запуске', async () => {
    await seedReferenceData({ client: db.prisma });
    await seedReferenceData({ client: db.prisma });

    expect(await db.prisma.city.count()).toBeGreaterThanOrEqual(6);
    expect(await db.prisma.sport.count()).toBeGreaterThanOrEqual(9);
    expect(await db.prisma.tag.count()).toBeGreaterThanOrEqual(15);
    expect(await db.prisma.amenity.count()).toBeGreaterThanOrEqual(15);
    expect(await db.prisma.specialty.count()).toBeGreaterThanOrEqual(15);
    expect(await db.prisma.workFormat.count()).toBeGreaterThanOrEqual(6);

    expect(await db.prisma.user.count()).toBe(0);
    expect(await db.prisma.club.count()).toBe(0);
    expect(await db.prisma.trainer.count()).toBe(0);
    expect(await db.prisma.review.count()).toBe(0);
  });
});
