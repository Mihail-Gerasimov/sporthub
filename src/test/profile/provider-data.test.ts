// Тесты данных и типов для провайдер-кабинета (Step 12.1, обновлено Phase 14)
import { afterEach, beforeEach, describe, expect, expectTypeOf, it } from 'vitest';

import type { Club, EntityId, Trainer } from '@/types';
import { getBookings, getClubs, getTrainers, getUsers } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Provider data layer (Step 12.1)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('Club и Trainer имеют опциональное поле managedByUserId', () => {
    expectTypeOf<Club>().toMatchTypeOf<{ managedByUserId?: EntityId }>();
    expectTypeOf<Trainer>().toMatchTypeOf<{ managedByUserId?: EntityId }>();
  });

  it('в users.json есть provider-пользователь с id: 2', async () => {
    const users = await getUsers();
    const provider = users.find((u) => u.id === 2);

    expect(provider).toBeDefined();
    expect(provider!.name).toBeTruthy();
    expect(provider!.email).toBeTruthy();
  });

  it('клубы 1 и 2 привязаны к провайдеру (managedByUserId: 2)', async () => {
    const clubs = await getClubs();
    const managed = clubs.filter((c) => c.managedByUserId === 2);
    const managedIds = managed.map((c) => c.id).sort();

    expect(managedIds).toEqual([1, 2]);
  });

  it('тренеры 1, 3, 5 привязаны к провайдеру (managedByUserId: 2)', async () => {
    const trainers = await getTrainers();
    const managed = trainers.filter((t) => t.managedByUserId === 2);
    const managedIds = managed.map((t) => t.id).sort();

    expect(managedIds).toEqual([1, 3, 5]);
  });

  it('в bookings.json есть минимум 3 записи для fake-демо', async () => {
    const bookings = await getBookings();

    expect(bookings.length).toBeGreaterThanOrEqual(3);
  });

  it('fake-букинги имеют разные статусы', async () => {
    const bookings = await getBookings();
    const statuses = new Set(bookings.map((b) => b.status));

    expect(statuses.size).toBeGreaterThanOrEqual(2);
  });
});
