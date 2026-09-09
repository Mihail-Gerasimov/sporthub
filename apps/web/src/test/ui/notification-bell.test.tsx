/**
 * Phase 24 Step 24.7: NotificationBell — иконка уведомлений в Header'е.
 * Сценарии: скрыт для guest'а, badge с unreadCount, dropdown при клике,
 * ссылка «Все уведомления» ведёт в /profile/{athlete|provider}/notifications.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Phase 27 Step 27.6: мок router.push наружу через hoisted — проверяем навигацию
// после клика по уведомлению в dropdown'е.
const { routerPushMock } = vi.hoisted(() => ({ routerPushMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: routerPushMock, replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationBell } from '@/components/layout/NotificationBell';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

// Номера пользователей стенда: раньше приезжали константами из стора.
const ATHLETE_USER_ID = 1;
const PROVIDER_USER_ID = 2;
import type { Notification } from '@sporthub/types';

interface FetchRoutes {
  unreadCount?: number;
  items?: Notification[];
}

function mockFetchByRoute(routes: FetchRoutes = {}): ReturnType<typeof vi.fn> {
  const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
    const url = typeof input === 'string' ? input : input.toString();
    if (url.includes('/api/notifications/unread-count')) {
      return jsonResponse({
        success: true,
        data: { unreadCount: routes.unreadCount ?? 0 },
      });
    }
    if (url.includes('/api/notifications')) {
      const items = routes.items ?? [];
      return jsonResponse({
        success: true,
        data: { unreadCount: routes.unreadCount ?? 0, total: items.length, items },
      });
    }
    return jsonResponse({ success: false, error: 'route not mocked' }, 500);
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function jsonResponse(body: unknown, status = 200): Promise<Response> {
  return Promise.resolve(
    new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    }),
  );
}

async function flush() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

describe('NotificationBell', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    routerPushMock.mockReset();
  });

  it('не рендерится в гостевом состоянии', () => {
    mockFetchByRoute();

    const { container } = render(<NotificationBell />);

    expect(container).toBeEmptyDOMElement();
  });

  it('у служебной записи колокольчика нет: уведомляться ей не о чем', () => {
    // ⚠️ Ловушка 7.11. Условие показа было «есть тип учётной записи», и с уходом
    // типа колокольчик исчез бы у ВСЕХ молча. Отказ теперь ровно один — админ.
    mockFetchByRoute();

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'admin',
      faces: [],
      activeFaceKey: null,
      user: { id: 9, name: 'Администратор', email: 'admin@sporthub.local' },
    });

    const { container } = render(<NotificationBell />);

    expect(container).toBeEmptyDOMElement();
  });

  it('у человека без лиц услуг колокольчик на месте (ловушка 7.11)', async () => {
    mockFetchByRoute({ unreadCount: 3 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    expect(screen.getByRole('button', { name: /уведомления/i })).toBeInTheDocument();
    expect(screen.getByTestId('notification-bell-badge')).toHaveTextContent('3');
  });

  it('скрывает badge, если unreadCount = 0', async () => {
    mockFetchByRoute({ unreadCount: 0 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    expect(screen.queryByTestId('notification-bell-badge')).not.toBeInTheDocument();
  });

  it('по клику открывает dropdown с последними уведомлениями и ссылкой «Все уведомления» в кабинет атлета', async () => {
    mockFetchByRoute({
      unreadCount: 2,
      items: [
        {
          id: 10,
          createdAt: '2026-04-20T12:00:00.000Z',
          userId: ATHLETE_USER_ID,
          type: 'booking_confirmed',
          payload: { bookingId: 501 },
        },
        {
          id: 9,
          createdAt: '2026-04-19T12:00:00.000Z',
          userId: ATHLETE_USER_ID,
          type: 'booking_rejected',
          payload: { bookingId: 502 },
        },
      ],
    });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    expect(screen.getByTestId('notification-bell-dropdown')).toBeInTheDocument();
    expect(screen.getByText(/бронирование подтверждено/i)).toBeInTheDocument();
    expect(screen.getByText(/бронирование отклонено/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Все уведомления' })).toHaveAttribute(
      'href',
      '/profile/athlete/notifications',
    );
  });

  it('у человека с лицом услуг ссылка «Все уведомления» ведёт в кабинет лица', async () => {
    mockFetchByRoute({ unreadCount: 0, items: [] });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      user: {
        id: PROVIDER_USER_ID,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(<NotificationBell />);

    await flush();

    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));

    await flush();

    expect(screen.getByRole('link', { name: 'Все уведомления' })).toHaveAttribute(
      'href',
      '/profile/provider/notifications',
    );
    expect(screen.getByText(/нет новых уведомлений/i)).toBeInTheDocument();
  });

  // Phase 27 Step 27.6: клик по уведомлению в dropdown помечает прочитанным через
  // POST /api/notifications/[id]/read и переводит на полную страницу уведомлений.
  it('клик по непрочитанному уведомлению в dropdown шлёт POST /read и делает router.push', async () => {
    const fetchMock = mockFetchByRoute({
      unreadCount: 1,
      items: [
        {
          id: 42,
          createdAt: '2026-04-22T12:00:00.000Z',
          userId: ATHLETE_USER_ID,
          type: 'booking_confirmed',
          payload: { bookingId: 777 },
        },
      ],
    });

    useAuthStore.setState({
      isAuthenticated: true,
      accountKind: 'person',
      faces: [],
      activeFaceKey: null,
      user: {
        id: ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<NotificationBell />);

    await flush();
    fireEvent.click(screen.getByRole('button', { name: /уведомления/i }));
    await flush();

    fireEvent.click(screen.getByTestId('notification-bell-item-42'));
    await flush();

    // POST без тела: владельца уведомления сервер берёт из сессии, а чужое
    // отвечает тем же «не найдено», что и несуществующее.
    const readCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/notifications/42/read'),
    );
    expect(readCall).toBeDefined();
    expect(readCall?.[1]).toEqual({ method: 'POST' });

    // И лента dropdown'а спрашивается без номера в адресе.
    const listCall = fetchMock.mock.calls.find(([url]) =>
      String(url).startsWith('/api/notifications?'),
    );
    expect(String(listCall?.[0])).not.toContain('userId');

    // Навигация на полную страницу уведомлений.
    expect(routerPushMock).toHaveBeenCalledWith('/profile/athlete/notifications');

    // Dropdown закрылся.
    expect(screen.queryByTestId('notification-bell-dropdown')).not.toBeInTheDocument();
  });
});
