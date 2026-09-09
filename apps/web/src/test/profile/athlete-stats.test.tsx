// Тесты AthleteStats (Step 25.5): 2 секции — Достижения + Метрики, стрики,
// FSM-разбивка, reliability, toggle окна (12 мес ↔ всё время), empty state.
// Recharts в jsdom не рендерит SVG (нулевые размеры ResponsiveContainer) —
// проверяем заголовки, числа и data-testid'ы, не сам canvas.
import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { AthleteStats } from '@/components/profile/athlete/AthleteStats';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Review, Schedule, Sport, Trainer, User } from '@sporthub/types';

const NOW = new Date('2026-04-22T12:00:00.000Z');

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей Миронов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'date'>): Booking {
  return {
    createdAt: '2026-03-01T00:00:00.000Z',
    scheduleId: 100,
    userId: 1,
    sportId: 3,
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

function makeSchedule(overrides: Partial<Schedule> & Pick<Schedule, 'id'>): Schedule {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    clubId: 1,
    sportId: 3,
    title: 'Утреннее плавание',
    date: '2026-04-22',
    startTime: '07:30',
    endTime: '08:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 12,
    bookedCount: 1,
    price: 900,
    ...overrides,
  };
}

function authenticateAthlete() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: athleteUser,
    accountKind: 'person',
    isAuthenticated: true,
  });
}

const sports: Sport[] = [{ id: 3, createdAt: '', name: 'Плавание', slug: 'swim' }];
const clubs: Club[] = [];
const trainers: Trainer[] = [];
const reviews: Review[] = [];

beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('AthleteStats (Step 25.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('empty state: новый атлет без bookings — показана секция достижений и плашка «нет данных» в метриках', () => {
    authenticateAthlete();

    render(
      <AthleteStats
        bookings={[]}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
        reviews={reviews}
      />,
    );

    // Секция достижений показана всегда (система ачивок работает и у нового юзера).
    expect(screen.getByTestId('athlete-stats-achievements')).toBeInTheDocument();
    // В метриках — empty-плашка.
    expect(screen.getByTestId('athlete-stats-empty')).toBeInTheDocument();
  });

  it('рендерит обе секции (Достижения + Метрики) при наличии completed-истории', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({ id: 1, date: '2026-04-22' }),
      makeBooking({ id: 2, date: '2026-04-15' }),
      makeBooking({ id: 3, date: '2026-04-08' }),
    ];

    render(
      <AthleteStats
        bookings={bookings}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
        reviews={reviews}
      />,
    );

    expect(screen.getByTestId('athlete-stats-achievements')).toBeInTheDocument();
    expect(screen.getByTestId('athlete-stats-metrics')).toBeInTheDocument();
    expect(screen.queryByTestId('athlete-stats-empty')).not.toBeInTheDocument();
  });

  it('стрики: при 3 подряд неделях с completed — current=3 и max=3', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({ id: 1, date: '2026-04-22' }),
      makeBooking({ id: 2, date: '2026-04-15' }),
      makeBooking({ id: 3, date: '2026-04-08' }),
    ];

    render(
      <AthleteStats
        bookings={bookings}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
        reviews={reviews}
      />,
    );

    expect(screen.getByTestId('athlete-stats-streak-current')).toHaveTextContent('3');
    expect(screen.getByTestId('athlete-stats-streak-max')).toHaveTextContent('3');
  });

  it('FSM-разбивка: показывает числа completed / no_show / cancelled', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({ id: 1, date: '2026-04-22', status: 'completed' }),
      makeBooking({ id: 2, date: '2026-04-15', status: 'completed' }),
      makeBooking({ id: 3, date: '2026-04-08', status: 'no_show' }),
      makeBooking({
        id: 4,
        date: '2026-04-01',
        status: 'cancelled_by_athlete',
        cancelReason: 'late',
      }),
    ];

    render(
      <AthleteStats
        bookings={bookings}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
        reviews={reviews}
      />,
    );

    const breakdown = screen.getByTestId('athlete-stats-fsm-breakdown');

    expect(breakdown).toHaveTextContent(/Завершённые/i);
    expect(breakdown).toHaveTextContent(/Неявки/i);
    expect(breakdown).toHaveTextContent(/Отменённые/i);
  });

  it('reliability: при completed >= 5 показана секция с деталями completionRate/no_show/late_cancel', () => {
    authenticateAthlete();

    const bookings: Booking[] = Array.from({ length: 5 }, (_, i) =>
      makeBooking({ id: i + 1, date: `2026-04-${String(14 + i).padStart(2, '0')}` }),
    );

    render(
      <AthleteStats
        bookings={bookings}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
        reviews={reviews}
      />,
    );

    const reliability = screen.getByTestId('athlete-stats-reliability');

    expect(reliability).toHaveTextContent(/Completion rate/i);
    expect(reliability).toHaveTextContent(/100%/);
    expect(reliability).toHaveTextContent(/No-?show/i);
  });

  it('toggle окна: клик по «Всё время» меняет активный период', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({ id: 1, date: '2026-04-22' }),
      // Старая запись — попадает только в окно «всё время».
      makeBooking({ id: 2, date: '2024-01-15' }),
    ];

    const schedule: Schedule[] = [
      makeSchedule({ id: 100, date: '2026-04-22' }),
      makeSchedule({ id: 101, date: '2024-01-15', durationMinutes: 90 }),
    ];

    render(
      <AthleteStats
        bookings={bookings}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
        reviews={reviews}
        schedule={schedule}
      />,
    );

    const toggle12 = screen.getByRole('button', { name: /12 мес/i });
    const toggleAll = screen.getByRole('button', { name: /всё время/i });

    expect(toggle12).toHaveAttribute('aria-pressed', 'true');
    expect(toggleAll).toHaveAttribute('aria-pressed', 'false');

    fireEvent.click(toggleAll);

    expect(toggle12).toHaveAttribute('aria-pressed', 'false');
    expect(toggleAll).toHaveAttribute('aria-pressed', 'true');
  });
});
