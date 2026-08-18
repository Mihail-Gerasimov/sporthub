// Phase 24 Step 24.15: тесты новых колонок DashboardPage — «Надёжность» + «Карантин»
// и row-actions «Снять карантин», «Пересчитать рейтинг». Проверяют вычисление на лету
// через computeAthleteReliability/isAthleteInQuarantine и запросы к новым admin endpoint'ам.
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DashboardPage } from '@/components/admin/DashboardPage';
import { AUTH_STORE_DEFAULT_STATE, MVP_ADMIN_USER_ID, useAuthStore } from '@/stores/useAuthStore';
import { renderWithToast } from '@/test/helpers/render-with-toast';
import type { Booking, Club, Trainer, User } from '@sporthub/types';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

const fetchMock = vi.fn();

const fixtureAthlete: User = {
  id: 1,
  createdAt: '2026-03-17T09:00:00.000Z',
  role: 'athlete',
  status: 'active',
  name: 'Тестовый атлет',
  email: 'athlete@sporthub.local',
  phone: '',
  password: 'x',
  favoriteClubIds: [],
};

const fixtureProvider: User = {
  id: 2,
  createdAt: '2026-03-17T09:00:00.000Z',
  role: 'club_owner',
  status: 'active',
  name: 'Марина Крылова',
  email: 'provider@sporthub.local',
  phone: '',
  password: 'x',
  favoriteClubIds: [],
};

const baseClubs: Club[] = [];
const baseTrainers: Trainer[] = [];

function makeBooking(overrides: Partial<Booking>): Booking {
  return {
    id: 1,
    createdAt: '2026-03-10T00:00:00.000Z',
    scheduleId: 1,
    offeringId: 1,
    ownerType: 'club',
    ownerId: 1,
    userId: 1,
    sportId: 1,
    date: '2026-03-15',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

function renderDashboard(props: { users: User[]; bookings?: Booking[] }) {
  return renderWithToast(
    <DashboardPage
      users={props.users}
      clubs={baseClubs}
      trainers={baseTrainers}
      bookings={props.bookings ?? []}
    />,
  );
}

describe('DashboardPage — Step 24.15 reliability + quarantine columns', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { id: MVP_ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
      isAuthenticated: true,
      isAdmin: true,
    });

    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ success: true }), { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
  });

  it('показывает «Новый» для атлета с < 5 completed', () => {
    const bookings = [makeBooking({ id: 10, status: 'completed', date: '2026-03-15', userId: 1 })];
    renderDashboard({ users: [fixtureAthlete], bookings });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    expect(within(card).getByText(/новый/i)).toBeInTheDocument();
  });

  it('показывает плашку «Карантин до ...» для атлета с 3+ no_show подряд', () => {
    const bookings = [
      makeBooking({ id: 20, status: 'no_show', date: '2026-04-10', userId: 1 }),
      makeBooking({ id: 21, status: 'no_show', date: '2026-04-15', userId: 1 }),
      makeBooking({ id: 22, status: 'no_show', date: '2026-04-19', userId: 1 }),
    ];
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'));

    renderDashboard({ users: [fixtureAthlete], bookings });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    expect(within(card).getByText(/карантин до/i)).toBeInTheDocument();

    vi.useRealTimers();
  });

  it('клик «Снять карантин» → POST /api/admin/users/1/lift-quarantine', async () => {
    const bookings = [
      makeBooking({ id: 20, status: 'no_show', date: '2026-04-10', userId: 1 }),
      makeBooking({ id: 21, status: 'no_show', date: '2026-04-15', userId: 1 }),
      makeBooking({ id: 22, status: 'no_show', date: '2026-04-19', userId: 1 }),
    ];
    vi.setSystemTime(new Date('2026-04-21T00:00:00.000Z'));

    renderDashboard({ users: [fixtureAthlete], bookings });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    const liftBtn = within(card).getByRole('button', { name: /снять карантин/i });
    fireEvent.click(liftBtn);

    await waitFor(() => {
      const liftCall = fetchMock.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' && args[0].includes('/api/admin/users/1/lift-quarantine'),
      );
      expect(liftCall).toBeDefined();
      expect((liftCall![1] as RequestInit).method).toBe('POST');
    });

    vi.useRealTimers();
  });

  it('клик «Пересчитать рейтинг» → POST /api/admin/users/1/recompute-reliability', async () => {
    renderDashboard({ users: [fixtureAthlete], bookings: [] });

    const card = screen.getByText('Тестовый атлет').closest('article')!;
    const recomputeBtn = within(card).getByRole('button', { name: /пересчитать/i });
    fireEvent.click(recomputeBtn);

    await waitFor(() => {
      const call = fetchMock.mock.calls.find(
        (args) =>
          typeof args[0] === 'string' &&
          args[0].includes('/api/admin/users/1/recompute-reliability'),
      );
      expect(call).toBeDefined();
    });
  });

  it('для provider: нет кнопок «Снять карантин» / «Пересчитать рейтинг»', () => {
    renderDashboard({ users: [fixtureProvider], bookings: [] });

    const card = screen.getByText('Марина Крылова').closest('article')!;
    expect(within(card).queryByRole('button', { name: /снять карантин/i })).toBeNull();
    expect(within(card).queryByRole('button', { name: /пересчитать/i })).toBeNull();
  });
});
