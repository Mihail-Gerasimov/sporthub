// Phase 24 Step 24.15: тесты POST /api/admin/trainer-club-links/[id]/force-revoke —
// admin-форсированный разрыв связи с revokedBy='admin'. В отличие от публичного
// /api/trainer-club-links/[id]/revoke — уведомляет обе стороны (тренера и клуб).
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as forceRevokeRoute } from '@/app/api/admin/trainer-club-links/[id]/force-revoke/route';
import { createTrainerClubLink } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { LogEntry, Notification, TrainerClubLink } from '@sporthub/types';

const createPostRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/admin/trainer-club-links/${id}/force-revoke`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/admin/trainer-club-links/[id]/force-revoke', () => {
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

  it('admin (userId=3) форсит revoke, revokedBy=admin, уведомляет обе стороны', async () => {
    // Создаём confirmed link (seedTestData создаёт его тоже, но уточним)
    const link = await createTrainerClubLink({
      trainerId: 1,
      clubId: 1,
      status: 'confirmed',
      initiatedBy: 'club',
      initiatedByUserId: 2,
      approvedAt: new Date().toISOString(),
      approvedByUserId: 2,
    });

    const { request, params } = createPostRequest(String(link.id), { adminUserId: 3 });
    const response = await forceRevokeRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    const linksRaw = await readFile(path.join(dataDirectory, 'trainer-club-links.json'), 'utf8');
    const links = JSON.parse(linksRaw) as TrainerClubLink[];
    const updated = links.find((l) => l.id === link.id);
    expect(updated?.status).toBe('revoked');
    expect(updated?.revokedBy).toBe('admin');
    expect(updated?.revokedByUserId).toBe(3);

    // Лог: link_revoke, actorRole=admin, meta.revokedBy=admin.
    const logsRaw = await readFile(path.join(dataDirectory, 'logs.json'), 'utf8');
    const logs = JSON.parse(logsRaw) as LogEntry[];
    const logEntry = logs.find((l) => l.action === 'link_revoke' && l.entityId === link.id);
    expect(logEntry).toBeDefined();
    expect(logEntry?.actorRole).toBe('admin');
    expect((logEntry?.meta as { revokedBy: string }).revokedBy).toBe('admin');

    // Уведомления: trainer manager + club manager.
    const notifRaw = await readFile(path.join(dataDirectory, 'notifications.json'), 'utf8');
    const notifs = JSON.parse(notifRaw) as Notification[];
    const linkRevokedNotifs = notifs.filter((n) => n.type === 'link_revoked');
    expect(linkRevokedNotifs.length).toBeGreaterThanOrEqual(2);
  });

  it('возвращает 403 для не-admin пользователя', async () => {
    const link = await createTrainerClubLink({
      trainerId: 1,
      clubId: 1,
      status: 'confirmed',
      initiatedBy: 'club',
      initiatedByUserId: 2,
    });

    const { request, params } = createPostRequest(String(link.id), { adminUserId: 1 });
    const response = await forceRevokeRoute(request, { params });

    expect(response.status).toBe(403);
  });

  it('возвращает 404 для несуществующей связи', async () => {
    const { request, params } = createPostRequest('99999', { adminUserId: 3 });
    const response = await forceRevokeRoute(request, { params });

    expect(response.status).toBe(404);
  });

  it('возвращает 409 если связь уже revoked', async () => {
    const link = await createTrainerClubLink({
      trainerId: 1,
      clubId: 1,
      status: 'revoked',
      initiatedBy: 'club',
      initiatedByUserId: 2,
      revokedAt: new Date().toISOString(),
      revokedBy: 'trainer',
      revokedByUserId: 2,
    });

    const { request, params } = createPostRequest(String(link.id), { adminUserId: 3 });
    const response = await forceRevokeRoute(request, { params });

    expect(response.status).toBe(409);
  });
});
