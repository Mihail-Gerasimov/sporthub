/**
 * Тесты страницы логов в админ-панели.
 * Phase 20 — Step 20.4: рендер, пустое состояние, skeleton, навигация.
 * Phase 25 Step 25.15: drawer-wire-up для booking-логов.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast } from '@/test/helpers/render-with-toast';

import { AdminNavigation } from '@/components/admin/AdminNavigation';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

// Мок usePathname для AdminNavigation
vi.mock('next/navigation', () => ({
  usePathname: () => '/service-portal/logs',
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

describe('AdminNavigation — пункт «Логи»', () => {
  it('содержит пункт «Логи» в навигации', () => {
    render(<AdminNavigation />);

    const logsLink = screen.getByRole('link', { name: 'Логи' });
    expect(logsLink).toBeInTheDocument();
    expect(logsLink).toHaveAttribute('href', '/service-portal/logs');
  });

  it('«Логи» расположен между «Модерация» и «Финансы»', () => {
    render(<AdminNavigation />);

    const links = screen.getAllByRole('link');
    const labels = links.map((l) => l.textContent);

    const moderationIndex = labels.indexOf('Модерация');
    const logsIndex = labels.indexOf('Логи');
    const financeIndex = labels.indexOf('Финансы');

    expect(logsIndex).toBe(moderationIndex + 1);
    expect(financeIndex).toBe(logsIndex + 1);
  });
});

describe('LogsPage — рендер', () => {
  beforeEach(() => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ success: true, data: [], total: 0, offset: 0, limit: 50 }),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('рендерится без ошибок и показывает пустое состояние', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    render(<LogsPage />);

    // Ждём завершения загрузки — появится пустое состояние
    const emptyMessage = await screen.findByText('Нет событий по выбранным фильтрам');
    expect(emptyMessage).toBeInTheDocument();
  });

  it('отображает заголовок фильтров', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    render(<LogsPage />);

    // Кнопка «Обновить» всегда видна
    const refreshButton = await screen.findByRole('button', { name: /обновить/i });
    expect(refreshButton).toBeInTheDocument();
  });
});

describe('LogsPage — Step 25.15: drawer-wire-up для booking-логов', () => {
  const BOOKING_LOG = {
    id: 101,
    action: 'booking_confirm',
    actorId: 3,
    actorRole: 'admin',
    entityType: 'booking',
    entityId: 42,
    createdAt: '2026-04-22T10:00:00.000Z',
  };

  const PUBLISH_LOG = {
    id: 102,
    action: 'publish_create',
    actorId: 2,
    actorRole: 'club_owner',
    entityType: 'club',
    entityId: 5,
    createdAt: '2026-04-22T11:00:00.000Z',
  };

  const BOOKING_DATA = {
    id: 42,
    scheduleId: 1,
    userId: 1,
    sportId: 3,
    date: '2026-04-20',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    createdAt: '2026-04-15T09:00:00.000Z',
    statusHistory: [
      { from: null, to: 'pending', actor: 'athlete', at: '2026-04-15T09:00:00.000Z' },
      { from: 'pending', to: 'confirmed', actor: 'provider', at: '2026-04-18T10:00:00.000Z' },
    ],
  };

  beforeEach(() => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: {
        id: 3,
        createdAt: '',
        role: 'admin',
        name: 'Admin',
        email: 'a@a.com',
        phone: '+7',
        passwordHash: 's',
        favoriteClubIds: [],
      },
      accountType: 'provider',
      isAuthenticated: true,
      isAdmin: true,
    });

    global.fetch = vi.fn().mockImplementation((url: string) => {
      if (url.startsWith('/api/logs')) {
        return Promise.resolve({
          ok: true,
          json: () =>
            Promise.resolve({
              success: true,
              data: [BOOKING_LOG, PUBLISH_LOG],
              total: 2,
              offset: 0,
              limit: 50,
            }),
        });
      }
      if (url.startsWith('/api/bookings/42')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ success: true, data: BOOKING_DATA }),
        });
      }
      return Promise.resolve({ ok: false, json: () => Promise.resolve({}) });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('кнопка «История FSM» видна для booking-лога и отсутствует для club-лога', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    renderWithToast(<LogsPage />);

    const button = await screen.findByTestId('logs-open-booking-history-42');
    expect(button).toBeInTheDocument();
    expect(screen.queryByTestId('logs-open-booking-history-5')).not.toBeInTheDocument();
  });

  it('клик по «История FSM» шлёт GET /api/bookings/42?userId=3 и открывает drawer', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    renderWithToast(<LogsPage />);

    const button = await screen.findByTestId('logs-open-booking-history-42');
    fireEvent.click(button);

    await waitFor(() => {
      const calls = (global.fetch as unknown as { mock: { calls: Array<[string]> } }).mock.calls;
      expect(calls.some((c) => c[0] === '/api/bookings/42?userId=3')).toBe(true);
    });

    // Drawer рендерит заголовок «История статусов»
    await screen.findByText(/История статусов/i);
  });

  it('закрытие drawer убирает его из DOM', async () => {
    const { LogsPage } = await import('@/components/admin/LogsPage');
    renderWithToast(<LogsPage />);

    const button = await screen.findByTestId('logs-open-booking-history-42');
    fireEvent.click(button);

    const closeButton = await screen.findByRole('button', { name: /закрыть/i });
    fireEvent.click(closeButton);

    await waitFor(() => {
      expect(screen.queryByText(/История статусов/i)).not.toBeInTheDocument();
    });
  });
});
