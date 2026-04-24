/**
 * Тесты CRUD-функций для Notification (Phase 24 — Step 24.2).
 * createNotification / getNotifications (фильтры + пагинация) / markNotificationRead /
 * markAllNotificationsRead / getUnreadNotificationCount.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createNotification,
  getNotifications,
  getUnreadNotificationCount,
  markAllNotificationsRead,
  markNotificationRead,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db Notification CRUD — Phase 24', () => {
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

  describe('createNotification', () => {
    it('создаёт запись с автоматическим id и createdAt', async () => {
      const notification = await createNotification({
        userId: 1,
        type: 'booking_confirmed',
        payload: { bookingId: 42 },
      });

      expect(notification.id).toBe(1);
      expect(notification.createdAt).toBeDefined();
      expect(notification.userId).toBe(1);
      expect(notification.type).toBe('booking_confirmed');
      expect(notification.payload).toEqual({ bookingId: 42 });
      expect(notification.readAt).toBeUndefined();
    });

    it('назначает последовательные id', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      const second = await createNotification({ userId: 2, type: 'booking_rejected', payload: {} });

      expect(second.id).toBe(2);
    });
  });

  describe('getNotifications', () => {
    it('возвращает все уведомления без фильтров, отсортированные по createdAt DESC', async () => {
      const first = await createNotification({
        userId: 1,
        type: 'booking_confirmed',
        payload: {},
      });
      // Небольшая задержка, чтобы гарантировать разные timestamps
      await new Promise((resolve) => setTimeout(resolve, 5));
      const second = await createNotification({ userId: 2, type: 'link_approved', payload: {} });

      const all = await getNotifications();

      expect(all).toHaveLength(2);
      // DESC: вторая (более свежая) — первой в списке
      expect(all[0].id).toBe(second.id);
      expect(all[1].id).toBe(first.id);
    });

    it('фильтрует по userId', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 2, type: 'booking_rejected', payload: {} });
      await createNotification({ userId: 1, type: 'link_approved', payload: {} });

      const forUser1 = await getNotifications({ userId: 1 });
      const forUser2 = await getNotifications({ userId: 2 });

      expect(forUser1).toHaveLength(2);
      expect(forUser2).toHaveLength(1);
      expect(forUser1.every((n) => n.userId === 1)).toBe(true);
      expect(forUser2[0].userId).toBe(2);
    });

    it('фильтрует только непрочитанные при unreadOnly=true', async () => {
      const first = await createNotification({
        userId: 1,
        type: 'booking_confirmed',
        payload: {},
      });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });
      await markNotificationRead(first.id);

      const unread = await getNotifications({ userId: 1, unreadOnly: true });

      expect(unread).toHaveLength(1);
      expect(unread[0].type).toBe('booking_rejected');
    });

    it('применяет offset и limit для пагинации', async () => {
      for (let index = 0; index < 5; index += 1) {
        await createNotification({ userId: 1, type: 'booking_confirmed', payload: { index } });
        await new Promise((resolve) => setTimeout(resolve, 2));
      }

      const page = await getNotifications({ userId: 1, offset: 1, limit: 2 });

      expect(page).toHaveLength(2);
    });
  });

  describe('markNotificationRead', () => {
    it('устанавливает readAt существующего уведомления', async () => {
      const notification = await createNotification({
        userId: 1,
        type: 'booking_confirmed',
        payload: {},
      });

      const updated = await markNotificationRead(notification.id);

      expect(updated.readAt).toBeDefined();
      expect(updated.id).toBe(notification.id);
    });

    it('бросает ошибку для несуществующего id', async () => {
      await expect(markNotificationRead(999)).rejects.toThrow('Уведомление не найдено');
    });
  });

  describe('markAllNotificationsRead', () => {
    it('помечает все непрочитанные уведомления пользователя', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });
      await createNotification({ userId: 2, type: 'link_approved', payload: {} });

      const updatedCount = await markAllNotificationsRead(1);
      const remainingUnreadForUser1 = await getUnreadNotificationCount(1);
      const remainingUnreadForUser2 = await getUnreadNotificationCount(2);

      expect(updatedCount).toBe(2);
      expect(remainingUnreadForUser1).toBe(0);
      // Уведомление другого пользователя не трогали
      expect(remainingUnreadForUser2).toBe(1);
    });

    it('возвращает 0, если непрочитанных нет', async () => {
      const updatedCount = await markAllNotificationsRead(1);

      expect(updatedCount).toBe(0);
    });
  });

  describe('getUnreadNotificationCount', () => {
    it('считает только непрочитанные уведомления пользователя', async () => {
      const first = await createNotification({
        userId: 1,
        type: 'booking_confirmed',
        payload: {},
      });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });
      await createNotification({ userId: 2, type: 'link_approved', payload: {} });
      await markNotificationRead(first.id);

      const count = await getUnreadNotificationCount(1);

      expect(count).toBe(1);
    });

    it('возвращает 0, если уведомлений нет', async () => {
      const count = await getUnreadNotificationCount(1);

      expect(count).toBe(0);
    });
  });

  // Phase 27 Step 27.2: applyPreferences перенесён из API в db — проверяем
  // что фильтр работает одинаково в getNotifications и getUnreadNotificationCount.
  describe('applyPreferences (Phase 27)', () => {
    beforeEach(async () => {
      // seedTestData кладёт user id=1 с базовыми полями; дописываем preferences
      // через setUserNotificationPreferences (REQUIRED-типы сервер отбрасывает сам).
      const { setUserNotificationPreferences } = await import('@/lib/db');
      await setUserNotificationPreferences(1, { booking_rejected: false });
    });

    it('getNotifications с applyPreferences=true отфильтровывает отключённый тип', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });

      const unfiltered = await getNotifications({ userId: 1 });
      const filtered = await getNotifications({ userId: 1, applyPreferences: true });

      expect(unfiltered).toHaveLength(2);
      expect(filtered).toHaveLength(1);
      expect(filtered[0].type).toBe('booking_confirmed');
    });

    it('getUnreadNotificationCount с applyPreferences=true не считает отключённый тип', async () => {
      await createNotification({ userId: 1, type: 'booking_confirmed', payload: {} });
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });

      const rawCount = await getUnreadNotificationCount(1);
      const filteredCount = await getUnreadNotificationCount(1, true);

      expect(rawCount).toBe(2);
      expect(filteredCount).toBe(1);
    });

    it('applyPreferences=false/undefined — обратная совместимость, фильтр не применяется', async () => {
      await createNotification({ userId: 1, type: 'booking_rejected', payload: {} });

      expect(await getNotifications({ userId: 1 })).toHaveLength(1);
      expect(await getNotifications({ userId: 1, applyPreferences: false })).toHaveLength(1);
    });
  });
});
