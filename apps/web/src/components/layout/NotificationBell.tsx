/**
 * Phase 24 Step 24.7: NotificationBell — кнопка-колокольчик в Header'е.
 * Показывает счётчик непрочитанных и по клику открывает dropdown
 * с последними 5 уведомлениями. Список грузится лениво по клику
 * (fetch GET /api/notifications?limit=5).
 *
 * ⚠️ Фаза 35, шаг 35.36 (ловушка 7.11). Колокольчик показывался тому, у кого
 * есть тип учётной записи. Типа не стало — и колокольчик исчез бы у ВСЕХ,
 * причём молча: компонент просто вернул бы `null`, без ошибки и без красного
 * теста. Теперь условие честное: уведомления есть у всякого вошедшего, кроме
 * служебной записи (у неё нет ни записей, ни отзывов — уведомляться не о чем).
 *
 * Phase 34 Step 34.49: номер пользователя из запросов ушёл — и из строки адреса,
 * и из тела. Лента и пометка прочитанным идут по сессии; чужое уведомление
 * сервер отвечает тем же «не найдено», что и несуществующее.
 * Счётчик обновляется через useUnreadCountPolling (pathname + interval 60s).
 *
 * Phase 29 Step 29.2: счётчик читаем из `useNotificationsStore` —
 * единый источник правды для Bell и страницы уведомлений. Polling-хук
 * пишет в этот же стор, поэтому badge мгновенно убавляется при пометке
 * прочитанным на странице (без ожидания следующего polling-цикла).
 * markRead в dropdown тоже идёт через стор с optimistic-rollback.
 *
 * ⚠️ Шаг 37.40. Собственного форматтера даты у колокольчика больше нет: краткая
 * форма приезжает из общего `@/lib/notification-date`. Вид подписи прежний —
 * день, месяц и время без года; год в выпадашке шириной 320px был бы шумом.
 * Разными остались ФОРМЫ, а не реализации: расходиться теперь нечему.
 */
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { getNotificationCopy } from '@/lib/notification-copy';
import { formatNotificationDateShort } from '@/lib/notification-date';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { PERSONAL_CABINET_PATH } from '@/lib/service-faces';
import type { Notification } from '@sporthub/types';
import { useUnreadCountPolling } from '@/hooks/useUnreadCountPolling';

const DROPDOWN_LIMIT = 5;

export function NotificationBell() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const { accountKind, primaryCabinet } = useAuthFaces();

  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [items, setItems] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Phase 29 Step 29.2: счётчик читаем из стора — реактивный rerender при
  // markRead/markAllRead/removeMany на странице уведомлений. Polling-хук
  // тоже пишет в этот стор, так что fallback-источник тот же.
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const markReadInStore = useNotificationsStore((state) => state.markRead);
  const rollbackMarkRead = useNotificationsStore((state) => state.rollbackMarkRead);

  const { refetch } = useUnreadCountPolling({ enabled: isAuthenticated });

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/notifications?limit=${DROPDOWN_LIMIT}`);
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
  }, []);

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

  // Раздел уведомлений — в том же кабинете, куда ведёт аватар: у человека
  // с лицами услуг это кабинет текущего лица, у остальных — личный.
  const allNotificationsHref = `${primaryCabinet?.href ?? PERSONAL_CABINET_PATH}/notifications`;

  // Phase 27 Step 27.6: клик по карточке уведомления = mark-as-read + переход на
  // полную страницу уведомлений. Хук объявлен ДО early-return, чтобы порядок
  // хуков был стабилен для разных условий рендера (правило react-hooks/rules-of-hooks).
  //
  // Phase 29 Step 29.2: optimistic-pattern через стор:
  //   1) `markReadInStore(id)` — мгновенно декрементит badge (если уведомление
  //      уже в сторе, например из NotificationsListPage; иначе no-op);
  //   2) локально для items dropdown'а — простановка readAt (легаси-логика);
  //   3) POST /api/notifications/[id]/read;
  //   4) на fail — `rollbackMarkRead(id)` + revert items dropdown'а.
  // Стор инкапсулирует unreadCount-арифметику — bell-badge корректно убавляется
  // даже когда сам Notification не лежит в сторе (badge уже учтён polling'ом).
  const handleItemClick = useCallback(
    async (notification: Notification) => {
      setIsOpen(false);
      if (notification.readAt === undefined) {
        // Optimistic: badge уменьшается мгновенно, dropdown получает readAt.
        markReadInStore(notification.id);
        const now = new Date().toISOString();
        setItems((prev) => prev.map((n) => (n.id === notification.id ? { ...n, readAt: now } : n)));
        try {
          const response = await fetch(`/api/notifications/${notification.id}/read`, {
            method: 'POST',
          });
          if (!response.ok) {
            // Rollback при non-ok ответе — badge возвращается, dropdown тоже.
            rollbackMarkRead(notification.id);
            setItems((prev) =>
              prev.map((n) => (n.id === notification.id ? { ...n, readAt: undefined } : n)),
            );
          } else {
            // Подстраховка: запрашиваем актуальный счётчик с сервера.
            void refetch();
          }
        } catch {
          // Network error — rollback + полагаемся на следующий polling.
          rollbackMarkRead(notification.id);
          setItems((prev) =>
            prev.map((n) => (n.id === notification.id ? { ...n, readAt: undefined } : n)),
          );
        }
      }
      router.push(allNotificationsHref);
    },
    [refetch, router, allNotificationsHref, markReadInStore, rollbackMarkRead],
  );

  if (!isAuthenticated || accountKind === 'admin') {
    return null;
  }

  return (
    <div ref={containerRef} className="relative">
      {/* Bell — 44×44 outline pill, hover lime. Badge orange с числом непрочитанных. */}
      <button
        type="button"
        aria-label="Уведомления"
        onClick={() => {
          setIsOpen((prev) => !prev);
          void refetch();
        }}
        className="relative flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-full border-2 border-[var(--ui-line)] bg-[var(--ui-card)] text-[var(--ui-ink)] transition-colors hover:border-[var(--ui-lime)] hover:text-[var(--ui-lime)]"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="size-[18px]"
          aria-hidden="true"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 ? (
          <span
            data-testid="notification-bell-badge"
            className="absolute -right-[3px] -top-[3px] flex h-5 min-w-5 items-center justify-center rounded-full border-2 border-[var(--ui-bg)] bg-[var(--ui-orange)] px-[5px] font-body text-[10px] font-bold tabular-nums text-[var(--ui-bg)]"
          >
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {isOpen ? (
        <div
          data-testid="notification-bell-dropdown"
          className="absolute right-0 top-[calc(100%+8px)] z-50 w-80 overflow-hidden rounded-[18px] border border-[var(--ui-line)] bg-[var(--ui-card)] shadow-[var(--ui-shadow-floating)]"
          role="dialog"
          aria-label="Последние уведомления"
        >
          <div className="flex items-center justify-between border-b border-[var(--ui-line)] px-4 py-3">
            <span className="font-body text-[13px] font-bold uppercase tracking-[0.06em] text-[var(--ui-ink)]">
              Уведомления
            </span>
            <Link
              href={allNotificationsHref}
              className="font-body text-[11px] font-semibold uppercase tracking-[0.10em] text-[var(--ui-lime)] hover:underline"
              onClick={() => setIsOpen(false)}
            >
              Все уведомления
            </Link>
          </div>
          <div className="max-h-80 overflow-y-auto">
            {loading ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--ui-muted)]">Загружаем…</p>
            ) : items.length === 0 ? (
              <p className="px-4 py-6 text-center text-sm text-[var(--ui-muted)]">
                Нет новых уведомлений
              </p>
            ) : (
              <ul className="divide-y divide-[var(--ui-line)]">
                {items.map((notification) => {
                  const copy = getNotificationCopy(notification.type, notification.payload);
                  const isUnread = notification.readAt === undefined;
                  return (
                    <li key={notification.id}>
                      <button
                        type="button"
                        data-testid={`notification-bell-item-${notification.id}`}
                        onClick={() => {
                          void handleItemClick(notification);
                        }}
                        className={`block w-full cursor-pointer px-4 py-3 text-left text-sm transition-colors hover:bg-[var(--ui-bg)] ${
                          isUnread ? 'bg-[var(--ui-bg-deep)]/40' : ''
                        }`}
                      >
                        <p className="flex items-center justify-between gap-2 font-body font-semibold text-[var(--ui-ink)]">
                          <span>{copy.title}</span>
                          {isUnread ? (
                            <span
                              aria-label="Непрочитанное"
                              className="inline-block size-2 shrink-0 rounded-full bg-[var(--ui-lime)]"
                            />
                          ) : null}
                        </p>
                        {copy.description ? (
                          <p className="mt-1 text-xs text-[var(--ui-muted)]">{copy.description}</p>
                        ) : null}
                        <p className="mt-1 font-body text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--ui-muted)]">
                          {formatNotificationDateShort(notification.createdAt)}
                        </p>
                      </button>
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
