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
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Notification } from '@sporthub/types';

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
    // Phase 27 Step 27.8: компонент теперь делает auth-guard. Настраиваем
    // athlete-сессию, чтобы guard пропустил рендер — все тесты в этом файле
    // используют.
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: 1, name: 'Test Athlete', email: 'test-athlete@sporthub.local' },
      accountKind: 'person',
      isAuthenticated: true,
    });
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

    // ⚠️ Тела у запроса больше НЕТ. Владельца уведомления сервер берёт из сессии,
    // а чужое отвечает тем же «не найдено», что и несуществующее, — по коду
    // ответа чужие номера не переберёшь.
    const [, init] = fetchMock.mock.calls[0];
    expect(init).toEqual({ method: 'POST' });

    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-unread-1')).not.toBeInTheDocument();
    });
  });

  it('пометка прочитанным не называет пользователя ни в адресе, ни в теле', async () => {
    // Прежний тест проверял, что без `userId` запрос не уходит вовсе: поле было
    // обязательным, и без него сервер отвечал отказом. Проверять стало нечего —
    // поля нет. Взамен проверяется то, что действительно важно: личность
    // не уезжает на сервер ни одним из двух способов.
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ success: true }), {
        status: 200,
        headers: { 'content-type': 'application/json' },
      }),
    );

    render(<NotificationsListPage notifications={seed} userId={1} />);

    fireEvent.click(screen.getByTestId('notification-item-1'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [url, init] = fetchMock.mock.calls[0];

    expect(String(url)).not.toContain('userId');
    expect(init.body).toBeUndefined();
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
      expect(fetchMock).toHaveBeenCalledWith('/api/notifications/read-all', { method: 'POST' });
    });

    // ⚠️ До фазы 34 этот маршрут не проверял НИЧЕГО: прислал чужой номер —
    // пометил прочитанными чужие уведомления. Тела у него больше нет.
    expect(fetchMock.mock.calls[0][1].body).toBeUndefined();

    await waitFor(() => {
      expect(screen.queryByTestId('notification-item-unread-1')).not.toBeInTheDocument();
    });
  });
});
