// Строка про СТЁРТЫЙ предмет (шаг 37.55).
//
// ⚠️ Надзорная строка переживает свой предмет ПО ПОСТРОЕНИЮ: событие «публикация
// стёрта» существует именно потому, что публикации больше нет. Это не сбой данных
// и не мусор в ленте — это норма очереди надзора, и интерфейс обязан отвечать
// на неё словами. Молчание здесь означало бы 404 или пустой раздел, в котором
// человек ищет, какой фильтр съел карточку.
//
// Путей к стёртому предмету ДВА, и оба проверяются здесь:
//   1) предмет стёрло само событие — переходить некуда, и это видно ДО клика;
//   2) предмет стёрли позже, уже после события, — адрес из карты остаётся годным,
//      и ответ даёт раздел, в который он ведёт.

import { act, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Стенд адреса: раздел модерации читает отбор из строки запроса. */
const { address } = vi.hoisted(() => {
  const listeners = new Set<() => void>();
  const state = {
    query: '',
    open(query: string) {
      state.query = query;
      listeners.forEach((notify) => notify());
    },
    subscribe(listener: () => void) {
      listeners.add(listener);

      return () => listeners.delete(listener);
    },
  };

  return { address: state };
});

vi.mock('next/navigation', async () => {
  const { useSyncExternalStore } = await import('react');

  return {
    usePathname: () => '/service-portal/moderation',
    useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
    useSearchParams: () =>
      new URLSearchParams(
        useSyncExternalStore(
          address.subscribe,
          () => address.query,
          () => address.query,
        ),
      ),
  };
});

import { AdminNotificationsPage } from '@/components/admin/AdminNotificationsPage';
import { ModerationPage } from '@/components/admin/ModerationPage';
import { PANEL_PLACE, subjectHref } from '@/lib/notification-links';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useNotificationsStore } from '@/stores/useNotificationsStore';
import type { Notification } from '@sporthub/types';

/** Публикация №42 стёрта — этим самым событием. */
const DELETED_PUBLICATION: Notification = {
  id: 201,
  createdAt: '2026-09-11T10:00:00.000Z',
  addresseeKind: 'supervision',
  type: 'oversight_publication_deleted',
  payload: { subjectType: 'club', subjectId: 42, entityName: 'Volna Aquatic Club' },
};

/** Запись стёрта необратимо — второй вид того же случая. */
const DELETED_BOOKING: Notification = {
  id: 202,
  createdAt: '2026-09-11T09:00:00.000Z',
  addresseeKind: 'supervision',
  type: 'oversight_booking_hard_deleted',
  payload: { subjectType: 'booking', subjectId: 501 },
};

const FEED = [DELETED_PUBLICATION, DELETED_BOOKING];

function feedPage() {
  return { items: FEED, total: FEED.length, unreadCount: FEED.length };
}

async function flush(): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('Очередь надзора: предмета уже нет', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
      accountKind: 'admin',
      isAdmin: true,
      isAuthenticated: true,
    });
    useNotificationsStore.getState().reset();

    vi.stubGlobal('fetch', async () =>
      Promise.resolve(
        new Response(JSON.stringify({ success: true, data: feedPage() }), {
          status: 200,
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('строка остаётся читаемой целиком — это не пустой экран', async () => {
    render(<AdminNotificationsPage initialFeed={feedPage()} />);
    await flush();

    // Событие, текст, состояние и кнопка разбора — всё на месте. Строка про
    // стёртое не вырождается в заглушку: разобрать её всё равно надо.
    expect(screen.getByTestId('supervision-item-201')).toBeInTheDocument();
    expect(screen.getByTestId('supervision-item-unresolved-201')).toBeInTheDocument();
    expect(screen.getByTestId('supervision-resolve-201')).toBeInTheDocument();
  });

  it('ссылки в никуда у такой строки НЕТ, а причина названа словами', async () => {
    render(<AdminNotificationsPage initialFeed={feedPage()} />);
    await flush();

    expect(screen.queryByTestId('supervision-open-201')).not.toBeInTheDocument();
    expect(screen.getByTestId('supervision-gone-201')).toHaveTextContent(/стёрт/i);

    // Второй вид того же случая — запись, стёртая администратором.
    expect(screen.queryByTestId('supervision-open-202')).not.toBeInTheDocument();
    expect(screen.getByTestId('supervision-gone-202')).toHaveTextContent(/стёрт/i);
  });

  it('переход к предмету, стёртому ПОЗЖЕ события, получает понятный ответ', async () => {
    // ⚠️ Второй путь. Строку «публикация скрыта» никто не отменял, а публикацию
    // с тех пор могли стереть. Адрес из карты остаётся годным — отвечает раздел,
    // в который он ведёт: ни 404, ни пустого экрана, ни молчания.
    vi.useRealTimers();

    const href = subjectHref({ subjectType: 'club', subjectId: 42 }, PANEL_PLACE);

    expect(href).not.toBeNull();

    // В раздел уходит ровно то, что построила карта: адрес и раздел обязаны
    // понимать друг друга без переводчика посередине.
    address.open(String(href).split('?')[1] ?? '');

    vi.stubGlobal(
      'fetch',
      vi.fn(async () =>
        Promise.resolve(
          new Response(
            JSON.stringify({ success: true, data: [], total: 0, offset: 0, limit: 15 }),
            {
              status: 200,
              headers: { 'content-type': 'application/json' },
            },
          ),
        ),
      ),
    );

    render(<ModerationPage sports={[{ id: 3, name: 'Плавание' }]} />);

    await waitFor(() =>
      expect(screen.getByText(/публикация №42 в выдаче не видна/i)).toBeInTheDocument(),
    );

    // И раздел при этом остаётся разделом: заголовок на месте, экран не пустой.
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
