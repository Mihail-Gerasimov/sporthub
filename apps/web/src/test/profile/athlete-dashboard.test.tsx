// Тесты AthleteDashboard (Step 25.3): ближайшая, pending-countdown, шапка без истории,
// KPI. Read-only компонент, toast не нужен.
//
// ⚠️ Фаза 38, шаг 38.25: два случая про секцию «Мой рейтинг надёжности» сняты —
// предмета нет (реестр `phase-38-reliability-cut.md`, Т12). Их место заняли:
// «секции надёжности нет ни при какой истории» и «шапка зовёт сделать первую запись
// ровно пока завершённых ноль» — прежний порог в пять занятий ушёл вместе с бейджем.
import { render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { AthleteDashboard } from '@/components/profile/athlete/AthleteDashboard';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Schedule, User } from '@sporthub/types';

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей Миронов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const NOW = new Date('2026-04-22T12:00:00.000Z');

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'scheduleId'>): Booking {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    userId: 1,
    sportId: 3,
    date: '2026-04-25',
    status: 'confirmed',
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
    date: '2026-04-25',
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

describe('AthleteDashboard (Step 25.3)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('empty state: у нового атлета без bookings — нейтральная шапка «Сделайте первую запись»', () => {
    authenticateAthlete();

    render(<AthleteDashboard bookings={[]} />);

    expect(screen.getByText(/Сделайте первую запись/i)).toBeInTheDocument();
    expect(screen.queryByTestId('athlete-dashboard-pending')).not.toBeInTheDocument();
  });

  it('pending countdown: pending-booking через 5h → блок pending виден с обратным отсчётом до auto-cancel', () => {
    authenticateAthlete();

    // Слот стартует через 5 часов от NOW; auto-cancel — за 1h до слота, т.е. через 4h.
    const booking = makeBooking({
      id: 1,
      scheduleId: 10,
      status: 'pending',
      date: '2026-04-22',
    });
    const slot = makeSchedule({
      id: 10,
      date: '2026-04-22',
      startTime: '17:00',
      endTime: '18:00',
    });

    render(<AthleteDashboard bookings={[booking]} schedule={[slot]} />);

    const pendingSection = screen.getByTestId('athlete-dashboard-pending');
    expect(pendingSection).toBeInTheDocument();
    expect(within(pendingSection).getByText(/до авто-?отмен/i)).toBeInTheDocument();
  });

  it('секции надёжности нет ни у новичка, ни у человека с десятью занятиями', () => {
    authenticateAthlete();

    const bookings: Booking[] = Array.from({ length: 10 }, (_, index) =>
      makeBooking({
        id: index + 1,
        scheduleId: 100 + index,
        status: 'completed',
        date: `2026-03-${String(10 + index).padStart(2, '0')}`,
      }),
    );

    const { unmount } = render(<AthleteDashboard bookings={bookings} />);

    expect(screen.queryByTestId('athlete-dashboard-reliability')).not.toBeInTheDocument();
    expect(screen.queryByText(/надёжност/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Рейтинг покажется после/i)).not.toBeInTheDocument();

    unmount();
    render(<AthleteDashboard bookings={[]} />);

    expect(screen.queryByTestId('athlete-dashboard-reliability')).not.toBeInTheDocument();
    expect(screen.queryByText(/надёжност/i)).not.toBeInTheDocument();
  });

  it('шапка зовёт сделать первую запись, пока завершённых ноль, и одно занятие это меняет', () => {
    authenticateAthlete();

    // Прежде порог был в пять занятий — это был порог бейджа надёжности. Теперь
    // граница одна: есть хоть одно завершённое занятие или нет.
    const { unmount } = render(
      <AthleteDashboard
        bookings={[
          makeBooking({ id: 1, scheduleId: 301, status: 'confirmed', date: '2026-04-30' }),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Сделайте первую запись' })).toBeInTheDocument();

    unmount();
    render(
      <AthleteDashboard
        bookings={[
          makeBooking({ id: 2, scheduleId: 302, status: 'completed', date: '2026-03-10' }),
        ]}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Обзор' })).toBeInTheDocument();
    expect(screen.queryByText(/Сделайте первую запись/)).not.toBeInTheDocument();
  });

  // Сторож этапа Э0a: три неявки подряд больше не поднимают верхний красный баннер
  // «Вы временно не можете создавать новые записи» — санкций за неявки нет.
  it('три неявки за 30 дней не поднимают баннер запрета', () => {
    authenticateAthlete();

    // 3 no_show в апреле (в окне 30 дней до NOW = 2026-04-22).
    const noShows: Booking[] = [
      makeBooking({ id: 1, scheduleId: 301, status: 'no_show', date: '2026-04-10' }),
      makeBooking({ id: 2, scheduleId: 302, status: 'no_show', date: '2026-04-15' }),
      makeBooking({ id: 3, scheduleId: 303, status: 'no_show', date: '2026-04-20' }),
    ];

    render(<AthleteDashboard bookings={noShows} />);

    expect(screen.queryByText(/временно не можете создавать новые записи/i)).toBeNull();
    // Кабинет при этом рабочий: KPI на месте.
    expect(screen.getByTestId('athlete-dashboard-kpi')).toBeInTheDocument();
  });

  it('KPI: 7 completed + 2 active future → блок KPI с completed=7 и upcoming=2', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      ...Array.from({ length: 7 }, (_, index) =>
        makeBooking({
          id: index + 1,
          scheduleId: 400 + index,
          status: 'completed',
          date: '2026-03-10',
        }),
      ),
      makeBooking({ id: 100, scheduleId: 500, status: 'confirmed', date: '2026-04-30' }),
      makeBooking({ id: 101, scheduleId: 501, status: 'pending', date: '2026-04-30' }),
    ];

    render(<AthleteDashboard bookings={bookings} />);

    const kpi = screen.getByTestId('athlete-dashboard-kpi');
    expect(within(kpi).getByTestId('athlete-dashboard-kpi-completed')).toHaveTextContent('7');
    expect(within(kpi).getByTestId('athlete-dashboard-kpi-upcoming')).toHaveTextContent('2');
  });
});
