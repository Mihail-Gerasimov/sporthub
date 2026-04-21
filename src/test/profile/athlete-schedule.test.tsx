// Тесты AthleteSchedule (Step 25.4): единый список bookings с фильтрами,
// группировкой по неделям, drawer с таймлайном + late-cancel warning.
import { fireEvent, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { AthleteSchedule } from '@/components/profile/athlete/AthleteSchedule';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Schedule, Sport, Trainer, User } from '@/types';

const NOW = new Date('2026-04-22T12:00:00.000Z');

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  name: 'Алексей Миронов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  password: 'secret',
  favoriteClubIds: [],
};

const sports: Sport[] = [
  { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Йога', slug: 'yoga' },
  { id: 3, createdAt: '2026-01-01T00:00:00.000Z', name: 'Плавание', slug: 'swimming' },
];

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna',
    description: '',
    shortDescription: '',
    city: 'Самара',
    address: '',
    phone: '',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [3],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.8,
    reviewCount: 10,
    priceFrom: 900,
    distanceKm: 1.8,
    isFeatured: true,
  },
];

const trainers: Trainer[] = [];

function makeSlot(overrides: Partial<Schedule> & Pick<Schedule, 'id'>): Schedule {
  return {
    createdAt: '2026-04-01T09:00:00.000Z',
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

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'scheduleId'>): Booking {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    sportId: 3,
    date: '2026-04-25',
    status: 'confirmed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    statusHistory: [
      { from: null, to: 'pending', actor: 'athlete', at: '2026-04-20T09:00:00.000Z' },
    ],
    ...overrides,
  };
}

function authenticateAthlete() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: athleteUser,
    accountType: 'athlete',
    isAuthenticated: true,
  });
}

describe('AthleteSchedule (Step 25.4)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('empty: у атлета нет bookings — плашка «У вас нет записей»', () => {
    authenticateAthlete();

    render(
      <AthleteSchedule
        bookings={[]}
        schedule={[]}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
      />,
    );

    expect(screen.getByText(/У вас нет записей/i)).toBeInTheDocument();
  });

  it('фильтр «Отменённые»: оставляет только cancelled_by_* и rejected_by_provider', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({ id: 1, scheduleId: 10, status: 'confirmed', date: '2026-04-25' }),
      makeBooking({
        id: 2,
        scheduleId: 11,
        status: 'cancelled_by_athlete',
        date: '2026-04-18',
      }),
      makeBooking({
        id: 3,
        scheduleId: 12,
        status: 'rejected_by_provider',
        date: '2026-04-15',
      }),
      makeBooking({ id: 4, scheduleId: 13, status: 'completed', date: '2026-04-10' }),
    ];
    const schedule: Schedule[] = [
      makeSlot({ id: 10, date: '2026-04-25', title: 'Active Session' }),
      makeSlot({ id: 11, date: '2026-04-18', title: 'Cancelled Session' }),
      makeSlot({ id: 12, date: '2026-04-15', title: 'Rejected Session' }),
      makeSlot({ id: 13, date: '2026-04-10', title: 'Completed Session' }),
    ];

    render(
      <AthleteSchedule
        bookings={bookings}
        schedule={schedule}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Отменённые/i }));

    expect(screen.getByText('Cancelled Session')).toBeInTheDocument();
    expect(screen.getByText('Rejected Session')).toBeInTheDocument();
    expect(screen.queryByText('Active Session')).not.toBeInTheDocument();
    expect(screen.queryByText('Completed Session')).not.toBeInTheDocument();
  });

  it('группировка по неделям: bookings из разных недель — два заголовка недели', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({ id: 1, scheduleId: 10, status: 'confirmed', date: '2026-04-23' }),
      makeBooking({ id: 2, scheduleId: 11, status: 'completed', date: '2026-04-10' }),
    ];
    const schedule: Schedule[] = [
      makeSlot({ id: 10, date: '2026-04-23', title: 'Эта неделя' }),
      makeSlot({ id: 11, date: '2026-04-10', title: 'Две недели назад' }),
    ];

    render(
      <AthleteSchedule
        bookings={bookings}
        schedule={schedule}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
      />,
    );

    const weekHeaders = screen.getAllByTestId('athlete-schedule-week-header');

    expect(weekHeaders.length).toBeGreaterThanOrEqual(2);
  });

  it('клик по записи → drawer открывается с таймлайном из statusHistory', () => {
    authenticateAthlete();

    const bookings: Booking[] = [
      makeBooking({
        id: 42,
        scheduleId: 10,
        status: 'confirmed',
        date: '2026-04-25',
        statusHistory: [
          { from: null, to: 'pending', actor: 'athlete', at: '2026-04-20T09:00:00.000Z' },
          { from: 'pending', to: 'confirmed', actor: 'provider', at: '2026-04-21T12:00:00.000Z' },
        ],
      }),
    ];
    const schedule: Schedule[] = [
      makeSlot({ id: 10, date: '2026-04-25', title: 'Утреннее плавание' }),
    ];

    render(
      <AthleteSchedule
        bookings={bookings}
        schedule={schedule}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Детали/i }));

    const dialog = screen.getByRole('dialog');

    expect(within(dialog).getByText('Вы записались')).toBeInTheDocument();
    expect(within(dialog).getByText('Провайдер подтвердил')).toBeInTheDocument();
  });

  it('late-cancel flow через drawer: Cancel при late policy → warning-modal', () => {
    authenticateAthlete();

    // NOW = 2026-04-22T12:00Z; slot стартует 2026-04-22T18:00 (через 6h) с policy free_until_24h
    // → отмена ЗА 6h до старта = late.
    const bookings: Booking[] = [
      makeBooking({
        id: 50,
        scheduleId: 10,
        status: 'confirmed',
        date: '2026-04-22',
        cancellationPolicySnapshot: 'free_until_24h',
      }),
    ];
    const schedule: Schedule[] = [
      makeSlot({
        id: 10,
        date: '2026-04-22',
        startTime: '18:00',
        endTime: '19:00',
        title: 'Сегодня вечером',
      }),
    ];

    render(
      <AthleteSchedule
        bookings={bookings}
        schedule={schedule}
        clubs={clubs}
        trainers={trainers}
        sports={sports}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /Детали/i }));
    fireEvent.click(screen.getByRole('button', { name: /Отменить запись/i }));

    // Проверяем заголовок warning-модалки + наличие кнопки «Оставить запись».
    expect(screen.getByRole('heading', { name: /Поздняя отмена/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Оставить запись/i })).toBeInTheDocument();
  });
});
