'use client';

/* Phase 29 Step 29.2: Zustand-стор уведомлений — единый источник правды
 * для bell-counter и страницы уведомлений в ЛК.
 *
 * Зачем: до Phase 29 счётчик `unreadCount` жил в локальном state хука
 * `useUnreadCountPolling`, а список уведомлений — в локальном state
 * `NotificationsListPage`. Они не были синхронизированы: пометка прочитанным
 * на странице не обновляла bell-badge до следующего polling-цикла (60s).
 *
 * Этот стор объединяет оба state и обеспечивает мгновенную реактивность:
 * любой компонент, подписанный на `unreadCount` или `notifications`, получает
 * новое значение сразу после `markRead` / `markAllRead` / `removeMany`.
 *
 * Optimistic-pattern: `markRead` сначала меняет локальный state (декрементит
 * unreadCount, проставляет readAt), затем шлёт POST. На fail — revert через
 * `rollbackMarkRead` (вызывает потребитель, обычно через try/catch).
 *
 * Phase 29 Step 29.3 расширит `removeMany(ids)` логикой rollback — пока что
 * экшен сделан так, чтобы потребитель сам управлял rollback'ом через
 * `setNotifications` и `setUnreadCount` при server fail. */

import { create } from 'zustand';

import type { Notification } from '@/types';

type NotificationsState = {
  /** Полный список уведомлений пользователя (для страницы и dropdown). */
  notifications: Notification[];
  /** Число непрочитанных — реактивный источник для bell-badge. */
  unreadCount: number;
  /** Флаг: список уже хотя бы раз был загружен (для skip первого fetch). */
  loaded: boolean;
  /** Id пользователя, для которого живёт текущий state. Сброс при смене. */
  userId: number | null;

  // ----- actions -----

  /** Полностью заменить список + пересчитать unreadCount. Используется при
   * первом fetch и при ответе polling'а (когда сервер отдал свежие данные). */
  setNotifications: (notifications: Notification[]) => void;

  /** Установить unreadCount явно — через polling-хук. */
  setUnreadCount: (unreadCount: number) => void;

  /** Optimistic mark-as-read: если уведомление было непрочитанным, проставляет
   * readAt и декрементит unreadCount (с floor 0). Идемпотентен — повторный
   * вызов с тем же id ничего не меняет. POST на сервер делает потребитель. */
  markRead: (id: number) => void;

  /** Откат markRead при server fail — вернуть readAt в undefined и инкрементить
   * unreadCount. Вызывается потребителем из catch-ветки fetch'а. */
  rollbackMarkRead: (id: number) => void;

  /** Optimistic mark-all-as-read: проставляет readAt всем непрочитанным,
   * unreadCount → 0. Возвращает массив id, которые были помечены — нужен для
   * rollback'а. */
  markAllRead: () => number[];

  /** Откат markAllRead при server fail — снять readAt с переданного списка id
   * и восстановить unreadCount. */
  rollbackMarkAllRead: (ids: number[]) => void;

  /** Удалить пачку уведомлений из локального списка и декрементировать
   * unreadCount на число удалённых непрочитанных. Возвращает удалённые
   * элементы — нужны для rollback'а при server fail. */
  removeMany: (ids: number[]) => Notification[];

  /** Откат removeMany — вернуть удалённые элементы в список и пересчитать
   * unreadCount. Восстанавливает порядок по createdAt DESC (как обычно
   * приходит с сервера). */
  rollbackRemoveMany: (removed: Notification[]) => void;

  /** Сменить userId: если пришёл другой — сбрасываем стор. Используется
   * Bell'ом и страницей при смене сессии (login/logout/impersonation). */
  setUserId: (userId: number | null) => void;

  /** Полный сброс стора — для logout. */
  reset: () => void;
};

const INITIAL_STATE = {
  notifications: [] as Notification[],
  unreadCount: 0,
  loaded: false,
  userId: null as number | null,
};

function countUnread(notifications: Notification[]): number {
  return notifications.reduce((acc, n) => (n.readAt === undefined ? acc + 1 : acc), 0);
}

export const useNotificationsStore = create<NotificationsState>()((set, get) => ({
  ...INITIAL_STATE,

  setNotifications: (notifications) => {
    set({
      notifications,
      unreadCount: countUnread(notifications),
      loaded: true,
    });
  },

  setUnreadCount: (unreadCount) => {
    set({ unreadCount: Math.max(0, unreadCount) });
  },

  markRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    if (!target || target.readAt !== undefined) return;

    const now = new Date().toISOString();
    set((state) => ({
      notifications: state.notifications.map((n) => (n.id === id ? { ...n, readAt: now } : n)),
      unreadCount: Math.max(0, state.unreadCount - 1),
    }));
  },

  rollbackMarkRead: (id) => {
    const target = get().notifications.find((n) => n.id === id);
    // Откатываем только если уведомление сейчас прочитано — иначе rollback
    // дублирует undo других путей (например, если polling уже синхронизировал).
    if (!target || target.readAt === undefined) return;

    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.id === id ? { ...n, readAt: undefined } : n,
      ),
      unreadCount: state.unreadCount + 1,
    }));
  },

  markAllRead: () => {
    const unreadIds = get()
      .notifications.filter((n) => n.readAt === undefined)
      .map((n) => n.id);
    if (unreadIds.length === 0) return [];

    const now = new Date().toISOString();
    set((state) => ({
      notifications: state.notifications.map((n) =>
        n.readAt === undefined ? { ...n, readAt: now } : n,
      ),
      unreadCount: 0,
    }));
    return unreadIds;
  },

  rollbackMarkAllRead: (ids) => {
    if (ids.length === 0) return;
    set((state) => ({
      notifications: state.notifications.map((n) =>
        ids.includes(n.id) ? { ...n, readAt: undefined } : n,
      ),
      unreadCount: state.unreadCount + ids.length,
    }));
  },

  removeMany: (ids) => {
    if (ids.length === 0) return [];
    const idSet = new Set(ids);
    const removed: Notification[] = [];
    const remaining: Notification[] = [];
    let unreadDelta = 0;

    for (const n of get().notifications) {
      if (idSet.has(n.id)) {
        removed.push(n);
        if (n.readAt === undefined) unreadDelta += 1;
      } else {
        remaining.push(n);
      }
    }

    if (removed.length === 0) return [];

    set((state) => ({
      notifications: remaining,
      unreadCount: Math.max(0, state.unreadCount - unreadDelta),
    }));
    return removed;
  },

  rollbackRemoveMany: (removed) => {
    if (removed.length === 0) return;
    // Восстанавливаем элементы и сортируем по createdAt DESC, чтобы порядок
    // совпадал с обычным ответом сервера. Это упрощает потребителям UI
    // — не нужно ловить "перевёрнутый" список.
    set((state) => {
      const merged = [...state.notifications, ...removed];
      merged.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
      return {
        notifications: merged,
        unreadCount: countUnread(merged),
      };
    });
  },

  setUserId: (userId) => {
    if (userId === get().userId) return;
    // При любой смене userId — полный сброс stale-данных.
    set({ ...INITIAL_STATE, userId });
  },

  reset: () => {
    set({ ...INITIAL_STATE });
  },
}));
