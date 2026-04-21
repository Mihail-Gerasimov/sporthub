/**
 * Phase 24 Step 24.7: NotificationsListPage — плоский список уведомлений на
 * /profile/athlete/notifications и /profile/provider/notifications.
 * Проверяет: рендер, mark-as-read по клику, mark-all-read, пустое состояние.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: () => '/profile/athlete/notifications',
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { NotificationsListPage } from '@/components/profile/notifications/NotificationsListPage';
import type { Notification } from '@/types';

const seed: Notification[] = [
  {
    id: 1,
    createdAt: '2026-04-20T12:00:00.000Z',
    userId: 1,
    type: 'booking_confirmed',
    payload: { bookingId: 501 },
  },
  {
    id: 2,
    createdAt: '2026-04-19T08:00:00.000Z',
    userId: 1,
    type: 'booking_rejected',
    payload: { bookingId: 502, reason: 'Слот отменён' },
    readAt: '2026-04-19T09:00:00.000Z',
  },
];

describe('NotificationsListPage', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  it('рендерит плоский список уведомлений с заголовками и описаниями', () => {
    render(<NotificationsListPage notifications={seed} userId={1} />);

    expect(screen.getByText('Бронирование подтверждено')).toBeInTheDocument();
    expect(screen.getByText('Бронирование отклонено')).toBeInTheDocument();
    expect(screen.getByText('Причина: Слот отменён')).toBeInTheDocument();
  });

  it('для пустого списка показывает «Пока нет уведомлений»', () => {
    render(<NotificationsListPage notifications={[]} userId={1} />);

    expect(screen.getByText(/пока нет уведомлений/i)).toBeInTheDocument();
  });

  it('клик по непрочитанному уведомлению шлёт POST read и убирает индикатор', async () => {
    fetchMock.mockResolvedValue(
      new Response(
        JSON.stringify({ success: true, data: { ...seed[0], readAt: '2026-04-21T00:00:00.000Z' } }),
        {
          status: 200,
          headers: { 'content-type': 'application/json' },
        },
      ),
    );

    render(<NotificationsListPage notifications={seed} userId={1} />);

    expect(screen.getByTestId('notification-item-unread-1')).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('notification-item-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications/1/read',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-unread-1')).not.toBeInTheDocument();
    });
  });

  it('«Отметить всё как прочитанное» шлёт POST read-all и сбрасывает индикаторы', async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true, data: { updatedCount: 1 } }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<NotificationsListPage notifications={seed} userId={1} />);

    expect(screen.getByTestId('notification-item-unread-1')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: /отметить всё/i }));
    });

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/notifications/read-all',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-unread-1')).not.toBeInTheDocument();
    });
  });
});
