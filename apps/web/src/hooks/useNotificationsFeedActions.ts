/**
 * Мутации ленты уведомлений: пометка прочитанным, «отметить всё», удаление
 * и режим выбора. Одна реализация на все ленты.
 *
 * ⚠️ Почему хук, а не сто двадцать строк внутри ленты кабинета (шаг 37.41).
 * Фаза 37 заводит администратору СВОЮ надзорную ленту — в служебной панели,
 * без каркаса кабинета. Пока откат жил внутри `NotificationsListPage`, у второй
 * ленты было два пути: тянуть чужой компонент или завести вторую копию отката.
 * Копия отката — худший вид копии: расхождение в ней видно только в момент
 * ОТКАЗА сервера, то есть на экране у человека и никогда в зелёном прогоне.
 *
 * ⚠️ Оптимистичность здесь не украшение. Счётчик в шапке и лента читают ОДИН
 * стор, поэтому клик по карточке убавляет цифру колокольчика мгновенно,
 * не дожидаясь ответа. Цена — обязанность вернуть всё назад при отказе,
 * и она исполняется ровно в одном месте.
 *
 * ⚠️ Чего хук НЕ делает. Он не решает, куда ведёт клик и как выглядит строка —
 * это разное у разных лент. И он не заполняет стор: посев ленты серверными
 * данными остаётся у страницы, которая эти данные получила.
 *
 * ⚠️ Выпадашка колокольчика через хук НЕ проходит, и это решение, а не недосмотр.
 * Она держит свой короткий список из пяти строк, отражает пометку в нём же
 * и молчит при отказе, полагаясь на следующий опрос счётчика. Провести её сюда
 * значило бы завести хуку три параметра под чужие особенности; менять её
 * поведение шаг 37.41 не вправе — он рефакторинг.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import { mailboxQuery, type NotificationsMailbox } from '@/lib/notification-mailbox';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@sporthub/types';

export interface UseNotificationsFeedActionsOptions {
  /** Открытый ящик. Не задан — вся лента человека (прежнее поведение). */
  mailbox?: NotificationsMailbox;
  /**
   * Помечать ли строку прочитанной при её открытии. По умолчанию — да: так лента
   * кабинета вела себя с фазы 24.
   *
   * ⚠️ Параметр существует ради надзорной ленты. Там клик по строке уводит
   * к предмету — администратор ушёл разбираться, а строка остаётся непрочитанной,
   * пока он сам её не погасит. Пока «открыть» и «пометить» были одним действием,
   * такую ленту нельзя было собрать вовсе, не переписав обработчик заново.
   */
  markReadOnOpen?: boolean;
  /**
   * Значение, смена которого сбрасывает режим выбора и сами галочки.
   *
   * У ленты человека это его номер: после входа под другой учётной записью
   * выделение прежнего человека наследовать нельзя.
   */
  resetKey?: number;
}

/** Чем закончилось открытие строки — от этого зависит, уводить ли со страницы. */
export type ActivateOutcome = 'selection' | 'open';

export interface NotificationsFeedActions {
  /** Номер строки, пометка которой сейчас в пути. */
  pendingId: number | null;
  /** Идёт ли «отметить всё». */
  markingAll: boolean;
  /** Идёт ли удаление. */
  deleting: boolean;
  /** Включён ли режим выбора нескольких строк. */
  selectionMode: boolean;
  /** Выбранные строки. */
  selectedIds: ReadonlySet<number>;
  /** Строки, ожидающие подтверждения удаления. `null` — подтверждения не ждём. */
  confirmIds: number[] | null;

  markSingleRead: (id: number) => Promise<void>;
  /** Открыть строку: поставить галочку в режиме выбора либо пометить прочитанной. */
  activateItem: (notification: Notification) => ActivateOutcome;
  markAllRead: () => Promise<void>;
  toggleSelectionMode: () => void;
  toggleItemSelection: (id: number) => void;
  requestDelete: (ids: number[]) => void;
  cancelDelete: () => void;
  confirmDelete: () => Promise<void>;
}

export function useNotificationsFeedActions({
  mailbox,
  markReadOnOpen = true,
  resetKey,
}: UseNotificationsFeedActionsOptions): NotificationsFeedActions {
  // Стор — единый источник правды для ленты и счётчика в шапке. Хук им только
  // мутирует; кто его засевает, решает страница.
  const markReadInStore = useNotificationsStore((state) => state.markRead);
  const rollbackMarkReadInStore = useNotificationsStore((state) => state.rollbackMarkRead);
  const markAllReadInStore = useNotificationsStore((state) => state.markAllRead);
  const rollbackMarkAllReadInStore = useNotificationsStore((state) => state.rollbackMarkAllRead);
  const removeManyInStore = useNotificationsStore((state) => state.removeMany);
  const rollbackRemoveManyInStore = useNotificationsStore((state) => state.rollbackRemoveMany);

  const addToast = useToastStore((state) => state.addToast);

  const [pendingId, setPendingId] = useState<number | null>(null);
  const [markingAll, setMarkingAll] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<number>>(() => new Set());
  const [confirmIds, setConfirmIds] = useState<number[] | null>(null);

  // Смена человека — полная очистка выделения: чужие галочки не наследуются.
  useEffect(() => {
    setSelectionMode(false);
    setSelectedIds(new Set());
  }, [resetKey]);

  const markSingleRead = useCallback(
    async (id: number) => {
      if (pendingId !== null) return;
      setPendingId(id);
      // Оптимистично: стор сразу убавляет счётчик, колокольчик меняется
      // до ответа сервера. При отказе — возвращаем.
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

  // Переключение режима выбора. На входе и на выходе — полная очистка галочек,
  // чтобы выделение не утекало между заходами.
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

  /**
   * Открытие строки.
   *
   * В режиме выбора клик тоггалит галочку — как в почтовиках. Вне его строка
   * помечается прочитанной, но только если лента этого просит: надзорная
   * не просит. Исход возвращается наружу, чтобы поверхность сама решила,
   * уводить ли человека со страницы.
   */
  const activateItem = useCallback(
    (notification: Notification): ActivateOutcome => {
      if (selectionMode) {
        toggleItemSelection(notification.id);
        return 'selection';
      }

      if (markReadOnOpen && notification.readAt === undefined) {
        void markSingleRead(notification.id);
      }

      return 'open';
    },
    [selectionMode, toggleItemSelection, markReadOnOpen, markSingleRead],
  );

  // Открыть подтверждение удаления. Одиночный путь передаёт `[id]`, пакетный —
  // весь выбор на момент клика.
  const requestDelete = useCallback((ids: number[]) => {
    if (ids.length === 0) return;
    setConfirmIds(ids);
  }, []);

  const cancelDelete = useCallback(() => {
    setConfirmIds(null);
  }, []);

  const confirmDelete = useCallback(async () => {
    if (confirmIds === null || confirmIds.length === 0) return;
    setDeleting(true);
    // Оптимистично: убираем из стора, запоминая удалённое для возврата.
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
        // После удачного удаления выходим из режима выбора и чистим галочки.
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
    // Оптимистично: все непрочитанные гаснут в сторе, значок колокольчика
    // становится нулём. При отказе возвращаем и `readAt`, и счётчик.
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

  return {
    pendingId,
    markingAll,
    deleting,
    selectionMode,
    selectedIds,
    confirmIds,
    markSingleRead,
    activateItem,
    markAllRead,
    toggleSelectionMode,
    toggleItemSelection,
    requestDelete,
    cancelDelete,
    confirmDelete,
  };
}
