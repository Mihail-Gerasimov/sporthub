// ⚠️ Фаза 35, шаг 35.34. Проверка «чужому — плашка «Доступ ограничен»» снята
// не потому, что стала не нужна, а потому, что она никогда не была защитой:
// плашка рисовалась ПОВЕРХ уже отданных данных. Настоящая проверка стоит
// в серверном лейауте, ДО похода за данными, и проверяется она набором
// `src/test/security/protected-layouts.test.ts` — там же, где проверяется
// и то, что уведённому данные не запрашивались вообще.
// Тесты ProviderStats (Step 25.11): метрики per-entity и drill-down per-offering,
// window toggle (12m ↔ all), heatmap, completion/cancel/no_show rates, empty и
// access-denied. ResponsiveContainer из recharts стабает в jsdom — мокаем ResizeObserver.
import { fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

const { refreshMock } = vi.hoisted(() => ({ refreshMock: vi.fn() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: refreshMock,
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
}));

import { ProviderStats } from '@/components/profile/provider/ProviderStats';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Offering, Schedule, Sport, Trainer, User } from '@sporthub/types';

process.env.TZ = 'UTC';

// Recharts использует ResizeObserver; в jsdom его нет.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
// @ts-expect-error — расширяем globalThis для jsdom
globalThis.ResizeObserver = ResizeObserverStub;

const NOW = new Date('2026-04-22T12:00:00.000Z');

const providerUser: User = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Ирина Провайдер',
  email: 'provider@studio.local',
  phone: '+7 999 222-33-44',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

const club: Club = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Aqua Pro',
  slug: 'aqua-pro',
  description: '',
  shortDescription: '',
  sportIds: [3],
  rating: 4.8,
  reviewCount: 0,
  city: 'Самара',
  address: '',
  phone: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  imageUrls: [],
  tagIds: [],
  amenityIds: [],
  priceFrom: 1000,
  distanceKm: 0,
  managedByUserId: providerUser.id,
};

const trainer: Trainer = {
  id: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Пётр Тренер',
  slug: 'pyotr',
  bio: '',
  avatarUrl: '',
  experienceYears: 5,
  specialtyIds: [],
  workFormatIds: [],
  rating: 5,
  reviewCount: 0,
  priceFrom: 1500,
  sportIds: [1, 4],
  managedByUserId: providerUser.id,
};

const clubOffering: Offering = {
  id: 101,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club',
  ownerId: club.id,
  sportId: 3,
  title: 'Плавание',
  description: '',
  format: 'group',
  price: 1000,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 0, lng: 0 },
};

const offeringYoga: Offering = {
  id: 201,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'trainer',
  ownerId: trainer.id,
  sportId: 1,
  title: 'Йога',
  description: '',
  format: 'group',
  price: 1500,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 0, lng: 0 },
};

const offeringBox: Offering = {
  id: 202,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'trainer',
  ownerId: trainer.id,
  sportId: 4,
  title: 'Бокс',
  description: '',
  format: 'group',
  price: 1500,
  durationMinutes: 60,
  capacity: 10,
  address: '',
  coordinates: { lat: 0, lng: 0 },
};

const sports: Sport[] = [
  {
    id: 1,
    createdAt: '',
    name: 'Йога',
    slug: 'yoga',
    description: '',
    icon: '',
    imageUrl: '',
    isPopular: false,
  },
  {
    id: 3,
    createdAt: '',
    name: 'Плавание',
    slug: 'swim',
    description: '',
    icon: '',
    imageUrl: '',
    isPopular: false,
  },
  {
    id: 4,
    createdAt: '',
    name: 'Бокс',
    slug: 'box',
    description: '',
    icon: '',
    imageUrl: '',
    isPopular: false,
  },
];

function makeSchedule(overrides: Partial<Schedule> & Pick<Schedule, 'id'>): Schedule {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    clubId: club.id,
    sportId: 3,
    title: 'Занятие',
    date: '2026-04-15',
    startTime: '10:00',
    endTime: '11:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 10,
    bookedCount: 0,
    price: 1000,
    ...overrides,
  };
}

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'status'>): Booking {
  return {
    createdAt: '2026-04-15T09:00:00.000Z',
    scheduleId: 1001,
    offeringId: clubOffering.id,
    ownerType: 'club',
    ownerId: club.id,
    userId: athleteUser.id,
    clubId: club.id,
    sportId: 3,
    date: '2026-04-15',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountKind: 'person',
    isAuthenticated: true,
  });
}

describe('ProviderStats (Step 25.11)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('рендерит базовые секции и KPI для провайдера-клуба с хотя бы одним completed', () => {
    authenticateProvider();

    const completed = makeBooking({ id: 501, status: 'completed' });

    render(
      <ProviderStats
        bookings={[completed]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats')).toBeInTheDocument();
    expect(screen.getByTestId('provider-stats-kpi')).toBeInTheDocument();
    // Часы завершённых записей: 60 минут = 1 час.
    expect(screen.getByTestId('provider-stats-total-hours')).toHaveTextContent('1');
  });

  it('per-offering toggle: выбор Йоги скрывает метрики Бокса', () => {
    authenticateProvider();

    const yoga = makeBooking({
      id: 601,
      status: 'completed',
      offeringId: offeringYoga.id,
      ownerType: 'trainer',
      ownerId: trainer.id,
      trainerId: trainer.id,
      clubId: undefined,
      sportId: 1,
    });
    const box = makeBooking({
      id: 602,
      status: 'completed',
      offeringId: offeringBox.id,
      ownerType: 'trainer',
      ownerId: trainer.id,
      trainerId: trainer.id,
      clubId: undefined,
      sportId: 4,
    });

    render(
      <ProviderStats
        bookings={[yoga, box]}
        clubs={[]}
        trainers={[trainer]}
        offerings={[offeringYoga, offeringBox]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
      />,
    );

    // Изначально показана сумма по обоим offerings.
    expect(screen.getByTestId('provider-stats-total-hours')).toHaveTextContent('2');

    // Выбираем Йогу в per-offering toggle.
    const select = screen.getByTestId('provider-stats-filter-offering') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: String(offeringYoga.id) } });

    // Остаётся 1 час (только yoga).
    expect(screen.getByTestId('provider-stats-total-hours')).toHaveTextContent('1');
  });

  it('window toggle: переключение между «12 мес» и «всё время»', () => {
    authenticateProvider();

    // Booking 14 месяцев назад (вне окна 12m).
    const oldBooking = makeBooking({
      id: 701,
      status: 'completed',
      date: '2025-02-10',
    });
    // Booking в последние 12 месяцев.
    const recentBooking = makeBooking({
      id: 702,
      status: 'completed',
      date: '2026-04-10',
    });

    render(
      <ProviderStats
        bookings={[oldBooking, recentBooking]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
      />,
    );

    // По умолчанию 12 месяцев — только один recent.
    expect(screen.getByTestId('provider-stats-total-hours')).toHaveTextContent('1');

    fireEvent.click(screen.getByTestId('provider-stats-window-all'));

    // Все: 2 часа.
    expect(screen.getByTestId('provider-stats-total-hours')).toHaveTextContent('2');
  });

  it('heatmap присутствует в DOM, когда есть completed booking', () => {
    authenticateProvider();

    const b = makeBooking({ id: 501, status: 'completed' });

    render(
      <ProviderStats
        bookings={[b]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats-heatmap')).toBeInTheDocument();
  });

  it('completion rate: 4 completed + 1 no_show → 80%', () => {
    authenticateProvider();

    const completed = Array.from({ length: 4 }, (_, index) =>
      makeBooking({ id: 800 + index, status: 'completed' }),
    );
    const noShow = makeBooking({ id: 900, status: 'no_show' });

    render(
      <ProviderStats
        bookings={[...completed, noShow]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats-completion-rate')).toHaveTextContent('80%');
  });

  it('cancel rate: 2 cancelled_by_provider из 10 → 20%', () => {
    authenticateProvider();

    const completed = Array.from({ length: 8 }, (_, index) =>
      makeBooking({ id: 1100 + index, status: 'completed' }),
    );
    const cancelled = Array.from({ length: 2 }, (_, index) =>
      makeBooking({ id: 1200 + index, status: 'cancelled_by_provider' }),
    );

    render(
      <ProviderStats
        bookings={[...completed, ...cancelled]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats-cancel-rate')).toHaveTextContent('20%');
  });

  it('empty state: провайдер без клубов и тренеров видит empty-плашку', () => {
    authenticateProvider();

    render(
      <ProviderStats
        bookings={[]}
        clubs={[]}
        trainers={[]}
        offerings={[]}
        schedule={[]}
        sports={sports}
      />,
    );

    expect(screen.getByTestId('provider-stats-empty')).toBeInTheDocument();
  });
});
