// Phase 24 Step 24.15: тесты POST /api/admin/users/[id]/recompute-reliability —
// no-op на MVP (кэша пока нет), только логирует reliability_recompute. Нужен
// как точка приложения admin-рычага для будущего кэш-слоя.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as recomputeRoute } from '@/app/api/admin/users/[id]/recompute-reliability/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { LogEntry } from '@sporthub/types';

const createPostRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/admin/users/${id}/recompute-reliability`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/admin/users/[id]/recompute-reliability', () => {
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

  it('admin (userId=3) успешно вызывает recompute, пишется лог', async () => {
    const { request, params } = createPostRequest('1', { adminUserId: 3 });
    const response = await recomputeRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const logsRaw = await readFile(path.join(dataDirectory, 'logs.json'), 'utf8');
    const logs = JSON.parse(logsRaw) as LogEntry[];
    const logEntry = logs.find((l) => l.action === 'reliability_recompute' && l.entityId === 1);
    expect(logEntry).toBeDefined();
    expect(logEntry?.actorRole).toBe('admin');
  });

  it('возвращает 403 для не-admin пользователя', async () => {
    const { request, params } = createPostRequest('1', { adminUserId: 1 });
    const response = await recomputeRoute(request, { params });

    expect(response.status).toBe(403);
  });

  it('возвращает 404 для несуществующего user', async () => {
    const { request, params } = createPostRequest('99999', { adminUserId: 3 });
    const response = await recomputeRoute(request, { params });

    expect(response.status).toBe(404);
  });
});
