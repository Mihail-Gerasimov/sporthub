/* Phase 29 Step 29.2: тесты Zustand-стора уведомлений.
 * Проверяет setNotifications/setUnreadCount, optimistic markRead с rollback,
 * markAllRead с rollback, removeMany с rollback, setUserId reset, idempotency. */
import { beforeEach, describe, expect, it } from 'vitest';

import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

function makeNotification(id: number, readAt?: string): Notification {
  return {
    id,
    createdAt: `2026-05-01T10:0${id}:00.000Z`,
    userId: 1,
    type: 'booking_confirmed',
    payload: { bookingId: id },
    ...(readAt ? { readAt } : {}),
  } as Notification;
}

describe('useNotificationsStore', () => {
  beforeEach(() => {
    useNotificationsStore.getState().reset();
  });

  describe('setNotifications', () => {
    it('заменяет список и пересчитывает unreadCount', () => {
      const list = [
        makeNotification(1),
        makeNotification(2, '2026-05-01T11:00Z'),
        makeNotification(3),
      ];
      useNotificationsStore.getState().setNotifications(list);

      expect(useNotificationsStore.getState().notifications).toHaveLength(3);
      expect(useNotificationsStore.getState().unreadCount).toBe(2);
      expect(useNotificationsStore.getState().loaded).toBe(true);
    });

    it('пустой список → unreadCount=0', () => {
      useNotificationsStore.getState().setNotifications([]);

      expect(useNotificationsStore.getState().unreadCount).toBe(0);
      expect(useNotificationsStore.getState().loaded).toBe(true);
    });
  });

  describe('setUnreadCount', () => {
    it('устанавливает значение', () => {
      useNotificationsStore.getState().setUnreadCount(5);
      expect(useNotificationsStore.getState().unreadCount).toBe(5);
    });

    it('обнуляет отрицательные значения (clamp)', () => {
      useNotificationsStore.getState().setUnreadCount(-3);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });
  });

  describe('markRead', () => {
    it('помечает непрочитанное и декрементит unreadCount', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1), makeNotification(2)]);

      useNotificationsStore.getState().markRead(1);

      const state = useNotificationsStore.getState();
      expect(state.notifications.find((n) => n.id === 1)?.readAt).toBeDefined();
      expect(state.unreadCount).toBe(1);
    });

    it('идемпотентен — повторный markRead уже прочитанного не меняет state', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);
      useNotificationsStore.getState().markRead(1);
      const firstReadAt = useNotificationsStore.getState().notifications[0].readAt;

      useNotificationsStore.getState().markRead(1);

      expect(useNotificationsStore.getState().notifications[0].readAt).toBe(firstReadAt);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);
    });

    it('unreadCount не уходит в минус при отсутствующем id', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);
      useNotificationsStore.getState().markRead(999);

      expect(useNotificationsStore.getState().unreadCount).toBe(1);
    });

    it('rollbackMarkRead возвращает readAt в undefined и инкрементит unreadCount', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);
      useNotificationsStore.getState().markRead(1);
      expect(useNotificationsStore.getState().unreadCount).toBe(0);

      useNotificationsStore.getState().rollbackMarkRead(1);

      const state = useNotificationsStore.getState();
      expect(state.notifications[0].readAt).toBeUndefined();
      expect(state.unreadCount).toBe(1);
    });
  });

  describe('markAllRead', () => {
    it('помечает все непрочитанные и обнуляет unreadCount', () => {
      useNotificationsStore
        .getState()
        .setNotifications([
          makeNotification(1),
          makeNotification(2, '2026-05-01T11:00Z'),
          makeNotification(3),
        ]);

      const ids = useNotificationsStore.getState().markAllRead();

      const state = useNotificationsStore.getState();
      expect(ids).toEqual([1, 3]);
      expect(state.unreadCount).toBe(0);
      expect(state.notifications.every((n) => n.readAt !== undefined)).toBe(true);
    });

    it('возвращает пустой массив если нет непрочитанных', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1, '2026-05-01T11:00Z')]);

      const ids = useNotificationsStore.getState().markAllRead();

      expect(ids).toEqual([]);
    });

    it('rollbackMarkAllRead возвращает readAt и unreadCount', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1), makeNotification(2)]);
      const ids = useNotificationsStore.getState().markAllRead();
      expect(useNotificationsStore.getState().unreadCount).toBe(0);

      useNotificationsStore.getState().rollbackMarkAllRead(ids);

      const state = useNotificationsStore.getState();
      expect(state.unreadCount).toBe(2);
      expect(state.notifications.every((n) => n.readAt === undefined)).toBe(true);
    });
  });

  describe('removeMany', () => {
    it('удаляет указанные id и декрементит unreadCount только для непрочитанных', () => {
      useNotificationsStore.getState().setNotifications([
        makeNotification(1), // unread
        makeNotification(2, '2026-05-01T11:00Z'), // read
        makeNotification(3), // unread
      ]);

      const removed = useNotificationsStore.getState().removeMany([1, 2]);

      const state = useNotificationsStore.getState();
      expect(removed).toHaveLength(2);
      expect(state.notifications).toHaveLength(1);
      expect(state.notifications[0].id).toBe(3);
      // Удалили 1 непрочитанное (id=1) → unreadCount был 2, стал 1.
      expect(state.unreadCount).toBe(1);
    });

    it('пустой массив id → no-op', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);
      const removed = useNotificationsStore.getState().removeMany([]);

      expect(removed).toEqual([]);
      expect(useNotificationsStore.getState().notifications).toHaveLength(1);
    });

    it('несуществующий id → no-op', () => {
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);
      const removed = useNotificationsStore.getState().removeMany([999]);

      expect(removed).toEqual([]);
      expect(useNotificationsStore.getState().notifications).toHaveLength(1);
    });

    it('rollbackRemoveMany возвращает удалённые элементы в список с сортировкой DESC', () => {
      const list = [makeNotification(1), makeNotification(2), makeNotification(3)];
      useNotificationsStore.getState().setNotifications(list);

      const removed = useNotificationsStore.getState().removeMany([1, 3]);
      expect(useNotificationsStore.getState().notifications).toHaveLength(1);

      useNotificationsStore.getState().rollbackRemoveMany(removed);

      const state = useNotificationsStore.getState();
      expect(state.notifications).toHaveLength(3);
      // DESC по createdAt — сначала 3, потом 2, потом 1.
      expect(state.notifications.map((n) => n.id)).toEqual([3, 2, 1]);
      expect(state.unreadCount).toBe(3);
    });
  });

  describe('setUserId / reset', () => {
    it('setUserId с тем же id — no-op', () => {
      useNotificationsStore.getState().setUserId(1);
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);
      useNotificationsStore.getState().setUserId(1);

      expect(useNotificationsStore.getState().notifications).toHaveLength(1);
    });

    it('setUserId с другим id — полный сброс', () => {
      useNotificationsStore.getState().setUserId(1);
      useNotificationsStore.getState().setNotifications([makeNotification(1), makeNotification(2)]);
      expect(useNotificationsStore.getState().unreadCount).toBe(2);

      useNotificationsStore.getState().setUserId(2);

      const state = useNotificationsStore.getState();
      expect(state.userId).toBe(2);
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.loaded).toBe(false);
    });

    it('setUserId(null) сбрасывает стор для logout', () => {
      useNotificationsStore.getState().setUserId(1);
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);

      useNotificationsStore.getState().setUserId(null);

      expect(useNotificationsStore.getState().userId).toBeNull();
      expect(useNotificationsStore.getState().notifications).toEqual([]);
    });

    it('reset очищает всё', () => {
      useNotificationsStore.getState().setUserId(1);
      useNotificationsStore.getState().setNotifications([makeNotification(1)]);

      useNotificationsStore.getState().reset();

      const state = useNotificationsStore.getState();
      expect(state.userId).toBeNull();
      expect(state.notifications).toEqual([]);
      expect(state.unreadCount).toBe(0);
      expect(state.loaded).toBe(false);
    });
  });
});
