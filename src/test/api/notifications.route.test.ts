// Phase 24 Step 24.5: тесты 4 API-эндпоинтов уведомлений.
// GET /api/notifications — список с фильтрами и пагинацией + total + unreadCount.
// POST /api/notifications/[id]/read — пометка одного уведомления прочитанным.
// POST /api/notifications/read-all — массовая пометка непрочитанных пользователя.
// GET /api/notifications/unread-count — быстрый счётчик для bell-icon.
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as readOneRoute } from '@/app/api/notifications/[id]/read/route';
import { POST as readAllRoute } from '@/app/api/notifications/read-all/route';
import { GET as listRoute } from '@/app/api/notifications/route';
import { GET as unreadCountRoute } from '@/app/api/notifications/unread-count/route';
import { createNotification } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Notifications API — Phase 24', () => {
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

  describe('GET /api/notifications', () => {
    it('возвращает items + total + unreadCount для пользователя', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });
      await createNotification({ userId: 2, type: 'link_approved', payload: {} });

      const response = await listRoute(
        new NextRequest('http://localhost:3000/api/notifications?userId=1'),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.success).toBe(true);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.total).toBe(2);
      expect(body.data.unreadCount).toBe(2);
      expect(body.data.items.every((n: { userId: number }) => n.userId === 1)).toBe(true);
    });

    it('фильтрует по unreadOnly=true', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      const unreadOne = await createNotification({
        userId: 1,
        type: 'booking_rejected',
        payload: {},
      });

      // Подожди — первая станет read через отдельный API. Для теста используем
      // createNotification + markNotificationRead напрямую через импорт.
      const { markNotificationRead } = await import('@/lib/db');
      await markNotificationRead(unreadOne.id - 1); // помечаем первую

      const response = await listRoute(
        new NextRequest('http://localhost:3000/api/notifications?userId=1&unreadOnly=true'),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.items).toHaveLength(1);
      expect(body.data.unreadCount).toBe(1);
    });

    it('применяет пагинацию offset/limit', async () => {
      for (let i = 0; i < 5; i += 1) {
        await createNotification({ userId: 1, type: 'booking_confirmed', payload: { i } });
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      const response = await listRoute(
        new NextRequest('http://localhost:3000/api/notifications?userId=1&offset=1&limit=2'),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.items).toHaveLength(2);
      expect(body.data.total).toBe(5);
    });

    it('возвращает 400 без userId', async () => {
      const response = await listRoute(new NextRequest('http://localhost:3000/api/notifications'));
      expect(response.status).toBe(400);
    });
  });

  describe('POST /api/notifications/[id]/read', () => {
    it('помечает существующее уведомление прочитанным', async () => {
      const notification = await createNotification({
        userId: 1,
        type: 'booking_confirmed',
        payload: {},
      });

      const request = new Request(
        `http://localhost:3000/api/notifications/${notification.id}/read`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 1 }),
        },
      );
      const response = await readOneRoute(request, {
        params: Promise.resolve({ id: String(notification.id) }),
      });
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.readAt).toBeDefined();
    });

    it('возвращает 404 при попытке пометить чужое уведомление', async () => {
      const notification = await createNotification({
        userId: 2,
        type: 'link_approved',
        payload: {},
      });

      const request = new Request(
        `http://localhost:3000/api/notifications/${notification.id}/read`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId: 1 }),
        },
      );
      const response = await readOneRoute(request, {
        params: Promise.resolve({ id: String(notification.id) }),
      });

      expect(response.status).toBe(404);
    });
  });

  describe('POST /api/notifications/read-all', () => {
    it('помечает все непрочитанные уведомления пользователя и возвращает updatedCount', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });
      await createNotification({ userId: 2, type: 'link_approved', payload: {} });

      const request = new Request('http://localhost:3000/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 1 }),
      });
      const response = await readAllRoute(request);
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.updatedCount).toBe(2);
    });

    it('возвращает 400 без userId', async () => {
      const request = new Request('http://localhost:3000/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const response = await readAllRoute(request);

      expect(response.status).toBe(400);
    });
  });

  describe('GET /api/notifications/unread-count', () => {
    it('возвращает количество непрочитанных уведомлений пользователя', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });
      await createNotification({ userId: 2, type: 'link_approved', payload: {} });

      const response = await unreadCountRoute(
        new NextRequest('http://localhost:3000/api/notifications/unread-count?userId=1'),
      );
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(body.data.unreadCount).toBe(2);
    });

    it('возвращает 0 если уведомлений нет', async () => {
      const response = await unreadCountRoute(
        new NextRequest('http://localhost:3000/api/notifications/unread-count?userId=999'),
      );
      const body = await response.json();

      expect(body.data.unreadCount).toBe(0);
    });
  });
});
