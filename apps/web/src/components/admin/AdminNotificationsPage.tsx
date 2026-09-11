/**
 * Очередь надзора — лента событий администратора в служебной панели
 * (шаги 37.44–37.45).
 *
 * ⚠️ Почему это ОТДЕЛЬНАЯ лента, а не переиспользованный каркас кабинета.
 * Решение 13 фазы 35 не отменено: человеческого набора у администратора нет —
 * ни записей, ни связей, ни отзывов о нём. Надзорная лента — другой ящик:
 * механизм тот же, содержание разное. Каркас кабинета тянуть сюда нельзя,
 * он живёт в `/profile`, а этот раздел — в панели и по её канону.
 *
 * ⚠️ Общее с лентой кабинета не копируется, а берётся из общих модулей: вёдра
 * по дате (`lib/notification-buckets`), подписи тем (`lib/notification-groups`),
 * тексты (`lib/notification-copy`), формат момента (`lib/notification-date`),
 * имя ящика в адресе (`lib/notification-mailbox`) и все мутации с оптимистичным
 * откатом (`hooks/useNotificationsFeedActions`). Копия в этом домене расходилась
 * трижды за две фазы.
 *
 * ⚠️ Ящик здесь ВСЕГДА назван — `SUPERVISION_MAILBOX`. Не названный ящик означает
 * «всё моё», то есть личную почту администратора, которой у него не бывает:
 * страница выглядела бы рабочей и показывала бы вечную пустоту.
 *
 * ⚠️ У вкладок тем ЗДЕСЬ НЕТ СЧЁТЧИКОВ, и это решение, а не пропуск. В ленте
 * кабинета числа на вкладках считаются по выданному списку — в личном ящике это
 * сходит с рук. Очередь надзора растёт быстрее всех лент площадки и читается
 * страницами по пятнадцать строк: число, посчитанное по странице, было бы честным
 * ровно до шестнадцатой строки. Считает тот, у кого все строки, — сервер;
 * поэтому в подписи раздела стоят `total` и `unreadCount` из ответа, а на вкладках
 * не стоит ничего.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';

import { OVERSIGHT_GROUP_KEYS, NOTIFICATION_TYPE_GROUP } from '@sporthub/domain';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  getDateBucket,
  type DateBucket,
} from '@/lib/notification-buckets';
import { getNotificationCopy } from '@/lib/notification-copy';
import { formatNotificationDateFull } from '@/lib/notification-date';
import { NOTIFICATION_GROUP_LABELS, type NotificationGroupFilter } from '@/lib/notification-groups';
import type { NotificationsFeedPage } from '@/lib/server-api';
import { cn } from '@/lib/utils';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

/**
 * Размер страницы — тот же, что в «Логах» и «Пользователях» (шаг 28.18).
 *
 * Объявлен здесь и импортируется серверной страницей: сервер засевает ПЕРВУЮ
 * страницу, браузер листает остальные, и разъехаться этим двум числам нельзя —
 * иначе первая страница показывала бы не столько строк, сколько все следующие.
 */
export const SUPERVISION_PAGE_SIZE = 15;

/**
 * Вкладки тем очереди: «Все» плюс надзорные темы домена.
 *
 * ⚠️ Ключи берутся из `OVERSIGHT_GROUP_KEYS`, а не выписываются здесь списком.
 * Новая надзорная тема появляется во вкладках сама; выписанный список был бы
 * вторым местом, где её забывают, и забывают молча — вкладки просто не показали
 * бы строк, которые обязаны показывать.
 */
export const SUPERVISION_GROUP_TABS: readonly NotificationGroupFilter[] = [
  'all',
  ...OVERSIGHT_GROUP_KEYS,
];

export interface AdminNotificationsPageProps {
  /** Первая страница очереди, полученная сервером: строки плюс счётчики. */
  initialFeed: NotificationsFeedPage;
}

export function AdminNotificationsPage({ initialFeed }: AdminNotificationsPageProps) {
  // Строки живут в общем сторе: его же читает колокольчик панели, и пометка
  // разобранным в ленте меняет значок мгновенно, не дожидаясь опроса.
  const items = useNotificationsStore((state) => state.notifications);
  const setNotificationsInStore = useNotificationsStore((state) => state.setNotifications);

  // ⚠️ Счётчики берутся ИЗ ОТВЕТА СЕРВЕРА и не считаются по стору. Стор держит
  // показанную страницу — пятнадцать строк, — и счёт по нему был бы дефектом
  // фазы 36 наизнанку: не вечный ноль, а уверенная неправда.
  const { total, unreadCount } = initialFeed;

  const [activeGroup, setActiveGroup] = useState<NotificationGroupFilter>('all');

  // Посев остаётся у страницы: серверные данные получила она. В сторе живут
  // только строки — счётчики он считать не умеет и не должен.
  useEffect(() => {
    setNotificationsInStore(initialFeed.items);
  }, [initialFeed, setNotificationsInStore]);

  // Группировка по дате — теми же вёдрами, что в ленте кабинета. Внутри ведра
  // от свежего к старому.
  const buckets = useMemo(() => {
    const now = new Date();
    const map = new Map<DateBucket, Notification[]>();

    for (const item of items) {
      const bucket = getDateBucket(item.createdAt, now);
      const list = map.get(bucket) ?? [];
      list.push(item);
      map.set(bucket, list);
    }

    for (const list of map.values()) {
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    return BUCKET_ORDER.map((key) => ({ key, items: map.get(key) ?? [] })).filter(
      (entry) => entry.items.length > 0,
    );
  }, [items]);

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-[22px]">
      {/* Sec-head по канону панели: eyebrow → Bowlby-заголовок → подпись со счётчиком */}
      <header className="flex min-w-0 flex-col gap-1.5">
        <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
          Admin · Supervision
        </p>
        <h1 className="m-0 font-display text-[24px] uppercase leading-none tracking-tight text-ink sm:text-[26px] lg:text-[28px] xl:text-[32px]">
          Очередь надзора
        </h1>
        <p className="m-0 mt-1 text-[13px] font-normal leading-[1.5] text-muted">
          Общая очередь на всех администраторов ·{' '}
          <span className="font-bold tabular-nums text-ink" data-testid="supervision-unread-count">
            {unreadCount}
          </span>{' '}
          не разобрано из{' '}
          <span className="font-bold tabular-nums text-ink" data-testid="supervision-total-count">
            {total}
          </span>
        </p>
      </header>

      {/* Ряд вкладок по теме события */}
      <div
        role="tablist"
        aria-label="Тема события"
        data-testid="supervision-group-tabs"
        className="scrollbar-hidden -mx-1 flex max-w-full gap-2 overflow-x-auto px-1"
      >
        {SUPERVISION_GROUP_TABS.map((group) => {
          const isActive = activeGroup === group;

          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`supervision-group-${group}`}
              onClick={() => setActiveGroup(group)}
              className={cn(
                'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                isActive
                  ? 'border-lime bg-lime text-ink'
                  : 'border-line bg-transparent text-muted hover:border-lime hover:text-lime',
              )}
            >
              {NOTIFICATION_GROUP_LABELS[group]}
            </button>
          );
        })}
      </div>

      {items.length === 0 ? (
        <p
          data-testid="supervision-empty"
          className="m-0 rounded-[18px] border border-line bg-card p-10 text-center text-sm text-muted"
        >
          Очередь пуста — разбирать нечего
        </p>
      ) : (
        <div className="flex flex-col gap-5">
          {buckets.map((bucket) => (
            <section
              key={bucket.key}
              data-testid={`supervision-bucket-${bucket.key}`}
              className="flex flex-col gap-2.5"
            >
              <h2 className="m-0 text-[11px] font-bold uppercase tracking-[0.18em] text-muted">
                {BUCKET_LABELS[bucket.key]}
              </h2>
              <ul className="flex flex-col gap-2.5">
                {bucket.items.map((notification) => (
                  <li key={notification.id}>
                    <SupervisionCard notification={notification} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}

/**
 * Карточка одной строки очереди.
 *
 * ⚠️ Состояние показывается СЛОВАМИ, а не одной точкой. В личном ящике точка
 * означает «не читал» и понятна владельцу; в общей очереди вопрос другой —
 * занялся ли этим КТО-ТО, и кто именно. «Разобрал #12» отвечает на оба, точка —
 * ни на один.
 */
function SupervisionCard({ notification }: { notification: Notification }) {
  const copy = getNotificationCopy(notification.type, notification.payload);
  const group = NOTIFICATION_TYPE_GROUP[notification.type];
  const isUnresolved = notification.readAt === undefined;

  return (
    <article
      data-testid={`supervision-item-${notification.id}`}
      className="grid grid-cols-1 items-start gap-2 rounded-[18px] border border-line bg-card p-[18px] transition-colors hover:border-lime sm:grid-cols-[1fr_auto] sm:gap-x-4 sm:p-[18px_22px]"
    >
      <div className="order-2 flex min-w-0 flex-col gap-2 sm:order-1">
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-card-2 px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-ink">
            {NOTIFICATION_GROUP_LABELS[group]}
          </span>
          {isUnresolved ? (
            <span
              data-testid={`supervision-item-unresolved-${notification.id}`}
              className="inline-flex items-center whitespace-nowrap rounded-full border border-orange bg-orange-soft px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-orange"
            >
              Не разобрано
            </span>
          ) : (
            <span
              data-testid={`supervision-item-resolved-${notification.id}`}
              className="inline-flex items-center whitespace-nowrap rounded-full border border-line bg-card-2 px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-muted"
            >
              {notification.readByUserId === undefined
                ? 'Разобрано'
                : `Разобрал #${notification.readByUserId}`}
            </span>
          )}
        </div>
        <p className="m-0 break-words text-sm font-semibold leading-[1.3] text-ink">{copy.title}</p>
        {copy.description ? (
          <p className="m-0 break-words text-[13px] leading-[1.5] text-muted">{copy.description}</p>
        ) : null}
      </div>

      <time
        className="order-1 whitespace-nowrap text-xs font-semibold tabular-nums text-muted sm:order-2 sm:pt-1 sm:font-medium"
        dateTime={notification.createdAt}
      >
        {formatNotificationDateFull(notification.createdAt)}
      </time>
    </article>
  );
}
