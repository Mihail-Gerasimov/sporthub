/**
 * Phase 24 Step 24.7: NotificationBell — иконка уведомлений в Header'е.
 * Сценарии: скрыт для guest'а, badge с unreadCount, dropdown при клике,
 * ссылка «Все уведомления» ведёт в /profile/{athlete|provider}/notifications.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationBell } from '@/components/layout/NotificationBell';
import {
  AUTH_STORE_DEFAULT_STATE,
  MVP_ATHLETE_USER_ID,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';
import type { Notification } from '@/types';

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
  });

  it('не рендерится в гостевом состоянии', () => {
    mockFetchByRoute();

    const { container } = render(<NotificationBell />);

    expect(container).toBeEmptyDOMElement();
  });

  it('для athlete рендерит кнопку-колокольчик с badge непрочитанных', async () => {
    mockFetchByRoute({ unreadCount: 3 });

    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: MVP_ATHLETE_USER_ID,
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
      accountType: 'athlete',
      user: {
        id: MVP_ATHLETE_USER_ID,
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
          userId: MVP_ATHLETE_USER_ID,
          type: 'booking_confirmed',
          payload: { bookingId: 501 },
        },
        {
          id: 9,
          createdAt: '2026-04-19T12:00:00.000Z',
          userId: MVP_ATHLETE_USER_ID,
          type: 'booking_rejected',
          payload: { bookingId: 502 },
        },
      ],
    });

    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: MVP_ATHLETE_USER_ID,
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

  it('для provider ссылка «Все уведомления» ведёт в кабинет провайдера', async () => {
    mockFetchByRoute({ unreadCount: 0, items: [] });

    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'provider',
      user: {
        id: MVP_PROVIDER_USER_ID,
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
});
