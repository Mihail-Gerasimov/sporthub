// Phase 29 Step 29.7: тесты POST /api/admin/users/[id]/password —
// admin сбрасывает пароль любому пользователю; logAction записывает
// admin_password_change. 403 для не-admin, 404 для несуществующего юзера,
// 400 на короткий пароль.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as adminPasswordRoute } from '@/app/api/admin/users/[id]/password/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { LogEntry, User } from '@/types';

const createPostRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/admin/users/${id}/password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/admin/users/[id]/password — Phase 29 Step 29.7', () => {
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

  it('admin (userId=3) меняет пароль атлету (userId=1) и пишет log', async () => {
    const { request, params } = createPostRequest('1', {
      adminUserId: 3,
      newPassword: 'fresh-password-99',
    });
    const response = await adminPasswordRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const usersRaw = await readFile(path.join(dataDirectory, 'users.json'), 'utf8');
    const users = JSON.parse(usersRaw) as User[];
    const target = users.find((u) => u.id === 1);
    expect(target?.password).toBe('fresh-password-99');

    const logsRaw = await readFile(path.join(dataDirectory, 'logs.json'), 'utf8');
    const logs = JSON.parse(logsRaw) as LogEntry[];
    const last = logs.find(
      (entry) =>
        entry.action === 'admin_password_change' && entry.entityId === 1 && entry.actorId === 3,
    );
    expect(last).toBeDefined();
    expect(last?.entityType).toBe('user');
    expect(last?.actorRole).toBe('admin');
  });

  it('403 для не-admin (athlete пытается сменить пароль)', async () => {
    const { request, params } = createPostRequest('2', {
      adminUserId: 1,
      newPassword: 'unauthorized-attempt',
    });
    const response = await adminPasswordRoute(request, { params });
    expect(response.status).toBe(403);
  });

  it('404 для несуществующего пользователя', async () => {
    const { request, params } = createPostRequest('99999', {
      adminUserId: 3,
      newPassword: 'new-pass-123',
    });
    const response = await adminPasswordRoute(request, { params });
    expect(response.status).toBe(404);
  });

  it('400 при коротком password (<6)', async () => {
    const { request, params } = createPostRequest('1', {
      adminUserId: 3,
      newPassword: '12345',
    });
    const response = await adminPasswordRoute(request, { params });
    expect(response.status).toBe(400);
  });

  it('400 без adminUserId', async () => {
    const { request, params } = createPostRequest('1', { newPassword: 'fresh-pass-99' });
    const response = await adminPasswordRoute(request, { params });
    expect(response.status).toBe(400);
  });
});
