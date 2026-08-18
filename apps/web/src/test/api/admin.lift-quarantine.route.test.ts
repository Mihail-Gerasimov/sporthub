// Phase 24 Step 24.15: тесты POST /api/admin/users/[id]/lift-quarantine —
// admin форсит снятие карантина через установку User.quarantineLiftedAt = now.
// После этого isAthleteInQuarantine видит lift позже последнего no_show → снятие.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as liftQuarantineRoute } from '@/app/api/admin/users/[id]/lift-quarantine/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { User, LogEntry } from '@sporthub/types';

const createPostRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/admin/users/${id}/lift-quarantine`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/admin/users/[id]/lift-quarantine', () => {
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

  it('admin (userId=3) снимает карантин: пишет quarantineLiftedAt, логирует', async () => {
    const { request, params } = createPostRequest('1', { adminUserId: 3 });
    const response = await liftQuarantineRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const usersRaw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
    const users = JSON.parse(usersRaw) as User[];
    const target = users.find((u) => u.id === 1);
    expect(target?.quarantineLiftedAt).toBeDefined();
    expect(new Date(target!.quarantineLiftedAt!).getTime()).toBeGreaterThan(0);

    // Лог записан с action=quarantine_admin_lift.
    const logsRaw = await readFile(path.join(dataDirectory, 'logs.json'), 'utf8');
    const logs = JSON.parse(logsRaw) as LogEntry[];
    const logEntry = logs.find((l) => l.action === 'quarantine_admin_lift' && l.entityId === 1);
    expect(logEntry).toBeDefined();
    expect(logEntry?.actorId).toBe(3);
    expect(logEntry?.actorRole).toBe('admin');
  });

  it('возвращает 403 для не-admin пользователя (athlete id=1)', async () => {
    const { request, params } = createPostRequest('1', { adminUserId: 1 });
    const response = await liftQuarantineRoute(request, { params });

    expect(response.status).toBe(403);
  });

  it('возвращает 404 для несуществующего user', async () => {
    const { request, params } = createPostRequest('99999', { adminUserId: 3 });
    const response = await liftQuarantineRoute(request, { params });

    expect(response.status).toBe(404);
  });

  it('возвращает 400 при невалидном payload', async () => {
    const { request, params } = createPostRequest('1', {});
    const response = await liftQuarantineRoute(request, { params });

    expect(response.status).toBe(400);
  });

  it('повторный lift обновляет quarantineLiftedAt (идемпотентно по эффекту)', async () => {
    const usersPath = path.join(dataDirectory, 'users.json');
    const usersRaw = await readFile(usersPath, 'utf8');
    const users = JSON.parse(usersRaw) as User[];
    const withLift = users.map((u) =>
      u.id === 1 ? { ...u, quarantineLiftedAt: '2026-01-01T00:00:00.000Z' } : u,
    );
    await writeFile(usersPath, `${JSON.stringify(withLift, null, 2)}\n`, 'utf8');

    const { request, params } = createPostRequest('1', { adminUserId: 3 });
    const response = await liftQuarantineRoute(request, { params });

    expect(response.status).toBe(200);

    const afterRaw = await readFile(usersPath, 'utf8');
    const after = JSON.parse(afterRaw) as User[];
    const target = after.find((u) => u.id === 1)!;
    expect(new Date(target.quarantineLiftedAt!).getTime()).toBeGreaterThan(
      new Date('2026-01-01T00:00:00.000Z').getTime(),
    );
  });
});
