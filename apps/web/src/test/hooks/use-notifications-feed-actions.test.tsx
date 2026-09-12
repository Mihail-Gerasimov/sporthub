// Мутации ленты уведомлений: одна реализация на все ленты (шаг 37.41).
//
// ⚠️ Что здесь проверяется и почему набор новый. Пометка прочитанным, «отметить
// всё», удаление и режим выбора жили внутри `NotificationsListPage` — сто двадцать
// строк с оптимистичным откатом. Надзорная лента администратора живёт в служебной
// панели и этот каркас переиспользовать не может: у неё был бы выбор между чужим
// импортом и второй копией отката. Копия отката — худший вид копии: расхождение
// в ней видно только в момент ОТКАЗА сервера, то есть на экране у человека и
// никогда в зелёном прогоне.
//
// Поэтому проверяется не отрисовка, а сам механизм: что откат возвращает счётчик
// и строки, что уборка идёт по названному ящику и что «открыть» и «пометить
// прочитанным» — два РАЗНЫХ действия, а не одно.

import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useNotificationsFeedActions } from '@/hooks/useNotificationsFeedActions';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Notification } from '@sporthub/types';

/**
 * Сколько непрочитанных в наборе строк.
 *
 * ⚠️ Раньше это считал сам стор внутри `setNotifications`. Пересчёт по выданным
 * строкам был верен, пока лента приходила целиком, и стал дефектом с появлением
 * постраничности: двадцать строк из ста пятидесяти давали счётчик «20».
 * Теперь число называет тот, кто его знает, — в наборах это делает засев.
 */
function unreadOf(rows: { readAt?: string }[]): number {
  return rows.filter((row) => row.readAt === undefined).length;
}

const PERSON_ID = 7;

/** Две непрочитанные строки и одна прочитанная — минимум, на котором виден откат. */
const FEED: Notification[] = [
  {
    id: 1,
    addresseeKind: 'personal' as const,
    userId: PERSON_ID,
    type: 'booking_confirmed',
    payload: { subjectType: 'booking', subjectId: 100 },
    createdAt: '2026-04-22T10:00:00.000Z',
  },
  {
    id: 2,
    addresseeKind: 'personal' as const,
    userId: PERSON_ID,
    type: 'link_requested',
    payload: { subjectType: 'link', subjectId: 200 },
    createdAt: '2026-04-22T09:00:00.000Z',
  },
  {
    id: 3,
    addresseeKind: 'personal' as const,
    userId: PERSON_ID,
    type: 'booking_completed',
    payload: { subjectType: 'booking', subjectId: 300 },
    createdAt: '2026-04-21T09:00:00.000Z',
    readAt: '2026-04-21T10:00:00.000Z',
  },
];

/** Ответ сервера: `ok` решает, чем закончится мутация. */
function stubFetch(ok: boolean): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(
    async () =>
      new Response(JSON.stringify({ success: ok }), {
        status: ok ? 200 : 500,
        headers: { 'Content-Type': 'application/json' },
      }),
  );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

/** Адреса, по которым сходил хук. */
function calledUrls(fetchMock: ReturnType<typeof vi.fn>): string[] {
  return fetchMock.mock.calls.map(([input]) => String(input));
}

const unread = (): number => useNotificationsStore.getState().unreadCount;
const rows = (): Notification[] => useNotificationsStore.getState().notifications;
const rowById = (id: number): Notification | undefined => rows().find((n) => n.id === id);

beforeEach(() => {
  useNotificationsStore.getState().reset();
  useNotificationsStore.getState().setNotifications(FEED, unreadOf(FEED));
  useToastStore.setState({ toasts: [] });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('мутации ленты уведомлений', () => {
  describe('пометка одной строки', () => {
    it('гасит счётчик до ответа сервера', async () => {
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      expect(unread()).toBe(2);

      await act(async () => {
        await result.current.markSingleRead(1);
      });

      expect(unread()).toBe(1);
      expect(rowById(1)?.readAt).toBeDefined();
      expect(calledUrls(fetchMock)).toEqual(['/api/notifications/1/read']);
    });

    it('при отказе сервера возвращает и строку, и счётчик', async () => {
      // ⚠️ Главная проверка набора. Оптимистичная мутация без отката оставляет
      // человеку экран, который врёт: строка прочитана, счётчик убавлен,
      // а на сервере ничего не изменилось — и первый же опрос вернёт всё назад.
      stubFetch(false);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      await act(async () => {
        await result.current.markSingleRead(1);
      });

      expect(unread()).toBe(2);
      expect(rowById(1)?.readAt).toBeUndefined();
    });

    it('об отказе сообщает человеку, а не молча', async () => {
      stubFetch(false);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      await act(async () => {
        await result.current.markSingleRead(1);
      });

      expect(useToastStore.getState().toasts).toHaveLength(1);
      expect(useToastStore.getState().toasts[0]?.tone).toBe('error');
    });
  });

  describe('пометка всей ленты', () => {
    it('уборка идёт по НАЗВАННОМУ ящику, а не по всему человеку', async () => {
      // ⚠️ Ловушка 35.47a: без имени ящика «отметить всё» в кабинете одного клуба
      // гасило ящики остальных лиц и личный заодно — кнопка делала больше,
      // чем обещала подписью.
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() =>
        useNotificationsFeedActions({ mailbox: { kind: 'club', id: 12 } }),
      );

      await act(async () => {
        await result.current.markAllRead();
      });

      expect(calledUrls(fetchMock)).toEqual(['/api/notifications/read-all?clubId=12']);
      expect(unread()).toBe(0);
    });

    it('личный ящик называется своим именем', async () => {
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() =>
        useNotificationsFeedActions({ mailbox: { scope: 'personal' } }),
      );

      await act(async () => {
        await result.current.markAllRead();
      });

      expect(calledUrls(fetchMock)).toEqual(['/api/notifications/read-all?scope=personal']);
    });

    it('при отказе сервера возвращает все погашенные строки и счётчик', async () => {
      stubFetch(false);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      await act(async () => {
        await result.current.markAllRead();
      });

      expect(unread()).toBe(2);
      expect(rowById(1)?.readAt).toBeUndefined();
      expect(rowById(2)?.readAt).toBeUndefined();
      // Прочитанная до мутации строка прочитанной и осталась: откат возвращает
      // ровно то, что погасил, а не всё подряд.
      expect(rowById(3)?.readAt).toBeDefined();
    });
  });

  describe('удаление', () => {
    it('убирает строки и гасит счётчик на число непрочитанных среди них', async () => {
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      act(() => {
        result.current.requestDelete([1, 3]);
      });
      await act(async () => {
        await result.current.confirmDelete();
      });

      expect(rows().map((n) => n.id)).toEqual([2]);
      expect(unread()).toBe(1);
      expect(calledUrls(fetchMock)).toEqual(['/api/notifications']);
      expect(result.current.confirmIds).toBeNull();
    });

    it('при отказе сервера возвращает удалённые строки на место', async () => {
      stubFetch(false);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      act(() => {
        result.current.requestDelete([1, 3]);
      });
      await act(async () => {
        await result.current.confirmDelete();
      });

      expect(
        rows()
          .map((n) => n.id)
          .sort(),
      ).toEqual([1, 2, 3]);
      expect(unread()).toBe(2);
    });
  });

  describe('открыть строку и пометить прочитанной — разные действия', () => {
    it('по умолчанию открытие помечает: так лента кабинета вела себя всегда', async () => {
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      await act(async () => {
        result.current.activateItem(FEED[0]!);
      });

      expect(calledUrls(fetchMock)).toEqual(['/api/notifications/1/read']);
      expect(unread()).toBe(1);
    });

    it('надзорной ленте помечать запрещено — и запрет не зашит намертво', async () => {
      // ⚠️ Ради этой проверки хук и параметризован. В надзорной ленте клик
      // по строке уводит к предмету: администратор ушёл разбираться, а строка
      // осталась непрочитанной, пока он сам её не погасит. Если «открыть»
      // и «пометить» останутся одним действием, такую ленту не собрать вовсе.
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() => useNotificationsFeedActions({ markReadOnOpen: false }));

      await act(async () => {
        result.current.activateItem(FEED[0]!);
      });

      expect(fetchMock).not.toHaveBeenCalled();
      expect(unread()).toBe(2);
      expect(rowById(1)?.readAt).toBeUndefined();
    });

    it('в режиме выбора открытие не помечает ничего, а ставит галочку', async () => {
      const fetchMock = stubFetch(true);
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      act(() => {
        result.current.toggleSelectionMode();
      });

      let outcome: 'selection' | 'open' | undefined;
      await act(async () => {
        outcome = result.current.activateItem(FEED[0]!);
      });

      expect(outcome).toBe('selection');
      expect(fetchMock).not.toHaveBeenCalled();
      expect(result.current.selectedIds.has(1)).toBe(true);
    });
  });

  describe('режим выбора', () => {
    it('выход из режима очищает выбор — он не утекает в следующий заход', () => {
      const { result } = renderHook(() => useNotificationsFeedActions({}));

      act(() => {
        result.current.toggleSelectionMode();
      });
      act(() => {
        result.current.toggleItemSelection(1);
      });
      expect(result.current.selectedIds.has(1)).toBe(true);

      act(() => {
        result.current.toggleSelectionMode();
      });
      expect(result.current.selectionMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
    });

    it('смена человека сбрасывает выбор — чужие галочки не наследуются', () => {
      const { result, rerender } = renderHook(
        ({ resetKey }: { resetKey: number }) => useNotificationsFeedActions({ resetKey }),
        { initialProps: { resetKey: PERSON_ID } },
      );

      act(() => {
        result.current.toggleSelectionMode();
      });
      act(() => {
        result.current.toggleItemSelection(1);
      });

      rerender({ resetKey: PERSON_ID + 1 });

      expect(result.current.selectionMode).toBe(false);
      expect(result.current.selectedIds.size).toBe(0);
    });
  });
});
