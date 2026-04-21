/**
 * Phase 24 Step 24.7: NotificationBell — кнопка-колокольчик в Header'е.
 * Показывает счётчик непрочитанных и по клику открывает dropdown
 * с последними 5 уведомлениями. Список грузится лениво по клику
 * (fetch GET /api/notifications?userId&limit=5). Видим только
 * аутентифицированным пользователям с accountType (athlete/provider).
 * Счётчик обновляется через useUnreadCountPolling (pathname + interval 60s).
 */
'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getNotificationCopy } from '@/components/profile/notifications/notification-copy';
import { useAuthStore } from '@/stores/useAuthStore';
import type { Notification } from '@/types';
import { useUnreadCountPolling } from '@/hooks/useUnreadCountPolling';

const DROPDOWN_LIMIT = 5;

function formatNotificationDate(iso: string): string {
  try {
    const date = new Date(iso);
    return date.toLocaleDateString('ru-RU', {
      day: '2-digit',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

export function NotificationBell() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const user = useAuthStore((state) => state.user);
  const userId = user?.id ?? null;

  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const { unreadCount, refetch } = useUnreadCountPolling({
    userId: isAuthenticated ? userId : null,
  });

  const loadItems = useCallback(async () => {
    if (userId === null) return;
    setLoading(true);
    try {
      const response = await fetch(`/api/notifications?userId=${userId}&limit=${DROPDOWN_LIMIT}`);
      if (!response.ok) return;
      const body = (await response.json()) as {
        success: boolean;
        data?: { items: Notification[] };
      };
      if (body.success && body.data) {
        setItems(body.data.items);
      }
    } catch {
      // ignore — dropdown просто останется пустым
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!isOpen) return;
    void loadItems();
  }, [isOpen, loadItems]);

  // Закрытие по клику вне компонента
  useEffect(() => {
    if (!isOpen) return;
    function onDocumentClick(event: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener('mousedown', onDocumentClick);
    return () => {
      document.removeEventListener('mousedown', onDocumentClick);
    };
  }, [isOpen]);

  if (!isAuthenticated || !accountType) {
    return null;
  }

  const allNotificationsHref =
    accountType === 'provider'
      ? '/profile/provider/notifications'
      : '/profile/athlete/notifications';

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        aria-label="Уведомления"
        onClick={() => {
          setIsOpen((prev) => !prev);
          void refetch();
        }}
        className="relative flex size-11 shrink-0 items-center justify-center rounded-pill border border-line bg-canvas text-ink transition-colors hover:border-accent hover:text-accent"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-5"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span
            data-testid="notification-bell-badge"
            className="absolute -right-1 -top-1 flex min-w-5 items-center justify-center rounded-full bg-accent px-1.5 text-[11px] font-semibold leading-5 text-panel"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          data-testid="notification-bell-dropdown"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-card border border-line bg-panel shadow-lg"
          role="dialog"
          aria-label="Последние уведомления"
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <span className="text-sm font-semibold text-ink">Уведомления</span>
            <Link
              href={allNotificationsHref}
              className="text-xs font-semibold text-accent hover:underline"
              onClick={() => setIsOpen(false)}
            >
              Все уведомления
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Загружаем…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-muted">Нет новых уведомлений</p>
            ) : (
              <ul className="divide-y divide-line">
                {items.map((notification) => {
                  const copy = getNotificationCopy(notification.type, notification.payload);
                  const isUnread = notification.readAt === undefined;
                  return (
                    <li
                      key={notification.id}
                      className={`px-4 py-3 text-sm ${isUnread ? 'bg-canvas' : ''}`}
                    >
                      <p className="flex items-center justify-between gap-2 font-semibold text-ink">
                        <span>{copy.title}</span>
                        {isUnread ? (
                          <span
                            aria-label="Непрочитанное"
                            className="inline-block size-2 rounded-full bg-accent"
                          />
                        ) : null}
                      </p>
                      {copy.description ? (
                        <p className="mt-1 text-xs text-muted">{copy.description}</p>
                      ) : null}
                      <p className="mt-1 text-[11px] uppercase tracking-[0.08em] text-muted">
                        {formatNotificationDate(notification.createdAt)}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
