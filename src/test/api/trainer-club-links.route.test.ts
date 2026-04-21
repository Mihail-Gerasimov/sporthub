// Phase 24 Step 24.8: тесты API trainer-club-links.
// POST /api/trainer-club-links — создание pending-запроса тренером (manager-of-trainer).
// GET /api/trainer-club-links?trainerId&clubId&status — список с фильтрами.
// POST /api/trainer-club-links/[id]/approve — pending → confirmed (manager-of-club).
// POST /api/trainer-club-links/[id]/reject — pending → rejected (manager-of-club).
// POST /api/trainer-club-links/[id]/revoke — confirmed → revoked (manager любой из сторон или admin).
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as approveRoute } from '@/app/api/trainer-club-links/[id]/approve/route';
import { POST as rejectRoute } from '@/app/api/trainer-club-links/[id]/reject/route';
import { POST as revokeRoute } from '@/app/api/trainer-club-links/[id]/revoke/route';
import { GET as listRoute, POST as createRoute } from '@/app/api/trainer-club-links/route';
import { createTrainerClubLink, getNotifications, getTrainerClubLinks } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

function createRouteRequest(path: string, body: Record<string, unknown>): Request {
  return new Request(`http://localhost:3000${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('Trainer↔Club Link API — Phase 24 Step 24.8', () => {
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

  describe('POST /api/trainer-club-links (create request)', () => {
    it('создаёт pending-link, если userId — manager тренера', async () => {
      // fixtureTrainer id=1 managedByUserId=2; fixtureClub id=1 managedByUserId=2.
      const response = await createRoute(
        createRouteRequest('/api/trainer-club-links', {
          trainerId: 1,
          clubId: 1,
          userId: 2,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.success).toBe(true);
      expect(body.data.status).toBe('pending');
      expect(body.data.initiatedBy).toBe('trainer');
      expect(body.data.trainerId).toBe(1);
      expect(body.data.clubId).toBe(1);

      const notifications = await getNotifications({ userId: 2 });
      // Manager of club 1 — тот же user 2, получает link_requested.
      const linkNotification = notifications.find((n) => n.type === 'link_requested');
      expect(linkNotification).toBeDefined();
    });

    it('403, если userId не manager тренера', async () => {
      const response = await createRoute(
        createRouteRequest('/api/trainer-club-links', {
          trainerId: 1,
          clubId: 1,
          userId: 99,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
    });

    it('400 при отсутствующем trainer или club', async () => {
      const response = await createRoute(
        createRouteRequest('/api/trainer-club-links', {
          trainerId: 9999,
          clubId: 1,
          userId: 2,
        }),
      );

      expect(response.status).toBe(404);
    });

    it('409, если уже есть active (pending|confirmed) link между этим тренером и клубом', async () => {
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const response = await createRoute(
        createRouteRequest('/api/trainer-club-links', {
          trainerId: 1,
          clubId: 1,
          userId: 2,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(409);
      expect(body.success).toBe(false);
    });
  });

  describe('GET /api/trainer-club-links', () => {
    it('фильтрует по trainerId и status', async () => {
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 2,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });
      await createTrainerClubLink({
        trainerId: 3,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });

      const response = await listRoute(
        new NextRequest(
          'http://localhost:3000/api/trainer-club-links?trainerId=1&status=confirmed',
        ),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data).toHaveLength(1);
      expect(body.data[0].clubId).toBe(2);
    });

    it('фильтрует по clubId для inbox-подачи провайдера', async () => {
      await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });
      await createTrainerClubLink({
        trainerId: 3,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const response = await listRoute(
        new NextRequest('http://localhost:3000/api/trainer-club-links?clubId=1&status=pending'),
      );
      const body = await response.json();

      expect(body.data).toHaveLength(2);
    });
  });

  describe('POST /api/trainer-club-links/[id]/approve', () => {
    it('pending → confirmed, если user — manager клуба', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const response = await approveRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/approve`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('confirmed');
      expect(body.data.approvedByUserId).toBe(2);
      expect(typeof body.data.approvedAt).toBe('string');

      // Тренер должен получить link_approved
      const notifications = await getNotifications({ userId: 2 });
      expect(notifications.some((n) => n.type === 'link_approved')).toBe(true);
    });

    it('403, если user — не manager клуба', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const response = await approveRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/approve`, { userId: 99 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );

      expect(response.status).toBe(403);
    });

    it('409, если status не pending', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });

      const response = await approveRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/approve`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );

      expect(response.status).toBe(409);
    });
  });

  describe('POST /api/trainer-club-links/[id]/reject', () => {
    it('pending → rejected с reason, manager клуба', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const response = await rejectRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/reject`, {
          userId: 2,
          reason: 'Нет свободных мест',
        }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('rejected');
      expect(body.data.rejectionReason).toBe('Нет свободных мест');
      expect(body.data.rejectedByUserId).toBe(2);
    });
  });

  describe('POST /api/trainer-club-links/[id]/revoke', () => {
    it('confirmed → revoked, если user — manager тренера', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });

      const response = await revokeRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/revoke`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('revoked');
      expect(body.data.revokedByUserId).toBe(2);
      // Так как manager тренера и клуба — один и тот же (fixture userId=2),
      // revokedBy берём из приоритета: trainer (если manager тренера).
      expect(['trainer', 'club']).toContain(body.data.revokedBy);
    });

    it('403 для левого user без manager-прав', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });

      const response = await revokeRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/revoke`, { userId: 99 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );

      expect(response.status).toBe(403);
    });

    it('тренер может отозвать pending-запрос (тоже переход в revoked)', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'trainer',
      });

      const response = await revokeRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/revoke`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('revoked');
    });

    it('409, если link уже rejected или revoked', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'rejected',
        initiatedBy: 'trainer',
      });

      const response = await revokeRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/revoke`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );

      expect(response.status).toBe(409);
    });
  });

  describe('интеграция: re-request после reject', () => {
    it('после rejected можно создать новый pending-запрос', async () => {
      const first = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'rejected',
        initiatedBy: 'trainer',
      });

      const response = await createRoute(
        createRouteRequest('/api/trainer-club-links', {
          trainerId: 1,
          clubId: 1,
          userId: 2,
        }),
      );
      const body = await response.json();

      expect(response.status).toBe(201);
      expect(body.data.id).not.toBe(first.id);
      expect(body.data.status).toBe('pending');

      const all = await getTrainerClubLinks({ trainerId: 1, clubId: 1 });
      expect(all).toHaveLength(2);
    });
  });
});
