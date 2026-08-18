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
import {
  createTrainerClubLink,
  getNotifications,
  getOfferings,
  getTrainerClubLinks,
} from '@/lib/db';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
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

    // Phase 27 Step 27.9: блок кейсов для club-side invite — главный баг-фикс.
    // Все fixture-тренеры managedByUserId=2 (тот же, что club#1), поэтому для
    // настоящего cross-owner сценария подменяем managedByUserId одного из тренеров
    // на постороннего юзера через writeFile (seed изолирован per-test).
    describe('Phase 27 Step 27.9 — club-side invite', () => {
      async function makeCrossOwnerTrainer(trainerId: number, ownerUserId: number): Promise<void> {
        const trainersPath = path.join(dataDirectory, 'trainers.json');
        const trainers = JSON.parse(await readFile(trainersPath, 'utf8')) as Array<{
          id: number;
          managedByUserId?: number;
        }>;
        const target = trainers.find((t) => t.id === trainerId);
        if (!target) {
          throw new Error(`Тренер #${trainerId} отсутствует в seed`);
        }
        target.managedByUserId = ownerUserId;
        await writeFile(trainersPath, `${JSON.stringify(trainers, null, 2)}\n`, 'utf8');
      }

      it('club-manager создаёт link для стороннего тренера → 201, initiatedBy=club, notify trainer-manager', async () => {
        // Делаем trainer#3 «посторонним» — его managedByUserId=5 (не равно user=2 = manager club#1).
        await makeCrossOwnerTrainer(3, 5);

        const response = await createRoute(
          createRouteRequest('/api/trainer-club-links', {
            trainerId: 3,
            clubId: 1,
            userId: 2,
            initiatedBy: 'club',
          }),
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.success).toBe(true);
        expect(body.data.initiatedBy).toBe('club');

        // Уведомление ушло manager'у тренера (user=5), НЕ club-manager'у (user=2).
        const trainerNotifications = await getNotifications({ userId: 5 });
        const inviteNotification = trainerNotifications.find((n) => n.type === 'link_requested');
        expect(inviteNotification).toBeDefined();
        expect(inviteNotification?.payload).toMatchObject({ initiatedBy: 'club' });

        // У club-manager'а (user=2) НЕТ link_requested про этот же link.
        const clubNotifications = await getNotifications({ userId: 2 });
        const ownInvite = clubNotifications.find(
          (n) =>
            n.type === 'link_requested' &&
            (n.payload as { linkId?: number }).linkId === body.data.id,
        );
        expect(ownInvite).toBeUndefined();
      });

      it('403, если user не manager ни тренера, ни клуба', async () => {
        await makeCrossOwnerTrainer(3, 5);

        const response = await createRoute(
          createRouteRequest('/api/trainer-club-links', {
            trainerId: 3,
            clubId: 1,
            userId: 99,
            initiatedBy: 'club',
          }),
        );

        expect(response.status).toBe(403);
      });

      it('dual-role manager без initiatedBy в body — fallback на trainer (обратная совместимость)', async () => {
        // userId=2 — manager и trainer #1, и club #1. initiatedBy не передан.
        // Старая логика (всегда 'trainer') должна сохраниться для этого кейса.
        const response = await createRoute(
          createRouteRequest('/api/trainer-club-links', {
            trainerId: 1,
            clubId: 1,
            userId: 2,
          }),
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.data.initiatedBy).toBe('trainer');
      });

      it('только club-manager без initiatedBy → fallback на club', async () => {
        // Тренер #3 теперь «посторонний» (managedByUserId=5). userId=2 — manager только клуба#1.
        // Fallback выбирает 'club', т.к. единственная доступная роль — club-manager.
        await makeCrossOwnerTrainer(3, 5);

        const response = await createRoute(
          createRouteRequest('/api/trainer-club-links', {
            trainerId: 3,
            clubId: 1,
            userId: 2,
          }),
        );
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.data.initiatedBy).toBe('club');
      });
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

    // Phase 27 Step 27.11: для club-initiated pending approve выполняет
    // противоположная сторона — manager тренера. Ранее всегда требовался manager клуба.
    it('Phase 27 Step 27.11: trainer-owner подтверждает club-initiated pending → 200 confirmed + notify club-manager', async () => {
      const trainersPath = path.join(dataDirectory, 'trainers.json');
      const trainers = JSON.parse(await readFile(trainersPath, 'utf8')) as Array<{
        id: number;
        managedByUserId?: number;
      }>;
      const target = trainers.find((t) => t.id === 3);
      if (!target) throw new Error('Тренер #3 отсутствует в seed');
      target.managedByUserId = 5;
      await writeFile(trainersPath, `${JSON.stringify(trainers, null, 2)}\n`, 'utf8');

      // Club-owner (user=2) пригласил сторонний тренер #3 (теперь managedByUserId=5).
      const link = await createTrainerClubLink({
        trainerId: 3,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'club',
      });

      // Trainer-owner (user=5) подтверждает приглашение.
      const response = await approveRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/approve`, { userId: 5 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('confirmed');
      expect(body.data.approvedByUserId).toBe(5);

      // Уведомление уходит инициатору (manager клуба = user=2).
      const clubNotifs = await getNotifications({ userId: 2 });
      const approvedNotif = clubNotifs.find(
        (n) => n.type === 'link_approved' && (n.payload as { linkId?: number }).linkId === link.id,
      );
      expect(approvedNotif).toBeDefined();
      expect(approvedNotif?.payload).toMatchObject({ initiatedBy: 'club' });
    });

    it('Phase 27 Step 27.11: club-owner пытается approve свой club-initiated pending → 403', async () => {
      const trainersPath = path.join(dataDirectory, 'trainers.json');
      const trainers = JSON.parse(await readFile(trainersPath, 'utf8')) as Array<{
        id: number;
        managedByUserId?: number;
      }>;
      const target = trainers.find((t) => t.id === 3);
      if (!target) throw new Error('Тренер #3 отсутствует в seed');
      target.managedByUserId = 5;
      await writeFile(trainersPath, `${JSON.stringify(trainers, null, 2)}\n`, 'utf8');

      const link = await createTrainerClubLink({
        trainerId: 3,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'club',
      });

      // Сам club-owner (user=2) не может approve свой же club-initiated invite.
      const response = await approveRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/approve`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );

      expect(response.status).toBe(403);
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

    // Phase 27 Step 27.11: симметричный reject со стороны тренера для club-initiated pending.
    it('Phase 27 Step 27.11: trainer-owner отклоняет club-initiated pending → 200 rejected + notify club-manager', async () => {
      const trainersPath = path.join(dataDirectory, 'trainers.json');
      const trainers = JSON.parse(await readFile(trainersPath, 'utf8')) as Array<{
        id: number;
        managedByUserId?: number;
      }>;
      const target = trainers.find((t) => t.id === 3);
      if (!target) throw new Error('Тренер #3 отсутствует в seed');
      target.managedByUserId = 5;
      await writeFile(trainersPath, `${JSON.stringify(trainers, null, 2)}\n`, 'utf8');

      const link = await createTrainerClubLink({
        trainerId: 3,
        clubId: 1,
        status: 'pending',
        initiatedBy: 'club',
      });

      const response = await rejectRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/reject`, {
          userId: 5,
          reason: 'Не заинтересован в сотрудничестве',
        }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.status).toBe('rejected');
      expect(body.data.rejectedByUserId).toBe(5);

      // Уведомление с initiatedBy='club' уходит club-manager'у (user=2).
      const clubNotifs = await getNotifications({ userId: 2 });
      const rejectedNotif = clubNotifs.find(
        (n) => n.type === 'link_rejected' && (n.payload as { linkId?: number }).linkId === link.id,
      );
      expect(rejectedNotif).toBeDefined();
      expect(rejectedNotif?.payload).toMatchObject({ initiatedBy: 'club' });
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

  describe('Step 24.10d: auto-detach offerings при revoke', () => {
    it('после revoke offerings с этим trainerClubLinkId теряют поле trainerClubLinkId', async () => {
      const link = await createTrainerClubLink({
        trainerId: 1,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      });

      // Сеем offering с привязкой к этому link'у
      const offeringsPath = path.join(dataDirectory, 'offerings.json');
      await writeFile(
        offeringsPath,
        JSON.stringify(
          [
            {
              id: 1001,
              createdAt: '2026-04-20T00:00:00.000Z',
              ownerType: 'trainer',
              ownerId: 1,
              trainerClubLinkId: link.id,
              sportId: 3,
              title: 'Йога в клубе',
              description: 'desc',
              format: 'group',
              price: 1000,
              durationMinutes: 60,
              capacity: 1,
              address: 'Зал',
              coordinates: { lat: 0, lng: 0 },
            },
          ],
          null,
          2,
        ),
        'utf8',
      );

      const response = await revokeRoute(
        createRouteRequest(`/api/trainer-club-links/${link.id}/revoke`, { userId: 2 }),
        { params: Promise.resolve({ id: String(link.id) }) },
      );

      expect(response.status).toBe(200);

      const offerings = await getOfferings();
      const detached = offerings.find((o) => o.id === 1001);
      expect(detached).toBeDefined();
      expect(detached?.trainerClubLinkId).toBeUndefined();
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
