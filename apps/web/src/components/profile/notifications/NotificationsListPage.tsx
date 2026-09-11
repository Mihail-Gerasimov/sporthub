/**
 * Phase 24 Step 24.7 → Phase 26 Step 26.2: NotificationsListPage — shared
 * client-компонент для /profile/athlete/notifications и /profile/provider/notifications.
 *
 * Phase 24: плоский список, mark-as-read по клику, mark-all-read.
 * Phase 26 Step 26.2: фильтры групп (booking/links/reviews через
 * NOTIFICATION_TYPE_GROUP), тоггл «Только непрочитанные», группировка по датам
 * (Сегодня / Вчера / Эта неделя / Раньше) через helper getDateBucket.
 *
 * Phase 29 Step 29.2: список и unreadCount читаются из `useNotificationsStore`,
 * mark-read и mark-all-read идут через стор с optimistic-rollback. Это
 * синхронизирует страницу и bell-badge: декремент counter'а в шапке
 * происходит мгновенно при клике на карточку (без ожидания polling'а).
 *
 * Phase 29 Step 29.3: per-item delete (X-иконка на каждой карточке) и режим
 * множественного выбора («Выбрать → удалить выбранное»). Удаление физическое
 * (DELETE /api/notifications с silent-filter ownership). Подтверждение —
 * через наш Modal-компонент в стиле Phase 28.
 *
 * Существующие testid'ы сохранены: `notification-item-{id}`,
 * `notification-item-unread-{id}`. Новые: `notifications-filter-group-{key}`,
 * `notifications-toggle-unread`, `notifications-bucket-{key}`,
 * `notifications-toggle-selection`, `notification-delete-{id}`,
 * `notification-checkbox-{id}`, `notifications-bulk-delete`,
 * `notifications-delete-confirm`.
 *
 * ⚠️ Шаги 37.39 и 37.40. Чистые части ленты уехали в `lib`: вёдра по дате
 * и их подписи (`notification-buckets`), подписи тем (`notification-groups`),
 * тексты уведомлений (`notification-copy`), формат момента (`notification-date`). Причина — надзорная лента администратора
 * фазы 37: она живёт в служебной панели и переиспользовать этот каркас не может,
 * а завести вторую копию общего значило бы повторить расхождение, случавшееся
 * в этом домене трижды за две фазы. Здесь остаётся то, что и правда про кабинет:
 * ящик, режим выбора, модалка удаления и сама разметка.
 */
'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';

import { Modal } from '@/components/ui/Modal';
import {
  NOTIFICATION_GROUP_KEYS,
  NOTIFICATION_TYPE_GROUP,
  type NotificationGroupKey,
} from '@sporthub/domain';
import {
  BUCKET_LABELS,
  BUCKET_ORDER,
  getDateBucket,
  type DateBucket,
} from '@/lib/notification-buckets';
import { getNotificationCopy } from '@/lib/notification-copy';
import { formatNotificationDateFull } from '@/lib/notification-date';
import { NOTIFICATION_GROUP_LABELS, type NotificationGroupFilter } from '@/lib/notification-groups';
import { useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@sporthub/types';

import type { ServiceFaceRef } from '@/lib/service-faces';

/**
 * Ящик, который открыт: личный или названного лица.
 *
 * ⚠️ Нужен «прочитать всё» (шаг 35.47a). Без него уборка шла по ВСЕМУ человеку:
 * человек, открывший кабинет одного клуба и нажавший «отметить всё», гасил заодно
 * ящики двух других клубов и свой личный. Бэкенд область понимал с 35.28 — назвать
 * её из браузера было нечем.
 */
export type NotificationsMailbox = { scope: 'personal' } | ServiceFaceRef;

/** Ящик в виде строки запроса — так его называет бэкенд. */
function mailboxQuery(mailbox: NotificationsMailbox | undefined): string {
  if (mailbox === undefined) return '';
  if ('scope' in mailbox) return `?scope=${mailbox.scope}`;

  return mailbox.kind === 'club' ? `?clubId=${mailbox.id}` : `?trainerId=${mailbox.id}`;
}

export interface NotificationsListPageProps {
  notifications: Notification[];
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
  notifications: initial,
  userId,
  mailbox,
}: NotificationsListPageProps) {
  // Phase 29 Step 29.2: список читаем из стора. Server-prop `initial` — seed:
  // при mount синхронизируем стор и впоследствии страница работает с ним
  // как с источником правды. Bell-badge тоже подписан на этот стор → markRead
  // на странице мгновенно убавляет цифру в колокольчике.
  const notifications = useNotificationsStore((state) => state.notifications);
  const setNotificationsInStore = useNotificationsStore((state) => state.setNotifications);
  const setUserIdInStore = useNotificationsStore((state) => state.setUserId);
  const markReadInStore = useNotificationsStore((state) => state.markRead);
  const rollbackMarkReadInStore = useNotificationsStore((state) => state.rollbackMarkRead);
  const markAllReadInStore = useNotificationsStore((state) => state.markAllRead);
  const rollbackMarkAllReadInStore = useNotificationsStore((state) => state.rollbackMarkAllRead);
  // Phase 29 Step 29.3: removeMany — удаляет из списка локально и декрементит
  // unreadCount только на число удалённых непрочитанных. rollback используется
  // на server fail для возврата записей и счётчика.
  const removeManyInStore = useNotificationsStore((state) => state.removeMany);
  const rollbackRemoveManyInStore = useNotificationsStore((state) => state.rollbackRemoveMany);

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [activeGroup, setActiveGroup] = useState<NotificationGroupFilter>('all');
  const [showOnlyUnread, setShowOnlyUnread] = useState(false);

  // Phase 29 Step 29.3: режим выбора нескольких уведомлений и подтверждение
  // удаления через Modal. confirmIds — id'шники, ожидающие подтверждения
  // (per-item: один id; bulk: все selectedIds на момент клика).
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const addToast = useToastStore((state) => state.addToast);

  // Phase 29 Step 29.2: при смене userId — сбрасываем стор и заполняем
  // его server-prop'ом. Если userId не изменился (refresh страницы) —
  // тоже перезаписываем notifications, чтобы взять самые свежие данные.
  useEffect(() => {
    if (userId !== undefined) {
      setUserIdInStore(userId);
    }
    setNotificationsInStore(initial);
  }, [userId, initial, setUserIdInStore, setNotificationsInStore]);

  // Phase 29 Step 29.3: при смене userId сбрасываем выделение, чтобы
  // пользователь не наследовал чужие выборы при impersonation/login.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [userId]);

  // ⚠️ Шаг 35.34. Плашка «Доступ ограничен» убрана: пускать сюда или нет,
  // решает серверный лейаут, и решает ДО похода за данными. Здесь остался
  // только вопрос «известен ли человек» — до ответа «кто я» рисовать нечем.
  const sessionUser = useAuthStore((state) => state.user);

  // ⚠️ Шаг 35.28a. Вкладки — это ТЕМЫ уведомлений («записи», «связи», «отзывы»),
  // а не роли получателей, и показываются все три. Прежде вкладку «Связи» прятали
  // у атлета: у роли атлета связей не бывало. Ролей нет, у человека с клубом связи
  // есть, и спрятанная вкладка означала бы строки, которые видно в «Все»
  // и невозможно отфильтровать.

  // ⚠️ Шаг 35.28a. Отбора по формуле «тип → роль» здесь больше нет — ни здесь,
  // ни в счётчиках вкладок, ни в самом списке. Видимость строки решает её АДРЕСАТ,
  // и решает это сервер, отбирая ящик запросом: браузер показывает ровно то,
  // что ему прислали. Пока правил было два, они расходились молча — «в колокольчике
  // 3, а в списке 0», — и лечить это пересчётом на клиенте нельзя: сервер продолжит
  // слать своё число, и оно вернётся первым же опросом счётчика.
  const hasUnread = notifications.some((notification) => notification.readAt === undefined);

  // Счётчики групп считаются от оригинального списка, без учёта текущих фильтров.
  // Считается ВСЁ, что прислал сервер: он уже отобрал ящик, и второй раз решать
  // «наше ли это уведомление» браузеру нечем и незачем.
  const groupCounts = useMemo<Record<NotificationGroupFilter, number>>(() => {
    const counts: Record<NotificationGroupFilter, number> = {
      all: 0,
      booking: 0,
      links: 0,
      reviews: 0,
      moderation: 0,
    };
    for (const n of notifications) {
      counts.all += 1;
      const g = NOTIFICATION_TYPE_GROUP[n.type];
      if (g) counts[g] += 1;
    }
    return counts;
  }, [notifications]);

  //
  // ⚠️ Шаг 36.21 добавил четвёртую группу — надзорную. Её единственный тип адресован
  // АДМИНИСТРАТОРУ, а на этой странице администратора не бывает: она закрыта
  // `requirePerson()`. Вкладка получалась вечно пустой у всех.
  //
  // Прятать её насовсем нельзя по правилу выше — тогда строка, если она однажды
  // сюда попадёт, будет видна в «Все» и неотфильтровываема. Поэтому решает
  // не формула «кому положено», а сами ДАННЫЕ: вкладка появляется, когда в ленте
  // есть хоть одна её строка.
  const visibleGroupKeys: readonly NotificationGroupKey[] = useMemo(
    () =>
      NOTIFICATION_GROUP_KEYS.filter((group) => group !== 'moderation' || groupCounts[group] > 0),
    [groupCounts],
  );

  // Защита от stale activeGroup: если active-tab стал невидимым, сбрасываем на 'all'.
  useEffect(() => {
    if (activeGroup !== 'all' && !visibleGroupKeys.includes(activeGroup)) {
      setActiveGroup('all');
    }
  }, [activeGroup, visibleGroupKeys]);

  // Фильтр — только то, что человек выбрал сам: группа и тоггл непрочитанных.
  const filtered = useMemo(() => {
    return notifications.filter((n) => {
      if (activeGroup !== 'all' && NOTIFICATION_TYPE_GROUP[n.type] !== activeGroup) {
        return false;
      }
      if (showOnlyUnread && n.readAt !== undefined) {
        return false;
      }
      return true;
    });
  }, [notifications, activeGroup, showOnlyUnread]);

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
      setPendingId(id);
      // Phase 29 Step 29.2: optimistic — стор сразу декрементит unreadCount,
      // bell-badge меняется до ответа сервера. На fail откатываем.
      markReadInStore(id);
      try {
        // Владельца сервер берёт из сессии. Чужое уведомление он отвечает тем же
        // «не найдено», что и несуществующее, — по коду ответа чужие номера
        // не переберёшь.
        const response = await fetch(`/api/notifications/${id}/read`, { method: 'POST' });
        if (!response.ok) {
          rollbackMarkReadInStore(id);
          addToast({ message: 'Не удалось обновить уведомление', tone: 'error' });
        }
      } catch {
        rollbackMarkReadInStore(id);
        addToast({ message: 'Не удалось обновить уведомление', tone: 'error' });
      } finally {
        setPendingId(null);
      }
    },
    [pendingId, addToast, markReadInStore, rollbackMarkReadInStore],
  );

  // Phase 29 Step 29.3: переключение режима выбора. На входе/выходе —
  // полная очистка selectedIds, чтобы выделения не утекали между сеансами.
  const toggleSelectionMode = useCallback(() => {
    setSelectionMode((current) => !current);
    setSelectedIds(new Set());
  }, []);

  const toggleItemSelection = useCallback((id: number) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  }, []);

  // Phase 29 Step 29.3: открыть модалку подтверждения. Per-item путь передаёт
  // [id], bulk-путь — массив selectedIds. После успеха модалка закрывается
  // через handleConfirmDelete; на cancel — через onClose Modal'ы.
  const requestDelete = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setConfirmIds(ids);
  }, []);

  const cancelDelete = useCallback(() => {
    setConfirmIds(null);
  }, []);

  const handleConfirmDelete = useCallback(async () => {
    if (confirmIds === null || confirmIds.length === 0) return;
    setDeleting(true);
    // Optimistic: убираем из стора, считаем удалённые непрочитанные.
    const removed = removeManyInStore(confirmIds);
    try {
      const response = await fetch('/api/notifications', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        // Чужие номера в списке сервер молча отбрасывает — удаляется только своё.
        body: JSON.stringify({ ids: confirmIds }),
      });
      if (!response.ok) {
        rollbackRemoveManyInStore(removed);
        addToast({ message: 'Не удалось удалить уведомления', tone: 'error' });
      } else {
        const message =
          confirmIds.length === 1
            ? 'Уведомление удалено'
            : `Удалено уведомлений: ${confirmIds.length}`;
        addToast({ message, tone: 'success' });
        // После успешного удаления — выходим из selection-mode и очищаем выбор.
        setSelectionMode(false);
        setSelectedIds(new Set());
      }
    } catch {
      rollbackRemoveManyInStore(removed);
      addToast({ message: 'Не удалось удалить уведомления', tone: 'error' });
    } finally {
      setDeleting(false);
      setConfirmIds(null);
    }
  }, [confirmIds, removeManyInStore, rollbackRemoveManyInStore, addToast]);

  const markAllRead = useCallback(async () => {
    if (markingAll) return;
    setMarkingAll(true);
    // Phase 29 Step 29.2: optimistic — все непрочитанные помечаются в сторе,
    // bell-badge становится 0. На fail возвращаем readAt и unreadCount.
    const optimisticallyMarkedIds = markAllReadInStore();
    try {
      // ⚠️ До фазы 34 этот маршрут не проверял НИЧЕГО: прислал чужой номер —
      // пометил прочитанными чужие уведомления. Тела у него больше нет.
      // ⚠️ Уборка идёт по ОТКРЫТОМУ ящику. До шага 35.47a область не называлась,
      // и «отметить всё» в кабинете одного клуба гасило ящики остальных лиц
      // и личный заодно — то есть кнопка делала больше, чем обещала подписью.
      const response = await fetch(`/api/notifications/read-all${mailboxQuery(mailbox)}`, {
        method: 'POST',
      });
      if (!response.ok) {
        rollbackMarkAllReadInStore(optimisticallyMarkedIds);
        addToast({ message: 'Не удалось отметить все уведомления', tone: 'error' });
        return;
      }
      addToast({ message: 'Все уведомления отмечены прочитанными', tone: 'success' });
    } catch {
      rollbackMarkAllReadInStore(optimisticallyMarkedIds);
      addToast({ message: 'Не удалось отметить все уведомления', tone: 'error' });
    } finally {
      setMarkingAll(false);
    }
  }, [markingAll, mailbox, addToast, markAllReadInStore, rollbackMarkAllReadInStore]);

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
            События по вашим бронированиям, связям с клубами и рейтингу.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {hasUnread && !selectionMode ? (
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
                  ? 'border-accent bg-accent text-ink'
                  : 'border-line bg-panel text-ink hover:border-accent hover:text-accent'
              }`}
            >
              {NOTIFICATION_GROUP_LABELS[group]}
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
                            // Phase 29 Step 29.3: в режиме выбора клик по карточке
                            // тоггалит чекбокс (как в почтовиках), иначе — markRead.
                            if (selectionMode) {
                              toggleItemSelection(notification.id);
                              return;
                            }
                            if (isUnread) void markSingleRead(notification.id);
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
                void handleConfirmDelete();
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
