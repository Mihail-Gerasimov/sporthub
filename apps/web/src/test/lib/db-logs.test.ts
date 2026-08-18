/**
 * Тесты модели логирования: appendLog, getLogs и хелпер logAction.
 * Phase 20 — Step 20.1.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { __setWriteCollectionTestHookForTests, appendLog, getLogs } from '@/lib/db';
import { logAction } from '@/lib/logAction';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db logs — appendLog / getLogs', () => {
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

  it('appendLog записывает лог с автогенерированными id и createdAt', async () => {
    const entry = await appendLog({
      action: 'publish_create',
      actorId: 2,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: 10,
      meta: { name: 'Test Club', city: 'Самара' },
    });

    expect(entry.id).toBe(1);
    expect(entry.createdAt).toBeDefined();
    expect(entry.action).toBe('publish_create');
    expect(entry.actorId).toBe(2);
    expect(entry.actorRole).toBe('club_owner');
    expect(entry.entityType).toBe('club');
    expect(entry.entityId).toBe(10);
    expect(entry.meta).toEqual({ name: 'Test Club', city: 'Самара' });
  });

  it('getLogs возвращает записанные логи', async () => {
    await appendLog({
      action: 'publish_create',
      actorId: 2,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: 10,
    });
    await appendLog({
      action: 'booking_create',
      actorId: 1,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: 1,
    });

    const logs = await getLogs();

    expect(logs).toHaveLength(2);
    expect(logs[0].action).toBe('publish_create');
    expect(logs[1].action).toBe('booking_create');
  });

  it('getLogs возвращает пустой массив при пустой коллекции', async () => {
    const logs = await getLogs();

    expect(logs).toEqual([]);
  });

  it('appendLog инкрементирует id при нескольких записях', async () => {
    const first = await appendLog({
      action: 'publish_create',
      actorId: 2,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: 10,
    });
    const second = await appendLog({
      action: 'booking_create',
      actorId: 1,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: 1,
    });

    expect(first.id).toBe(1);
    expect(second.id).toBe(2);
  });
});

describe('logAction — fire-and-forget хелпер', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    __setWriteCollectionTestHookForTests(null);
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('logAction записывает лог в коллекцию', async () => {
    await logAction({
      action: 'booking_cancel',
      actorId: 1,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: 5,
    });

    const logs = await getLogs();

    expect(logs).toHaveLength(1);
    expect(logs[0].action).toBe('booking_cancel');
    expect(logs[0].entityId).toBe(5);
  });

  it('logAction не бросает исключение при ошибке записи', async () => {
    __setWriteCollectionTestHookForTests(() => {
      throw new Error('Simulated write failure');
    });

    // Не должен бросать — fire-and-forget
    await expect(
      logAction({
        action: 'publish_create',
        actorId: 2,
        actorRole: 'club_owner',
        entityType: 'club',
        entityId: 10,
      }),
    ).resolves.toBeUndefined();
  });
});

describe('regression — существующие коллекции db.ts не сломаны', () => {
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

  it('существующие коллекции clubs/trainers/bookings доступны', async () => {
    const { getClubs, getTrainers, getBookings } = await import('@/lib/db');

    const clubs = await getClubs();
    const trainers = await getTrainers();
    const bookings = await getBookings();

    expect(clubs.length).toBeGreaterThan(0);
    expect(trainers.length).toBeGreaterThan(0);
    expect(bookings.length).toBeGreaterThan(0);
  });
});
