/**
 * Phase 24 Step 24.7 → Phase 26 Step 26.2: NotificationsListPage — shared
 * client-компонент для /profile/athlete/notifications и /profile/provider/notifications.
 *
 * Phase 24: плоский список, mark-as-read по клику, mark-all-read.
 * Phase 26 Step 26.2: фильтры групп (booking/links/quarantine через
 * NOTIFICATION_TYPE_GROUP), тоггл «Только непрочитанные», группировка по датам
 * (Сегодня / Вчера / Эта неделя / Раньше) через helper getDateBucket.
 *
 * Существующие testid'ы сохранены: `notification-item-{id}`,
 * `notification-item-unread-{id}`. Новые: `notifications-filter-group-{key}`,
 * `notifications-toggle-unread`, `notifications-bucket-{key}`.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import { getNotificationCopy } from '@/components/profile/notifications/notification-copy';
import {
  NOTIFICATION_GROUP_KEYS,
  NOTIFICATION_TYPE_GROUP,
  isNotificationTypeApplicable,
  type NotificationGroupKey,
} from '@/lib/notification-types';
import { useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@/types';

export interface NotificationsListPageProps {
  notifications: Notification[];
  /**
   * Id пользователя — нужен для массового mark-read (read-all body).
   * Может быть undefined, если server page не смог определить юзера (гость или cookie
   * не установлена). В этом случае список просто рендерим без mutation-flows.
   */
  userId?: number;
  /**
   * Phase 26 Step 26.8: тип аккаунта, определяет видимость tab'ов фильтра.
   * athlete не получает link_* уведомлений (уходят провайдеру), поэтому
   * tab «Связи» у атлета скрываем — он всегда пустой.
   */
  accountType: 'athlete' | 'provider';
}

type GroupFilter = 'all' | NotificationGroupKey;
type DateBucket = 'today' | 'yesterday' | 'thisWeek' | 'earlier';

const GROUP_LABELS: Record<GroupFilter, string> = {
  all: 'Все',
  booking: 'Записи',
  links: 'Связи',
  quarantine: 'Дисциплина',
};

const BUCKET_ORDER: readonly DateBucket[] = ['today', 'yesterday', 'thisWeek', 'earlier'];
const BUCKET_LABELS: Record<DateBucket, string> = {
  today: 'Сегодня',
  yesterday: 'Вчера',
  thisWeek: 'Эта неделя',
  earlier: 'Раньше',
};

/** Полный формат даты-времени для карточки уведомления. */
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

/**
 * Определяет дата-bucket для createdAt относительно now. Работает в UTC для
 * детерминизма в тестах и на сервере (вне зависимости от TZ хоста). Понедельник
 * считается началом недели — соответствует locale-соглашениям проекта.
 */
export function getDateBucket(iso: string, now: Date): DateBucket {
  const ts = new Date(iso).getTime();
  const todayStart = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  const msPerDay = 24 * 60 * 60 * 1000;
  const yesterdayStart = todayStart - msPerDay;

  // Понедельник = начало недели. getUTCDay(): 0=Вс..6=Сб → daysToMonday.
  const nowDay = now.getUTCDay();
  const daysToMonday = nowDay === 0 ? 6 : nowDay - 1;
  const weekStart = todayStart - daysToMonday * msPerDay;

  if (ts >= todayStart) return 'today';
  if (ts >= yesterdayStart) return 'yesterday';
  if (ts >= weekStart) return 'thisWeek';
  return 'earlier';
}

export function NotificationsListPage({
  notifications: initial,
  userId,
  accountType,
}: NotificationsListPageProps) {
  const [notifications, setNotifications] = useState<Notification[]>(initial);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeGroup, setActiveGroup] = useState<GroupFilter>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  const addToast = useToastStore((state) => state.addToast);

  // Phase 27 Step 27.8: auth-guard через useAuthStore. Prop `accountType` — требуемая
  // роль для текущего подмаршрута (server-page фиксирует её при рендере). Если сессия
  // не совпадает — показываем AccessDeniedCard, как на 14 остальных подмаршрутах ЛК.
  const sessionUser = useAuthStore((state) => state.user);
  const sessionAccountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  // Phase 26 Step 26.8: видимые группы зависят от типа аккаунта.
  const visibleGroupKeys: readonly NotificationGroupKey[] =
    accountType === 'athlete' ? (['booking', 'quarantine'] as const) : NOTIFICATION_GROUP_KEYS;

  // Защита от stale activeGroup: если active-tab стал невидимым (смена accountType на лету),
  // сбрасываем на 'all'. Для MVP accountType стабилен в пределах монтирования — скорее edge-case.
  useEffect(() => {
    if (activeGroup !== 'all' && !visibleGroupKeys.includes(activeGroup)) {
      setActiveGroup('all');
    }
  }, [activeGroup, visibleGroupKeys]);

  // Phase 27 Step 27.3: hasUnread — только по применимым к accountType типам,
  // иначе athlete увидит кнопку «Отметить всё» из-за неправильных записей в базе.
  const hasUnread = notifications.some(
    (notification) =>
      notification.readAt === undefined &&
      isNotificationTypeApplicable(notification.type, accountType),
  );

  // Счётчики групп считаются от оригинального списка, без учёта текущих фильтров.
  // Phase 27 Step 27.3: не считаем чужие типы — athlete не должен видеть в «Все»
  // число, включающее link_* уведомления (даже если они ошибочно в базе).
  const groupCounts = useMemo<Record<GroupFilter, number>>(() => {
    const counts: Record<GroupFilter, number> = {
      all: 0,
      booking: 0,
      links: 0,
      quarantine: 0,
    };
    for (const n of notifications) {
      if (!isNotificationTypeApplicable(n.type, accountType)) continue;
      counts.all += 1;
      const g = NOTIFICATION_TYPE_GROUP[n.type];
      if (g) counts[g] += 1;
    }
    return counts;
  }, [notifications, accountType]);

  // Фильтр: сначала по accountType (защита от чужих типов), затем по группе, затем unread-тогглу.
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (!isNotificationTypeApplicable(n.type, accountType)) {
        return false;
      }
      if (activeGroup !== 'all' && NOTIFICATION_TYPE_GROUP[n.type] !== activeGroup) {
        return false;
      }
      if (showOnlyUnread && n.readAt !== undefined) {
        return false;
      }
      return true;
    });
  }, [notifications, activeGroup, showOnlyUnread, accountType]);

  // Группировка по дате. Сортируем в пределах bucket'а от новых к старым.
  const buckets = useMemo(() => {
    const now = new Date();
    const map = new Map<DateBucket, Notification[]>();
    for (const n of filtered) {
      const bucket = getDateBucket(n.createdAt, now);
      const arr = map.get(bucket) ?? [];
      arr.push(n);
      map.set(bucket, arr);
    }
    for (const arr of map.values()) {
      arr.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }
    return BUCKET_ORDER.map((key) => ({ key, items: map.get(key) ?? [] })).filter(
      (entry) => entry.items.length > 0,
    );
  }, [filtered]);

  const markSingleRead = useCallback(
    async (id: number) => {
      if (pendingId !== null) return;
      // Без userId fetch не имеет смысла — endpoint валидирует ownership через { userId }
      // в теле и strict Zod-схему, пустой body сразу даст 500/400 и грустный toast.
      // Это же защищает гостевой рендер (когда cookie не установлен).
      if (userId === undefined) return;
      setPendingId(id);
      try {
        const response = await fetch(`/api/notifications/${id}/read`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userId }),
        });
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
    [pendingId, addToast, userId],
  );

  const markAllRead = useCallback(async () => {
    if (markingAll) return;
    // Без userId не делаем запрос — это гостевой рендер или админ без impersonation.
    if (userId === undefined) return;
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

  // Phase 27 Step 27.8: гость или несоответствие роли — AccessDeniedCard.
  // Размещаем после всех хуков (useState/useEffect/useMemo/useCallback), чтобы соблюсти
  // rules-of-hooks (нельзя менять количество хуков между рендерами).
  if (!isAuthenticated || sessionAccountType !== accountType || !sessionUser) {
    return <AccessDeniedCard requiredRole={accountType} />;
  }

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

      {/* Ряд фильтров: 4 tab'а групп + toggle «Только непрочитанные». */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="notifications-filters"
        role="tablist"
      >
        {(['all', ...visibleGroupKeys] as const).map((group) => {
          const isActive = activeGroup === group;
          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`notifications-filter-group-${group}`}
              onClick={() => setActiveGroup(group)}
              className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'border-accent bg-accent text-panel'
                  : 'border-line bg-panel text-ink hover:border-accent hover:text-accent'
              }`}
            >
              {GROUP_LABELS[group]}
              <span className="ml-1.5 inline-block rounded-pill bg-canvas/40 px-1.5 text-[10px] font-semibold">
                {groupCounts[group]}
              </span>
            </button>
          );
        })}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            data-testid="notifications-toggle-unread"
            checked={showOnlyUnread}
            onChange={(event) => setShowOnlyUnread(event.target.checked)}
            className="size-4 rounded border-line text-accent focus:ring-accent"
          />
          Только непрочитанные
        </label>
      </div>

      {filtered.length === 0 ? (
        <div className="rounded-card border border-dashed border-line bg-canvas p-8 text-center text-sm text-muted">
          Пока нет уведомлений
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          {buckets.map((bucket) => (
            <section
              key={bucket.key}
              data-testid={`notifications-bucket-${bucket.key}`}
              className="flex flex-col gap-2"
            >
              <h2 className="text-[11px] font-semibold uppercase tracking-[0.08em] text-muted">
                {BUCKET_LABELS[bucket.key]}
              </h2>
              <ul className="flex flex-col gap-2">
                {bucket.items.map((notification) => {
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
            </section>
          ))}
        </div>
      )}
    </section>
  );
}
