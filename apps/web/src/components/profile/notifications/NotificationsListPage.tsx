/**
 * Лента уведомлений кабинета: личного (`/profile/me/notifications`) и кабинета
 * лица услуг (`/profile/<вид>/<номер>/notifications`).
 *
 * Phase 24: плоский список, mark-as-read по клику, mark-all-read.
 * Phase 26 Step 26.2: вкладки тем, тоггл «Только непрочитанные», группировка
 * по датам (Сегодня / Вчера / Эта неделя / Раньше).
 * Phase 29 Step 29.2: список и счётчик живут в `useNotificationsStore` — тот же
 * стор читает колокольчик, поэтому клик по карточке мгновенно убавляет цифру
 * в шапке.
 * Phase 29 Step 29.3: per-item delete и режим множественного выбора.
 *
 * ⚠️ Шаги 37.39–37.41. Общее с надзорной лентой уехало отсюда: вёдра по дате
 * (`lib/notification-buckets`), подписи тем (`lib/notification-groups`), тексты
 * уведомлений (`lib/notification-copy`), формат момента (`lib/notification-date`),
 * имя ящика в адресе (`lib/notification-mailbox`) и все мутации с оптимистичным
 * откатом (`hooks/useNotificationsFeedActions`).
 *
 * ⚠️ Шаг 37.59 — главное изменение этого файла. ОТБОР ПО ТЕМЕ И ПО СОСТОЯНИЮ
 * УШЁЛ В ЗАПРОС, и второго способа в проекте не осталось.
 *
 * Как было и почему это дефект. Лента получала массив пропом (потолок выдачи —
 * сто строк) и фильтровала его в памяти: `notifications.filter(...)` по теме
 * и по `readAt`. Постраничности не было вовсе. У человека с большой историей это
 * означало две тихих неправды сразу: числа на вкладках считались по обрезанной
 * сотне, а вкладка темы показывала не всё, что в этой теме есть, — только то,
 * что попало в первую сотню. Отказ невидим: страница рисуется, список не пуст,
 * просто он не тот. Ровно тот же класс, что чинил шаг 37.57 (KPI «Непрочитанные»
 * считался в памяти поверх обрезанной ленты).
 *
 * Теперь отбирает база, а страница листается — по образцу очереди надзора
 * (`components/admin/AdminNotificationsPage.tsx`). Формы отбора в проекте одна,
 * и её стережёт текстовый сторож `test/profile/notifications-group-filter-guard.test.ts`.
 *
 * ⚠️ Счётчиков на вкладках БОЛЬШЕ НЕТ, и это решение, а не потеря. Считать их
 * по выданной странице — это и есть исправляемый дефект; сервер же считает
 * по темам только ту тему, которую спросили (`unreadCount` ответа сужается
 * выбранной темой), а маршрута «сколько в каждой теме» нет. Выбор был между
 * числом с сервера, числом из памяти и отсутствием числа: первого нет, второе —
 * уверенная неправда. У очереди надзора чисел на вкладках нет по той же причине.
 * Взамен появились числа, за которые отвечает сервер: «показано X–Y из N»
 * и «непрочитанных: N».
 *
 * Существующие testid'ы сохранены: `notification-item-{id}`,
 * `notification-item-unread-{id}`, `notifications-filter-group-{key}`,
 * `notifications-toggle-unread`, `notifications-bucket-{key}`,
 * `notifications-toggle-selection`, `notification-delete-{id}`,
 * `notification-checkbox-{id}`, `notifications-bulk-delete`,
 * `notifications-delete-confirm`. Новые: `notifications-page-range`,
 * `notifications-unread-count`.
 */
'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { Modal } from '@/components/ui/Modal';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  getDateBucket,
  type DateBucket,
} from '@/lib/notification-buckets';
import { getNotificationCopy } from '@/lib/notification-copy';
import { formatNotificationDateFull } from '@/lib/notification-date';
import {
  HUMAN_GROUP_TABS,
  NOTIFICATION_GROUP_LABELS,
  type NotificationGroupFilter,
} from '@/lib/notification-groups';
import { mailboxParams, type NotificationsMailbox } from '@/lib/notification-mailbox';
import type { NotificationsFeedPage } from '@/lib/server-api';
import { useNotificationsFeedActions } from '@/hooks/useNotificationsFeedActions';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@sporthub/types';

/**
 * Размер страницы ленты кабинета.
 *
 * Объявлен здесь и импортируется обеими серверными страницами: сервер засевает
 * ПЕРВУЮ страницу, браузер листает остальные, и разъехаться этим двум числам
 * нельзя — иначе первая страница показывала бы не столько строк, сколько все
 * следующие, и «показано 1–100 из 150» сменялось бы «21–40» при первом же клике.
 */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Максимум видимых номеров страниц — пагинатор не разбухает на длинной истории. */
const MAX_VISIBLE_PAGE_BUTTONS = 5;

const ICON_CHEV_LEFT = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    className="size-3.5"
    aria-hidden="true"
  >
    <path d="M15 6l-6 6 6 6" />
  </svg>
);

const ICON_CHEV_RIGHT = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2.4"
    className="size-3.5"
    aria-hidden="true"
  >
    <path d="M9 6l6 6-6 6" />
  </svg>
);

export interface NotificationsListPageProps {
  /**
   * Первая страница ленты, полученная СЕРВЕРОМ: строки плюс счётчики.
   *
   * ⚠️ Шаг 37.59. Прежде сюда приходил голый массив строк, и это было половиной
   * дефекта: без `total` постраничность построить не из чего, а без `unreadCount`
   * число непрочитанных приходилось считать по обрезанной выдаче. Конверт отдаёт
   * маршрут целиком — выбрасывать из него счётчики значило считать их заново
   * и хуже.
   */
  initialFeed: NotificationsFeedPage;
  /** Открытый ящик. Не задан — вся лента человека (прежнее поведение). */
  mailbox?: NotificationsMailbox;
  /**
   * Чья это лента. Приходит из СЕРВЕРНОЙ СЕССИИ страницы, а не из браузера.
   *
   * ⚠️ В запросы он больше не уходит ни в каком виде: сервер сам знает, чьи
   * уведомления читать и чьи помечать. Здесь номер нужен ровно для одного —
   * сбросить стор и выделение при смене человека, иначе после входа под другой
   * учёткой на экране остались бы чужие уведомления.
   *
   * `undefined` — гостевая отрисовка: до проверки в лейауте такого не бывает,
   * но тип это допускает, и мутации в этом случае просто не выполняются.
   */
  userId?: number;
}

export function NotificationsListPage({
  initialFeed,
  userId,
  mailbox,
}: NotificationsListPageProps) {
  // Строки живут в общем сторе: его же читает колокольчик шапки, и пометка
  // прочитанным в ленте меняет цифру мгновенно, не дожидаясь опроса.
  const notifications = useNotificationsStore((state) => state.notifications);
  const unreadCount = useNotificationsStore((state) => state.unreadCount);
  const setNotificationsInStore = useNotificationsStore((state) => state.setNotifications);
  const setUnreadCountInStore = useNotificationsStore((state) => state.setUnreadCount);
  const setUserIdInStore = useNotificationsStore((state) => state.setUserId);

  const addToast = useToastStore((state) => state.addToast);

  // ⚠️ Шаг 37.41. Все мутации ленты — в общем хуке: пометка прочитанным, «отметить
  // всё» по ОТКРЫТОМУ ящику, удаление и режим выбора, каждая с оптимистичным
  // откатом при отказе сервера.
  //
  // `markReadOnOpen` не задан — значит «да», и это прежнее поведение ленты
  // человека: клик по непрочитанной карточке гасит её. У надзорной ленты иначе,
  // и ради этого параметр существует.
  const actions = useNotificationsFeedActions({ mailbox, resetKey: userId });

  const [activeGroup, setActiveGroup] = useState<NotificationGroupFilter>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);
  // Срез страницы. Обнуляется сменой отбора: остаться на пятой странице отбора,
  // в котором две страницы, — значит показать пустоту и назвать её «нет событий».
  const [offset, setOffset] = useState(0);

  // Страница, которую показываем: серверный посев либо последний ответ браузера.
  const [fetched, setFetched] = useState<NotificationsFeedPage | null>(null);
  const [loading, setLoading] = useState(false);

  // ⚠️ `total` берётся ИЗ ОТВЕТА СЕРВЕРА и не считается по стору. Стор держит
  // показанную страницу — двадцать строк, — и счёт по нему дал бы вечную «одну
  // страницу»: двадцать строк делятся на двадцать ровно всегда.
  const { total } = fetched ?? initialFeed;

  /**
   * Ящик готовым хвостом параметров — СТРОКОЙ, а не объектом.
   *
   * Пропом приходит объект, и у него новая ссылка на каждую перерисовку родителя.
   * Зависимость запроса от объекта означала бы лишний поход на сервер на ровном
   * месте; зависимость от строки — не означает.
   */
  const mailboxSearch = useMemo(() => {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(mailboxParams(mailbox))) {
      params.set(key, String(value));
    }

    return params.toString();
  }, [mailbox]);

  /**
   * Положить в стор строки И число непрочитанных — ВСЕГДА вместе.
   *
   * ⚠️ `setNotifications` пересчитывает счётчик ПО ВЫДАННЫМ строкам. Пока лента
   * приходила целиком, это было верно; со страницами по двадцать — это дефект
   * фазы 36 наизнанку: не вечный ноль, а уверенная неправда в колокольчике.
   * Число знает сервер, и класть его в стор обязана страница, получившая ответ.
   */
  const showRows = useCallback(
    (rows: Notification[], unread: number) => {
      setNotificationsInStore(rows);
      setUnreadCountInStore(unread);
    },
    [setNotificationsInStore, setUnreadCountInStore],
  );

  // Посев остаётся у страницы: серверные данные получила она, и только она знает,
  // что именно спрашивала. Смена человека заодно сбрасывает стор и выделение —
  // иначе после входа под другой учёткой на экране остались бы чужие строки.
  useEffect(() => {
    if (userId !== undefined) {
      setUserIdInStore(userId);
    }

    showRows(initialFeed.items, initialFeed.unreadCount);
  }, [userId, initialFeed, setUserIdInStore, showRows]);

  /**
   * Спросить ленту с текущим отбором.
   *
   * ⚠️ Тема и «только непрочитанные» уходят В АДРЕС. Отфильтровать выданную
   * страницу нельзя ни тем, ни другим: в ящике строк больше, чем на странице,
   * и отбор в памяти показал бы подмножество подмножества, назвав его полным.
   *
   * ⚠️ Ящик называется тем же словарём, что и на сервере (`mailboxParams`):
   * второго места, где имя параметра пишется буквами, в проекте нет.
   */
  const load = useCallback(async () => {
    const params = new URLSearchParams(mailboxSearch);

    if (activeGroup !== 'all') params.set('group', activeGroup);
    if (showOnlyUnread) params.set('unreadOnly', 'true');

    params.set('offset', String(offset));
    params.set('limit', String(NOTIFICATIONS_PAGE_SIZE));

    setLoading(true);

    try {
      const response = await fetch(`/api/notifications?${params.toString()}`);
      const body = (await response.json()) as {
        success: boolean;
        data?: NotificationsFeedPage;
      };

      // ⚠️ Проверяется не только «успех», но и ФОРМА ответа. Стор заполняется
      // строками напрямую, и конверт без `items` положил бы в него `undefined` —
      // лента падала бы при отрисовке, а причина была бы в ответе другого маршрута.
      if (!response.ok || !body.success || !Array.isArray(body.data?.items)) {
        addToast({ message: 'Не удалось обновить ленту', tone: 'error' });
        return;
      }

      setFetched(body.data);

      // ⚠️ Число непрочитанных в ответе сужено выбранной ТЕМОЙ: спросили «Связи» —
      // получили непрочитанные связей. Колокольчик шапки считает весь ящик,
      // и записать ему тему значило бы завести расхождение «в колокольчике 3,
      // в ленте 0» с другой стороны. Поэтому число ящика берётся из ответа только
      // тогда, когда ответ про весь ящик; под суженной темой остаётся прежнее —
      // его ведут опрос счётчика и оптимистичные пометки.
      const mailboxUnread =
        activeGroup === 'all'
          ? body.data.unreadCount
          : useNotificationsStore.getState().unreadCount;

      showRows(body.data.items, mailboxUnread);
    } catch {
      addToast({ message: 'Не удалось обновить ленту', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [mailboxSearch, activeGroup, showOnlyUnread, offset, addToast, showRows]);

  // ⚠️ Первый проход пропускается намеренно: эту самую страницу уже принёс сервер,
  // и повторный запрос на монтировании был бы вторым походом за тем же самым.
  // Дальше каждая смена отбора идёт В ЗАПРОС — выданную страницу здесь не фильтруют.
  const seeded = useRef(false);

  useEffect(() => {
    if (!seeded.current) {
      seeded.current = true;
      return;
    }

    void load();
  }, [load]);

  // ⚠️ Шаг 35.34. Плашка «Доступ ограничен» убрана: пускать сюда или нет,
  // решает серверный лейаут, и решает ДО похода за данными. Здесь остался
  // только вопрос «известен ли человек» — до ответа «кто я» рисовать нечем.
  const sessionUser = useAuthStore((state) => state.user);

  // Группировка по дате. Сортируем в пределах ведра от новых к старым.
  // Это НЕ отбор: ни одна строка страницы здесь не теряется.
  const buckets = useMemo(() => {
    const now = new Date();
    const map = new Map<DateBucket, Notification[]>();

    for (const notification of notifications) {
      const bucket = getDateBucket(notification.createdAt, now);
      const list = map.get(bucket) ?? [];
      list.push(notification);
      map.set(bucket, list);
    }

    for (const list of map.values()) {
      list.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
    }

    return BUCKET_ORDER.map((key) => ({ key, items: map.get(key) ?? [] })).filter(
      (entry) => entry.items.length > 0,
    );
  }, [notifications]);

  // Число страниц считается от `total` — от числа СЕРВЕРА, а не от длины выданной
  // страницы: увидеть разницу можно только на второй странице.
  const currentPage = Math.floor(offset / NOTIFICATIONS_PAGE_SIZE) + 1;
  const totalPages = Math.max(1, Math.ceil(total / NOTIFICATIONS_PAGE_SIZE));

  const visiblePageNumbers = useMemo(() => {
    const half = Math.floor(MAX_VISIBLE_PAGE_BUTTONS / 2);
    let start = Math.max(1, currentPage - half);
    const end = Math.min(totalPages, start + MAX_VISIBLE_PAGE_BUTTONS - 1);
    start = Math.max(1, end - MAX_VISIBLE_PAGE_BUTTONS + 1);
    const pages: number[] = [];

    for (let page = start; page <= end; page += 1) pages.push(page);

    return pages;
  }, [currentPage, totalPages]);

  // ⚠️ Мутации разворачиваются из хука по именам, чтобы разметка ниже читалась
  // так же, как читалась до выноса: `selectionMode`, `markAllRead`, `requestDelete`.
  const {
    markingAll,
    deleting,
    selectionMode,
    selectedIds,
    confirmIds,
    activateItem,
    markAllRead,
    toggleSelectionMode,
    toggleItemSelection,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = actions;

  /** «Отметить всё» и спросить ленту заново: `total` и состояние строк изменились. */
  const markAllAndRefresh = useCallback(async () => {
    await markAllRead();
    await load();
  }, [markAllRead, load]);

  /** Удалить и спросить заново — по той же причине: строк в ящике стало меньше. */
  const deleteAndRefresh = useCallback(async () => {
    await confirmDelete();
    await load();
  }, [confirmDelete, load]);

  // Размещаем после всех хуков (useState/useEffect/useMemo/useCallback), чтобы соблюсти
  // rules-of-hooks (нельзя менять количество хуков между рендерами).
  if (!sessionUser) {
    return null;
  }

  return (
    <section className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight text-ink">
            Уведомления
          </h1>
          <p className="mt-1 text-sm text-muted">
            События по вашим бронированиям, связям с клубами и рейтингу. Непрочитанных:{' '}
            <span
              className="font-semibold tabular-nums text-ink"
              data-testid="notifications-unread-count"
            >
              {unreadCount}
            </span>
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {unreadCount > 0 && !selectionMode ? (
            <button
              type="button"
              disabled={markingAll}
              onClick={() => {
                void markAllAndRefresh();
              }}
              className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent disabled:opacity-50"
            >
              Отметить всё как прочитанное
            </button>
          ) : null}
          {/* Phase 29 Step 29.3: переключатель режима выбора. В режиме selection
              showing «Удалить (N)» + «Отмена», вне режима — «Выбрать». */}
          {selectionMode ? (
            <>
              <button
                type="button"
                data-testid="notifications-bulk-delete"
                disabled={selectedIds.size === 0 || deleting}
                onClick={() => requestDelete(Array.from(selectedIds))}
                className="rounded-pill border border-orange bg-orange/10 px-4 py-2 text-sm font-semibold text-orange transition-colors hover:bg-orange hover:text-ink disabled:opacity-50"
              >
                Удалить выбранное ({selectedIds.size})
              </button>
              <button
                type="button"
                onClick={toggleSelectionMode}
                className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-lime hover:text-lime"
              >
                Отмена
              </button>
            </>
          ) : (
            <button
              type="button"
              data-testid="notifications-toggle-selection"
              onClick={toggleSelectionMode}
              disabled={notifications.length === 0}
              className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
            >
              Выбрать
            </button>
          )}
        </div>
      </header>

      {/*
        Ряд вкладок тем + тоггл «Только непрочитанные».

        ⚠️ Чисел на вкладках здесь НЕТ: см. пояснение в шапке файла. Любое число,
        посчитанное браузером, считалось бы по выданной странице — это и есть
        исправленный дефект.
      */}
      <div
        className="flex flex-wrap items-center gap-2"
        data-testid="notifications-filters"
        role="tablist"
      >
        {HUMAN_GROUP_TABS.map((group) => {
          const isActive = activeGroup === group;

          return (
            <button
              key={group}
              type="button"
              role="tab"
              aria-selected={isActive}
              data-testid={`notifications-filter-group-${group}`}
              onClick={() => {
                setActiveGroup(group);
                setOffset(0);
              }}
              className={`rounded-pill border px-3 py-1.5 text-xs font-semibold transition-colors ${
                isActive
                  ? 'border-accent bg-accent text-ink'
                  : 'border-line bg-panel text-ink hover:border-accent hover:text-accent'
              }`}
            >
              {NOTIFICATION_GROUP_LABELS[group]}
            </button>
          );
        })}
        <label className="ml-auto flex cursor-pointer items-center gap-2 text-xs font-semibold text-muted">
          <input
            type="checkbox"
            data-testid="notifications-toggle-unread"
            checked={showOnlyUnread}
            onChange={(event) => {
              setShowOnlyUnread(event.target.checked);
              setOffset(0);
            }}
            className="size-4 rounded border-line text-accent focus:ring-accent"
          />
          Только непрочитанные
        </label>
      </div>

      {notifications.length === 0 ? (
        <div
          className="rounded-card border border-dashed border-line bg-canvas p-8 text-center text-sm text-muted"
          aria-busy={loading}
        >
          {loading ? 'Спрашиваем ленту…' : 'Пока нет уведомлений'}
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
                  const isSelected = selectedIds.has(notification.id);
                  return (
                    <li key={notification.id}>
                      <div
                        className={`group relative flex w-full items-stretch gap-3 rounded-card border px-4 py-3 transition-colors ${
                          isSelected ? 'border-lime' : 'border-line hover:border-accent'
                        } ${isUnread ? 'bg-panel' : 'bg-canvas'}`}
                      >
                        {selectionMode ? (
                          <label className="flex shrink-0 cursor-pointer items-center">
                            <input
                              type="checkbox"
                              data-testid={`notification-checkbox-${notification.id}`}
                              checked={isSelected}
                              onChange={() => toggleItemSelection(notification.id)}
                              className="size-4 cursor-pointer rounded border-line accent-lime"
                            />
                          </label>
                        ) : null}
                        <button
                          type="button"
                          data-testid={`notification-item-${notification.id}`}
                          onClick={() => {
                            // В режиме выбора клик тоггалит чекбокс (как в почтовиках),
                            // иначе помечает прочитанным. Оба пути — в общем хуке:
                            // у надзорной ленты второй путь выключен, и различие
                            // задаётся параметром, а не переписанным обработчиком.
                            activateItem(notification);
                          }}
                          className="flex flex-1 flex-col items-start gap-1 text-left"
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
                            {formatNotificationDateFull(notification.createdAt)}
                          </span>
                        </button>
                        {/* Phase 29 Step 29.3: per-item delete (X-иконка) — только
                            вне selection-mode, чтобы не дублировать UI. */}
                        {!selectionMode ? (
                          <button
                            type="button"
                            data-testid={`notification-delete-${notification.id}`}
                            aria-label="Удалить уведомление"
                            onClick={(event) => {
                              event.stopPropagation();
                              requestDelete([notification.id]);
                            }}
                            className="inline-flex size-8 shrink-0 items-center justify-center self-start rounded-full text-muted transition-colors hover:bg-orange/10 hover:text-orange"
                          >
                            <svg
                              viewBox="0 0 24 24"
                              fill="none"
                              stroke="currentColor"
                              strokeWidth="2"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                              className="size-4"
                              aria-hidden="true"
                            >
                              <path d="M18 6L6 18M6 6l12 12" />
                            </svg>
                          </button>
                        ) : null}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/*
        Постраничность. Раз отбор уехал на сервер, лента обязана уметь показать
        больше одной страницы — иначе смена темы означала бы «покажи первые
        двадцать этой темы и промолчи об остальных».
      */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="text-xs font-medium text-muted" data-testid="notifications-page-range">
          {total === 0 ? (
            'Показано 0 из 0'
          ) : (
            <>
              Показано{' '}
              <strong className="font-semibold tabular-nums text-ink">
                {offset + 1}–{Math.min(offset + notifications.length, total)}
              </strong>{' '}
              из <strong className="font-semibold tabular-nums text-ink">{total}</strong>
            </>
          )}
        </span>

        <div className="flex flex-wrap items-center gap-1.5">
          <PageButton
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - NOTIFICATIONS_PAGE_SIZE))}
            ariaLabel="Предыдущая страница"
          >
            {ICON_CHEV_LEFT}
          </PageButton>
          {visiblePageNumbers.map((page) => (
            <PageButton
              key={page}
              active={page === currentPage}
              onClick={() => setOffset((page - 1) * NOTIFICATIONS_PAGE_SIZE)}
              ariaLabel={`Страница ${page}`}
            >
              {page}
            </PageButton>
          ))}
          <PageButton
            disabled={offset + NOTIFICATIONS_PAGE_SIZE >= total}
            onClick={() => setOffset(offset + NOTIFICATIONS_PAGE_SIZE)}
            ariaLabel="Следующая страница"
          >
            {ICON_CHEV_RIGHT}
          </PageButton>
        </div>
      </div>

      {/* Phase 29 Step 29.3: модалка подтверждения удаления. Открывается с
          confirmIds — массив id (1 для per-item, N для bulk). */}
      <Modal
        open={confirmIds !== null && confirmIds.length > 0}
        onClose={cancelDelete}
        title={
          confirmIds && confirmIds.length === 1 ? 'Удалить уведомление?' : 'Удалить уведомления?'
        }
        description={
          confirmIds && confirmIds.length === 1
            ? 'Уведомление будет удалено безвозвратно.'
            : `Будет удалено уведомлений: ${confirmIds?.length ?? 0}. Действие нельзя отменить.`
        }
        className="max-w-md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={cancelDelete}
              disabled={deleting}
              className="rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="notifications-delete-confirm"
              onClick={() => {
                void deleteAndRefresh();
              }}
              disabled={deleting}
              className="rounded-pill border-0 bg-orange px-4 py-2 text-sm font-semibold text-ink transition-colors hover:bg-orange/90 disabled:opacity-50"
            >
              {deleting ? 'Удаляем…' : 'Удалить'}
            </button>
          </div>
        }
      >
        <></>
      </Modal>
    </section>
  );
}

/**
 * Кнопка пагинатора в каноне кабинета.
 *
 * ⚠️ Это не копия пагинатора служебной панели, и слить их в один компонент нельзя
 * без правки самой панели: там другой канон — прямоугольные кнопки `rounded-[8px]`
 * и UPPERCASE-трекинг, здесь `rounded-pill` и кабинетные токены. Общий пагинатор
 * площадки — отдельная работа: своих у панели сегодня три (журнал, модерация,
 * очередь надзора), и заводить четвёртый общий, не тронув те три, значило бы
 * оставить дубль и добавить слой.
 */
function PageButton({
  active = false,
  disabled = false,
  onClick,
  children,
  ariaLabel,
}: {
  active?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: React.ReactNode;
  ariaLabel: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      aria-current={active ? 'page' : undefined}
      className={`inline-flex h-8 min-w-8 items-center justify-center rounded-pill border px-2 text-xs font-semibold tabular-nums transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${
        active
          ? 'border-accent bg-accent text-ink'
          : 'border-line bg-panel text-ink hover:border-accent hover:text-accent'
      }`}
    >
      {children}
    </button>
  );
}
