/**
 * Phase 24 Step 24.7: NotificationsListPage — shared client-компонент
 * для /profile/athlete/notifications и /profile/provider/notifications.
 * Рендерит плоский список уведомлений, поддерживает отметку одного как
 * прочитанного (POST /api/notifications/[id]/read) и массовое обнуление
 * (POST /api/notifications/read-all). Локальный state обновляется сразу,
 * чтобы bell-иконка и индикаторы реагировали без router.refresh.
 */
'use client';

import { useCallback, useState } from 'react';

import { getNotificationCopy } from '@/components/profile/notifications/notification-copy';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@/types';

export interface NotificationsListPageProps {
  notifications: Notification[];
  /** Id пользователя — нужен для массового mark-read (read-all body). */
  userId: number;
}

function formatFullDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString('ru-RU', {
      day: '2-digit',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function NotificationsListPage({
  notifications: initial,
  userId,
}: NotificationsListPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initial);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  const hasUnread = notifications.some((notification) => notification.readAt === undefined);

  const markSingleRead = useCallback(
    async (id: number) => {
      if (pendingId !== null) return;
      setPendingId(id);
      try {
        const response = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
        if (!response.ok) {
          addToast({ message: 'Не удалось обновить уведомление', tone: 'error' });
          return;
        }
        setNotifications((current) =>
          current.map((notification) =>
            notification.id === id && notification.readAt === undefined
              ? { ...notification, readAt: new Date().toISOString() }
              : notification,
          ),
        );
      } finally {
        setPendingId(null);
      }
    },
    [pendingId, addToast],
  );

  const markAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    try {
      const response = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId }),
      });
      if (!response.ok) {
        addToast({ message: 'Не удалось отметить все уведомления', tone: 'error' });
        return;
      }
      const now = new Date().toISOString();
      setNotifications((current) =>
        current.map((notification) =>
          notification.readAt === undefined ? { ...notification, readAt: now } : notification,
        ),
      );
      addToast({ message: 'Все уведомления отмечены прочитанными', tone: 'success' });
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, userId, addToast]);

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Уведомления
          </h1>
          <p className="mt-1 text-sm text-muted">
            События по вашим бронированиям, связям с клубами и рейтингу.
          </p>
        </div>
        {hasUnread ? (
          <button
            type="button"
            disabled={markingAll}
            onClick={() => {
              void markAllRead();
            }}
            className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
          >
            Отметить всё как прочитанное
          </button>
        ) : null}
      </header>

      {notifications.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-canvas p-8 text-center text-sm text-muted">
          Пока нет уведомлений
        </div>
      ) : (
        <ul className="flex flex-col gap-2">
          {notifications.map((notification) => {
            const copy = getNotificationCopy(notification.type, notification.payload);
            const isUnread = notification.readAt === undefined;
            return (
              <li key={notification.id}>
                <button
                  type="button"
                  data-testid={`notification-item-${notification.id}`}
                  onClick={() => {
                    if (isUnread) void markSingleRead(notification.id);
                  }}
                  className={`flex w-full flex-col items-start gap-1 rounded-card border border-line px-4 py-3 text-left transition-colors hover:border-accent ${
                    isUnread ? 'bg-panel' : 'bg-canvas'
                  }`}
                >
                  <div className="flex w-full items-center justify-between gap-2">
                    <span className="text-sm font-semibold text-ink">{copy.title}</span>
                    {isUnread ? (
                      <span
                        data-testid={`notification-item-unread-${notification.id}`}
                        className="inline-block size-2 shrink-0 rounded-full bg-accent"
                        aria-label="Непрочитанное"
                      />
                    ) : null}
                  </div>
                  {copy.description ? (
                    <p className="text-xs text-muted">{copy.description}</p>
                  ) : null}
                  <span className="text-[11px] uppercase tracking-[0.08em] text-muted">
                    {formatFullDate(notification.createdAt)}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
