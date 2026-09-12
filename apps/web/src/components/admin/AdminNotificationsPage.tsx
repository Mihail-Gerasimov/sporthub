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

import { SUPERVISION_PAGE_SIZE } from '@/lib/notification-pagination';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import { OVERSIGHT_GROUP_KEYS, NOTIFICATION_TYPE_GROUP } from '@sporthub/domain';
import { Modal } from '@/components/ui/Modal';
import { PaginationBar } from '@/components/ui/PaginationBar';
import { useNotificationsFeedActions } from '@/hooks/useNotificationsFeedActions';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  getDateBucket,
  type DateBucket,
} from '@/lib/notification-buckets';
import { getNotificationCopy } from '@/lib/notification-copy';
import { formatNotificationDateFull } from '@/lib/notification-date';
import { NOTIFICATION_GROUP_LABELS, type NotificationGroupFilter } from '@/lib/notification-groups';
import { notificationTarget, PANEL_PLACE } from '@/lib/notification-links';
import { mailboxParams, SUPERVISION_MAILBOX } from '@/lib/notification-mailbox';
import type { NotificationsFeedPage } from '@/lib/server-api';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@sporthub/types';

/**
 * Размер страницы — тот же, что в «Логах» и «Пользователях» (шаг 28.18).
 *
 * Объявлен здесь и импортируется серверной страницей: сервер засевает ПЕРВУЮ
 * страницу, браузер листает остальные, и разъехаться этим двум числам нельзя —
 * иначе первая страница показывала бы не столько строк, сколько все следующие.
 */
// Размер страницы объявлен в `lib/notification-pagination.ts` — он нужен и серверной
// странице, а импорт значения из модуля с `'use client'` через границу отдаёт заглушку
// вместо числа (шаг 37.61). Реэкспорт оставлен для прежних импортов.
export { SUPERVISION_PAGE_SIZE };

/** Максимум видимых номеров страниц — как в «Логах»: пагинатор не разбухает. */

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

/**
 * Состояние разбора, которое спрашивают у очереди.
 *
 * ⚠️ Три значения, а не галочка «только неразобранные». У общей очереди разобранное
 * не исчезает: оно остаётся видимым под своим состоянием, с подписью, кто занялся,
 * и его можно вернуть в работу. Галочка выражала бы только два случая из трёх.
 */
export type SupervisionState = 'unresolved' | 'resolved' | 'all';

/**
 * Состояние → параметры запроса. ОДИН словарь, и в нём вся трансляция.
 *
 * ⚠️ Отбор уходит в ЗАПРОС, а не применяется к выданной странице. В человеческой
 * ленте он сделан в памяти поверх страницы с потолком в сто строк: для личного
 * ящика это сходит с рук, для общей очереди означало бы «честно ровно
 * до сто первой строки». Здесь отбирает база.
 *
 * ⚠️ `readOnly=true` маршрут ПОКА НЕ ПОНИМАЕТ — параметра «только разобранные»
 * на сервере нет, есть только `unreadOnly`. Он назван здесь и покрыт тестом
 * подключения; сторона API дописывается отдельно. Назвать его надо было сейчас:
 * альтернатива — отобрать разобранные в памяти, то есть завести ровно тот дефект,
 * ради которого отбор и уезжал в запрос.
 */
const STATE_QUERY: Record<SupervisionState, Record<string, string>> = {
  unresolved: { unreadOnly: 'true' },
  resolved: { readOnly: 'true' },
  all: {},
};

/** Подписи переключателя состояния. */
const STATE_LABELS: Record<SupervisionState, string> = {
  unresolved: 'Не разобрано',
  resolved: 'Разобрано',
  all: 'Все',
};

/** Порядок кнопок состояния: очередь открывается на неразобранном. */
const STATE_ORDER: readonly SupervisionState[] = ['unresolved', 'resolved', 'all'];

export interface AdminNotificationsPageProps {
  /** Первая страница очереди, полученная сервером: строки плюс счётчики. */
  initialFeed: NotificationsFeedPage;
}

export function AdminNotificationsPage({ initialFeed }: AdminNotificationsPageProps) {
  // Строки живут в общем сторе: его же читает колокольчик панели, и пометка
  // разобранным в ленте меняет значок мгновенно, не дожидаясь опроса.
  const items = useNotificationsStore((state) => state.notifications);
  const setNotificationsInStore = useNotificationsStore((state) => state.setNotifications);
  const setUnreadCountInStore = useNotificationsStore((state) => state.setUnreadCount);

  const addToast = useToastStore((state) => state.addToast);
  // Кто разбирает — это я: подпись «занялся» ставится по вошедшему.
  const sessionUserId = useAuthStore((state) => state.user?.id);

  // ⚠️ Мутации — общим хуком, а не своей копией. Копия отката — худший вид копии:
  // её расхождение видно только в момент ОТКАЗА сервера, то есть на экране
  // у человека и никогда в зелёном прогоне.
  //
  // `markReadOnOpen: false` — разбор здесь ОТДЕЛЬНОЕ действие. В ленте кабинета
  // клик по строке и уводит, и гасит; в общей очереди это значило бы «пошёл
  // посмотреть — объявил разобранным всей команде».
  const {
    pendingId,
    markingAll,
    deleting,
    confirmIds,
    markSingleRead,
    markAllRead,
    requestDelete,
    cancelDelete,
    confirmDelete,
  } = useNotificationsFeedActions({
    mailbox: SUPERVISION_MAILBOX,
    markReadOnOpen: false,
  });

  // Подтверждение на «отметить всё». Строк это действие гасит не одну и не свои.
  const [confirmingMarkAll, setConfirmingMarkAll] = useState(false);
  // Возврат строки в очередь: чей запрос сейчас в пути.
  const [returningId, setReturningId] = useState<number | null>(null);

  // Страница, которую показываем: серверный посев либо последний ответ браузера.
  const [fetched, setFetched] = useState<NotificationsFeedPage | null>(null);
  const [loading, setLoading] = useState(false);

  // ⚠️ Счётчики берутся ИЗ ОТВЕТА СЕРВЕРА и не считаются по стору. Стор держит
  // показанную страницу — пятнадцать строк, — и счёт по нему был бы дефектом
  // фазы 36 наизнанку: не вечный ноль, а уверенная неправда.
  const { total, unreadCount } = fetched ?? initialFeed;

  const [activeGroup, setActiveGroup] = useState<NotificationGroupFilter>('all');
  const [state, setState] = useState<SupervisionState>('unresolved');
  // Срез страницы. Меняется листанием и обнуляется сменой отбора: остаться
  // на пятой странице отбора, в котором две страницы, — значит показать пустоту
  // и назвать её «событий нет».
  const [offset, setOffset] = useState(0);

  /**
   * Положить в стор строки И число неразобранных — ВСЕГДА вместе.
   *
   * ⚠️ Найдено паритетом шага 37.52, и это ровно тот класс дефекта, ради которого
   * фаза и затевалась. `setNotifications` пересчитывает счётчик ПО ВЫДАННЫМ
   * строкам: для личного ящика, который приходит целиком, это верно, а очередь
   * надзора читается страницами по пятнадцать. Смена отбора на «разобрано»
   * оставляла на странице ноль неразобранных — и значок в шапке показывал ноль
   * над очередью из двенадцати. Число знает сервер, и класть его в стор обязана
   * страница, получившая ответ.
   */
  const showRows = useCallback(
    (rows: Notification[], unread: number) => {
      setNotificationsInStore(rows);
      setUnreadCountInStore(unread);
    },
    [setNotificationsInStore, setUnreadCountInStore],
  );

  // Посев остаётся у страницы: серверные данные получила она. Стор считать
  // счётчики не умеет и не должен — он их только хранит.
  useEffect(() => {
    showRows(initialFeed.items, initialFeed.unreadCount);
  }, [initialFeed, showRows]);

  /**
   * Спросить очередь с текущим отбором.
   *
   * ⚠️ Ящик называется тем же словарём, что и на сервере (`mailboxParams`):
   * второго места, где имя параметра пишется буквами, в проекте нет.
   */
  const load = useCallback(async () => {
    const params = new URLSearchParams();

    for (const [key, value] of Object.entries(mailboxParams(SUPERVISION_MAILBOX))) {
      params.set(key, String(value));
    }

    if (activeGroup !== 'all') params.set('group', activeGroup);

    for (const [key, value] of Object.entries(STATE_QUERY[state])) {
      params.set(key, value);
    }

    params.set('offset', String(offset));
    params.set('limit', String(SUPERVISION_PAGE_SIZE));

    setLoading(true);

    try {
      const response = await fetch(`/api/notifications?${params.toString()}`);
      const body = (await response.json()) as {
        success: boolean;
        data?: NotificationsFeedPage;
      };

      if (!response.ok || !body.success || body.data === undefined) {
        addToast({ message: 'Не удалось обновить очередь', tone: 'error' });
        return;
      }

      setFetched(body.data);
      showRows(body.data.items, body.data.unreadCount);
    } catch {
      addToast({ message: 'Не удалось обновить очередь', tone: 'error' });
    } finally {
      setLoading(false);
    }
  }, [activeGroup, state, offset, addToast, showRows]);

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

  /**
   * Разобрать одну строку.
   *
   * ⚠️ После удачи строка НЕ исчезает и не перезапрашивается. Перезапрос при
   * отборе «не разобрано» убрал бы её с экрана в тот же миг — а требование
   * обратное: разобранное остаётся видимым под своим состоянием и с подписью,
   * кто занялся. Подпись ставится по вошедшему: разобрал её именно он.
   */
  const resolveOne = useCallback(
    async (id: number) => {
      await markSingleRead(id);

      const rows = useNotificationsStore.getState().notifications;
      const row = rows.find((item) => item.id === id);

      // Отказ виден по стору: хук вернул строку в неразобранные сам.
      if (row === undefined || row.readAt === undefined || sessionUserId === undefined) return;

      // Счётчик здесь НЕ меняется: его уже убавил хук пометки. Простановка
      // подписи — правка одной строки, а не новое событие разбора.
      showRows(
        rows.map((item) => (item.id === id ? { ...item, readByUserId: sessionUserId } : item)),
        useNotificationsStore.getState().unreadCount,
      );
    },
    [markSingleRead, showRows, sessionUserId],
  );

  /**
   * Вернуть строку в очередь: снять разбор.
   *
   * ⚠️ Без этого действия очередь очередью не является. Снятия разбора
   * в проекте не было нигде: ошибочно разобранная строка становилась
   * необратимо разобранной ДЛЯ ВСЕЙ КОМАНДЫ — её больше никто не увидит
   * в работе.
   *
   * Маршрут `POST /api/notifications/:id/unread` на сервере есть и право
   * на строку доказывает тем же способом, что и отметка разобранной (шаг 37.16):
   * у надзорной строки владельца-человека нет, и отбор по `userId` вернул бы
   * «не найдено» каждому администратору.
   */
  const returnToQueue = useCallback(
    async (id: number) => {
      if (returningId !== null) return;

      setReturningId(id);

      const rows = useNotificationsStore.getState().notifications;
      const unreadBefore = useNotificationsStore.getState().unreadCount;

      // Оптимистично: строка снова в работе, счётчик колокольчика подрос.
      // Подрос ровно на единицу — очередь общая, и пересчёт по показанной
      // странице выдал бы вместо числа очереди число экрана.
      showRows(
        rows.map((item) =>
          item.id === id ? { ...item, readAt: undefined, readByUserId: undefined } : item,
        ),
        unreadBefore + 1,
      );

      try {
        const response = await fetch(`/api/notifications/${id}/unread`, { method: 'POST' });

        if (!response.ok) {
          // Возврат к тому, что было ДО нажатия: разбор, его подпись и счётчик целы.
          showRows(rows, unreadBefore);
          addToast({ message: 'Не удалось вернуть в очередь', tone: 'error' });
          return;
        }

        addToast({ message: 'Строка вернулась в очередь', tone: 'success' });
      } catch {
        showRows(rows, unreadBefore);
        addToast({ message: 'Не удалось вернуть в очередь', tone: 'error' });
      } finally {
        setReturningId(null);
      }
    },
    [returningId, showRows, addToast],
  );

  /**
   * Отметить всё и СПРОСИТЬ ОЧЕРЕДЬ ЗАНОВО.
   *
   * ⚠️ Перезапрос здесь обязателен, и это не перестраховка. Счётчики раздела
   * приходят от сервера, а не считаются по стору: без перезапроса подпись
   * продолжала бы показывать прежнее «12 не разобрано» над очередью, в которой
   * уже ничего не осталось. Ровно та форма дефекта, что ловится этой фазой, —
   * число, взятое не оттуда, где оно изменилось.
   *
   * ⚠️ Очередь общая, поэтому ответ может отличаться от ожидаемого: пока шёл
   * запрос, коллега мог что-то разобрать или вернуть. Это не дефект, и подгонять
   * число под своё действие нельзя — правду знает сервер.
   */
  const markAllAndRefresh = useCallback(async () => {
    await markAllRead();
    await load();
  }, [markAllRead, load]);

  /** Удалить и спросить заново — по той же причине: `total` изменился. */
  const deleteAndRefresh = useCallback(async () => {
    await confirmDelete();
    await load();
  }, [confirmDelete, load]);

  // Разобранные строки показанной страницы — их и предлагается убрать.
  const resolvedIds = useMemo(
    () => items.filter((item) => item.readAt !== undefined).map((item) => item.id),
    [items],
  );

  // ⚠️ Число страниц полоса считает от `total` — от числа СЕРВЕРА, а не от длины
  // выданной страницы. Счёт по выданному дал бы вечную «одну страницу»: пятнадцать
  // строк делятся на пятнадцать ровно всегда. Это форма дефекта фазы 36 «счётчик
  // читал число не оттуда», и увидеть её можно только на второй странице. Здесь
  // живёт сдвиг (его ждёт запрос), полосе нужен номер — это одно и то же число.
  const currentPage = Math.floor(offset / SUPERVISION_PAGE_SIZE) + 1;

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

      {/* Уборка очереди: разом и построчно */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          data-testid="supervision-mark-all"
          disabled={markingAll || unreadCount === 0}
          onClick={() => setConfirmingMarkAll(true)}
          className="inline-flex items-center rounded-full border border-line bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime disabled:cursor-not-allowed disabled:opacity-40"
        >
          Отметить всё разобранным
        </button>
        <button
          type="button"
          data-testid="supervision-delete-resolved"
          disabled={deleting || resolvedIds.length === 0}
          onClick={() => requestDelete(resolvedIds)}
          className="inline-flex items-center rounded-full border border-orange bg-transparent px-5 py-2.5 text-[11px] font-bold uppercase tracking-[0.14em] text-orange transition-colors hover:bg-orange hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        >
          Удалить разобранные ({resolvedIds.length})
        </button>
      </div>

      {/* Тулбар: тема слева, состояние справа. На узком — в столбик. */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
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
                onClick={() => {
                  setActiveGroup(group);
                  setOffset(0);
                }}
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

        {/* Состояние разбора: не разобрано (умолчание) / разобрано / всё */}
        <div
          role="group"
          aria-label="Состояние разбора"
          data-testid="supervision-state-filter"
          className="scrollbar-hidden -mx-1 flex max-w-full gap-2 overflow-x-auto px-1"
        >
          {STATE_ORDER.map((value) => {
            const isActive = state === value;

            return (
              <button
                key={value}
                type="button"
                aria-pressed={isActive}
                data-testid={`supervision-state-${value}`}
                onClick={() => {
                  setState(value);
                  setOffset(0);
                }}
                className={cn(
                  'inline-flex shrink-0 items-center whitespace-nowrap rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] transition-colors',
                  isActive
                    ? 'border-lime bg-lime text-ink'
                    : 'border-line bg-transparent text-muted hover:border-lime hover:text-lime',
                )}
              >
                {STATE_LABELS[value]}
              </button>
            );
          })}
        </div>
      </div>

      {items.length === 0 ? (
        <p
          data-testid="supervision-empty"
          className="m-0 rounded-[18px] border border-line bg-card p-10 text-center text-sm text-muted"
          aria-busy={loading}
        >
          {loading ? 'Спрашиваем очередь…' : 'Очередь пуста — разбирать нечего'}
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
                    <SupervisionCard
                      notification={notification}
                      busy={pendingId === notification.id || returningId === notification.id}
                      onResolve={() => {
                        void resolveOne(notification.id);
                      }}
                      onReturn={() => {
                        void returnToQueue(notification.id);
                      }}
                    />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {/* Постраничность — по образцу «Логов»: пагинатор виден всегда */}
      <PaginationBar
        shape="boxed"
        className="px-1 pt-1.5"
        page={currentPage}
        pageSize={SUPERVISION_PAGE_SIZE}
        total={total}
        shownCount={items.length}
        onPageChange={(page) => setOffset((page - 1) * SUPERVISION_PAGE_SIZE)}
        rangeTestId="supervision-page-range"
      />

      {/*
        ⚠️ Подтверждение на «отметить всё» обязательно, и вот почему оно здесь,
        а не в общем хуке: в ленте кабинета это действие гасит СВОЙ ящик, а в общей
        очереди — очередь ВСЕХ администраторов разом. Цена ошибки разная,
        и предупреждать надо ровно там, где она велика.
      */}
      <Modal
        open={confirmingMarkAll}
        onClose={() => setConfirmingMarkAll(false)}
        title="Отметить всю очередь разобранной?"
        description="Очередь общая: строки погаснут у всех администраторов сразу. Вернуть в работу можно будет каждую по отдельности."
        className="max-w-md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              data-testid="supervision-mark-all-cancel"
              onClick={() => setConfirmingMarkAll(false)}
              disabled={markingAll}
              className="rounded-full border border-line bg-card px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="supervision-mark-all-confirm"
              onClick={() => {
                setConfirmingMarkAll(false);
                void markAllAndRefresh();
              }}
              disabled={markingAll}
              className="rounded-full border border-lime bg-lime px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime-hov hover:bg-lime-hov disabled:opacity-50"
            >
              Отметить всё
            </button>
          </div>
        }
      >
        <></>
      </Modal>

      {/* Уборка разобранного: удаление физическое и необратимое */}
      <Modal
        open={confirmIds !== null && confirmIds.length > 0}
        onClose={cancelDelete}
        title="Удалить разобранные строки?"
        description={`Будет удалено строк: ${confirmIds?.length ?? 0}. Журнал служебных действий это не затрагивает — он ведётся отдельно и не переписывается.`}
        className="max-w-md"
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              data-testid="supervision-delete-cancel"
              onClick={cancelDelete}
              disabled={deleting}
              className="rounded-full border border-line bg-card px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime disabled:opacity-50"
            >
              Отмена
            </button>
            <button
              type="button"
              data-testid="supervision-delete-confirm"
              onClick={() => {
                void deleteAndRefresh();
              }}
              disabled={deleting}
              className="rounded-full border-0 bg-orange px-4 py-2 text-[11px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:bg-orange-hov disabled:opacity-50"
            >
              {deleting ? 'Удаляем…' : 'Удалить'}
            </button>
          </div>
        }
      >
        <></>
      </Modal>
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
function SupervisionCard({
  notification,
  busy,
  onResolve,
  onReturn,
}: {
  notification: Notification;
  /** Идёт ли сейчас запрос по ЭТОЙ строке. */
  busy: boolean;
  onResolve: () => void;
  onReturn: () => void;
}) {
  const copy = getNotificationCopy(notification.type, notification.payload);
  const group = NOTIFICATION_TYPE_GROUP[notification.type];
  const isUnresolved = notification.readAt === undefined;
  // Куда ведёт строка — решает общая карта, и место у неё здесь всегда одно:
  // служебная панель. Тот же предмет из кабинета откроется своей карточкой.
  const target = notificationTarget(notification, PANEL_PLACE);

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
        {target.kind === 'open' ? (
          <p className="m-0 break-words text-sm font-semibold leading-[1.3] text-ink">
            {/*
              ⚠️ Переход УВОДИТ и оставляет строку в очереди. Обработчика здесь нет
              намеренно: пока «открыть» и «пометить» были одним действием, поход
              посмотреть объявлял строку разобранной всей команде.
            */}
            <Link
              href={target.href}
              data-testid={`supervision-open-${notification.id}`}
              className="rounded-[4px] text-ink transition-colors hover:text-lime focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime"
            >
              {copy.title}
            </Link>
          </p>
        ) : (
          <p className="m-0 break-words text-sm font-semibold leading-[1.3] text-ink">
            {copy.title}
          </p>
        )}
        {copy.description ? (
          <p className="m-0 break-words text-[13px] leading-[1.5] text-muted">{copy.description}</p>
        ) : null}
        {/*
          ⚠️ Предмета больше нет — и это норма для надзорной строки (шаг 37.55):
          событие «публикация стёрта» переживает свою публикацию. Молчание здесь
          означало бы 404 или пустой раздел, в котором человек ищет, какой фильтр
          съел карточку. Плашка отвечает словами.
        */}
        {target.kind === 'gone' ? (
          <p
            data-testid={`supervision-gone-${notification.id}`}
            className="m-0 inline-flex w-fit items-center rounded-full border border-line bg-card-2 px-3 py-[5px] text-[11px] font-semibold leading-[1.3] text-muted"
          >
            {target.note}
          </p>
        ) : null}

        {/*
          Разбор — ОТДЕЛЬНОЕ действие, а не побочный эффект открытия строки:
          иначе «пошёл посмотреть» означало бы «объявил разобранным всей команде».
        */}
        <div className="flex flex-wrap gap-2">
          {isUnresolved ? (
            <button
              type="button"
              data-testid={`supervision-resolve-${notification.id}`}
              // ⚠️ Подпись для экранного диктора называет СТРОКУ, а не действие
              // (нашёл MCP-прогон интерфейса). В дереве доступности три кнопки
              // «Разобрать» подряд неразличимы: человек слышит список из одинаковых
              // имён и не знает, какую из них нажимает. Ровно эта болезнь была
              // в фазе 35 у ссылки в шапке — там подпись называла не ту цель.
              aria-label={`Разобрать: ${copy.title}`}
              disabled={busy}
              onClick={onResolve}
              className="inline-flex items-center rounded-full border border-line bg-card-2 px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-ink transition-colors hover:border-lime hover:text-lime disabled:cursor-not-allowed disabled:opacity-40"
            >
              Разобрать
            </button>
          ) : (
            <button
              type="button"
              data-testid={`supervision-return-${notification.id}`}
              aria-label={`Вернуть в очередь: ${copy.title}`}
              disabled={busy}
              onClick={onReturn}
              className="inline-flex items-center rounded-full border border-line bg-card-2 px-3 py-[5px] text-[10px] font-bold uppercase tracking-[0.14em] text-muted transition-colors hover:border-lime hover:text-lime disabled:cursor-not-allowed disabled:opacity-40"
            >
              Вернуть в очередь
            </button>
          )}
        </div>
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
