// Step 25.7: тесты helper'а quarantine-notifier. Дедуп quarantine_start через
// User.notifiedQuarantineUntil, автоматический quarantine_end при выходе из карантина.
// Используем isolated data directory как в notify.test.ts, чтобы createNotification
// писал реальные записи в notifications.json для последующей верификации.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getNotifications } from '@/lib/db';
import { maybeNotifyQuarantineEnd, maybeNotifyQuarantineStart } from '@/lib/quarantine-notifier';
import type { QuarantineResult } from '@sporthub/domain';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { User } from '@sporthub/types';

async function readUser(dataDirectory: string, userId: number): Promise<User> {
  const raw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
  const users = JSON.parse(raw) as User[];
  const target = users.find((u) => u.id === userId);

  if (!target) {
    throw new Error(`User ${userId} not found in fixtures`);
  }

  return target;
}

async function patchUser(
  dataDirectory: string,
  userId: number,
  patch: Partial<User>,
): Promise<void> {
  const raw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
  const users = JSON.parse(raw) as User[];
  const next = users.map((u) => (u.id === userId ? { ...u, ...patch } : u));

  await writeFile(
    path.join(dataDirectory, 'users.json'),
    `${JSON.stringify(next, null, 2)}\n`,
    'utf8',
  );
}

const untilIso = '2026-04-29T12:00:00.000Z';

describe('quarantine-notifier (Step 25.7)', () => {
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

  it('start первый hit: создаёт quarantine_start и пишет notifiedQuarantineUntil', async () => {
    const user = await readUser(dataDirectory, 1);
    const quarantine: QuarantineResult = {
      inQuarantine: true,
      until: untilIso,
      reason: '3 неявки подряд',
    };

    await maybeNotifyQuarantineStart({ user, quarantine });

    const notifications = await getNotifications({ userId: 1 });
    expect(notifications[0].type).toBe('quarantine_start');
    expect(notifications[0].payload).toMatchObject({ until: untilIso });

    const updated = await readUser(dataDirectory, 1);
    expect(updated.notifiedQuarantineUntil).toBe(untilIso);
  });

  it('start повторный hit с тем же until → дедуп, уведомление не создаётся', async () => {
    await patchUser(dataDirectory, 1, { notifiedQuarantineUntil: untilIso });
    const user = await readUser(dataDirectory, 1);
    const quarantine: QuarantineResult = {
      inQuarantine: true,
      until: untilIso,
      reason: '3 неявки подряд',
    };

    await maybeNotifyQuarantineStart({ user, quarantine });

    const notifications = await getNotifications({ userId: 1 });
    const starts = notifications.filter((n) => n.type === 'quarantine_start');
    expect(starts).toHaveLength(0);
  });

  it('start при продлении окна (новый until) → шлёт новый quarantine_start и обновляет поле', async () => {
    await patchUser(dataDirectory, 1, { notifiedQuarantineUntil: untilIso });
    const user = await readUser(dataDirectory, 1);
    const newUntil = '2026-05-05T12:00:00.000Z';
    const quarantine: QuarantineResult = {
      inQuarantine: true,
      until: newUntil,
      reason: '3 неявки подряд',
    };

    await maybeNotifyQuarantineStart({ user, quarantine });

    const notifications = await getNotifications({ userId: 1 });
    const starts = notifications.filter((n) => n.type === 'quarantine_start');
    expect(starts).toHaveLength(1);
    expect(starts[0].payload).toMatchObject({ until: newUntil });

    const updated = await readUser(dataDirectory, 1);
    expect(updated.notifiedQuarantineUntil).toBe(newUntil);
  });

  it('end: был notified, карантин снят → создаёт quarantine_end и очищает notifiedQuarantineUntil', async () => {
    await patchUser(dataDirectory, 1, { notifiedQuarantineUntil: untilIso });
    const user = await readUser(dataDirectory, 1);
    const quarantine: QuarantineResult = { inQuarantine: false };

    await maybeNotifyQuarantineEnd({ user, quarantine });

    const notifications = await getNotifications({ userId: 1 });
    const ends = notifications.filter((n) => n.type === 'quarantine_end');
    expect(ends).toHaveLength(1);

    const updated = await readUser(dataDirectory, 1);
    expect(updated.notifiedQuarantineUntil).toBeUndefined();
  });

  it('end no-op: notifiedQuarantineUntil=undefined — ничего не делает', async () => {
    const user = await readUser(dataDirectory, 1);
    const quarantine: QuarantineResult = { inQuarantine: false };

    await maybeNotifyQuarantineEnd({ user, quarantine });

    const notifications = await getNotifications({ userId: 1 });
    const ends = notifications.filter((n) => n.type === 'quarantine_end');
    expect(ends).toHaveLength(0);
  });
});
