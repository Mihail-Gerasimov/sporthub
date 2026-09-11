/**
 * Очередь надзора — лента событий администратора в служебной панели (шаг 37.44).
 *
 * ⚠️ Почему это ОТДЕЛЬНАЯ лента, а не переиспользованный каркас кабинета.
 * Решение 13 фазы 35 не отменено: человеческого набора у администратора нет —
 * ни записей, ни связей, ни отзывов о нём. Надзорная лента — другой ящик:
 * механизм тот же, содержание разное. Каркас кабинета тянуть сюда нельзя,
 * он живёт в `/profile`, а этот раздел — в панели.
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
 */
'use client';

import { useEffect } from 'react';

import { getNotificationCopy } from '@/lib/notification-copy';
import { formatNotificationDateFull } from '@/lib/notification-date';
import type { NotificationsFeedPage } from '@/lib/server-api';
import { useNotificationsStore } from '@/stores/useNotificationsStore';

/**
 * Размер страницы — тот же, что в «Логах» и «Пользователях» (шаг 28.18).
 *
 * Объявлен здесь и импортируется серверной страницей: сервер засевает ПЕРВУЮ
 * страницу, браузер листает остальные, и разъехаться этим двум числам нельзя —
 * иначе первая страница показывала бы не столько строк, сколько все следующие.
 */
export const SUPERVISION_PAGE_SIZE = 15;

export interface AdminNotificationsPageProps {
  /** Первая страница очереди, полученная сервером: строки плюс счётчики. */
  initialFeed: NotificationsFeedPage;
}

export function AdminNotificationsPage({ initialFeed }: AdminNotificationsPageProps) {
  // Строки живут в общем сторе: его же читает колокольчик панели, и пометка
  // разобранным в ленте меняет значок мгновенно, не дожидаясь опроса.
  const items = useNotificationsStore((state) => state.notifications);
  const setNotificationsInStore = useNotificationsStore((state) => state.setNotifications);

  // Посев остаётся у страницы: серверные данные получила она.
  useEffect(() => {
    setNotificationsInStore(initialFeed.items);
  }, [initialFeed, setNotificationsInStore]);

  return (
    <section
      className="flex w-full flex-col gap-5 sm:gap-[22px]"
      aria-labelledby="supervision-title"
    >
      <header className="flex min-w-0 flex-col gap-1.5">
        <h1
          id="supervision-title"
          className="m-0 font-display text-[24px] uppercase leading-none tracking-tight text-ink sm:text-[26px] lg:text-[28px] xl:text-[32px]"
        >
          Очередь надзора
        </h1>
      </header>

      <ul className="flex flex-col gap-2.5">
        {items.map((notification) => {
          const copy = getNotificationCopy(notification.type, notification.payload);

          return (
            <li
              key={notification.id}
              data-testid={`supervision-item-${notification.id}`}
              className="rounded-[18px] border border-line bg-card p-[18px]"
            >
              <p className="m-0 text-sm font-semibold text-ink">{copy.title}</p>
              <time className="text-xs text-muted" dateTime={notification.createdAt}>
                {formatNotificationDateFull(notification.createdAt)}
              </time>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
