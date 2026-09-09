// Тесты ProviderDashboard (Step 25.8): условный рендер club/trainer-side, empty,
// per-offering KPI для multi-offering тренера, link-навигация KPI-карточек.
// Read-only компонент (нет mutation → тосты/refresh не нужны), рендерим напрямую.
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

import { ProviderDashboard } from '@/components/profile/provider/ProviderDashboard';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Offering, Review, Trainer, User } from '@sporthub/types';

const NOW = new Date('2026-04-22T12:00:00.000Z');

const providerUser: User = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Марина Крылова',
  email: 'marina@studio.local',
  phone: '+7 999 222-33-44',
  passwordHash: 'secret',
  favoriteClubIds: [],
};

function makeClub(overrides: Partial<Club> & Pick<Club, 'id'>): Club {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    name: `Club ${overrides.id}`,
    slug: `club-${overrides.id}`,
    description: '',
    sportId: 3,
    sportIds: [3],
    rating: 4.8,
    reviewCount: 0,
    city: 'Самара',
    address: '',
    coordinates: { lat: 53.2, lng: 50.1 },
    tagIds: [],
    amenityIds: [],
    priceFrom: 1000,
    managedByUserId: providerUser.id,
    ...overrides,
  };
}

function makeTrainer(overrides: Partial<Trainer> & Pick<Trainer, 'id'>): Trainer {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    name: `Trainer ${overrides.id}`,
    slug: `trainer-${overrides.id}`,
    bio: '',
    avatarUrl: '',
    experienceYears: 5,
    sportId: 3,
    sportIds: [3],
    specialtyIds: [],
    workFormatIds: [],
    priceFrom: 1500,
    rating: 4.8,
    reviewCount: 0,
    city: 'Самара',
    address: '',
    coordinates: { lat: 53.2, lng: 50.1 },
    managedByUserId: providerUser.id,
    ...overrides,
  };
}

function makeOffering(overrides: Partial<Offering> & Pick<Offering, 'id' | 'ownerId'>): Offering {
  return {
    createdAt: '2026-01-01T00:00:00.000Z',
    ownerType: 'trainer',
    sportId: 3,
    title: `Offering ${overrides.id}`,
    description: '',
    format: 'personal',
    price: 1500,
    durationMinutes: 60,
    capacity: 1,
    address: '',
    coordinates: { lat: 53.2, lng: 50.1 },
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

describe('ProviderDashboard (Step 25.8)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('only clubs: при 1 клубе и 0 тренеров видна секция клубов и не видна секция тренеров', () => {
    authenticateProvider();

    render(<ProviderDashboard clubs={[makeClub({ id: 1 })]} trainers={[]} />);

    expect(screen.getByTestId('provider-dashboard-clubs')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-dashboard-trainers')).not.toBeInTheDocument();
  });

  it('only trainers: при 0 клубов и 1 тренере видна секция тренеров и не видна секция клубов', () => {
    authenticateProvider();

    render(<ProviderDashboard clubs={[]} trainers={[makeTrainer({ id: 10 })]} />);

    expect(screen.getByTestId('provider-dashboard-trainers')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-dashboard-clubs')).not.toBeInTheDocument();
  });

  it('both sides: при 1 клубе + 1 тренере видны обе секции', () => {
    authenticateProvider();

    render(
      <ProviderDashboard clubs={[makeClub({ id: 1 })]} trainers={[makeTrainer({ id: 10 })]} />,
    );

    expect(screen.getByTestId('provider-dashboard-clubs')).toBeInTheDocument();
    expect(screen.getByTestId('provider-dashboard-trainers')).toBeInTheDocument();
  });

  it('empty: у нового провайдера без публикаций — CTA «Опубликуйте первую услугу»', () => {
    authenticateProvider();

    render(<ProviderDashboard clubs={[]} trainers={[]} />);

    expect(screen.getByTestId('provider-dashboard-empty')).toBeInTheDocument();
    expect(screen.getByText(/Опубликуйте первую услугу/i)).toBeInTheDocument();
    // KPI-ряда нет — пустое состояние заменяет основной рендер.
    expect(screen.queryByTestId('provider-dashboard-kpi')).not.toBeInTheDocument();
  });

  it('per-offering KPI: тренер с 2 offerings → внутри trainer-карточки видны подсекции offerings', () => {
    authenticateProvider();

    const trainer = makeTrainer({ id: 10 });
    const offerings: Offering[] = [
      makeOffering({ id: 101, ownerId: trainer.id, title: 'Йога' }),
      makeOffering({ id: 102, ownerId: trainer.id, title: 'Бокс' }),
    ];
    const bookings: Booking[] = [
      {
        id: 1,
        createdAt: '2026-04-20T09:00:00.000Z',
        scheduleId: 1001,
        offeringId: 101,
        ownerType: 'trainer',
        ownerId: trainer.id,
        userId: 1,
        trainerId: trainer.id,
        sportId: 3,
        date: '2026-04-25',
        status: 'confirmed',
        paymentStatus: 'paid',
        totalPrice: 1500,
      },
    ];

    render(
      <ProviderDashboard
        clubs={[]}
        trainers={[trainer]}
        offerings={offerings}
        bookings={bookings}
      />,
    );

    const breakdown = screen.getByTestId(`provider-dashboard-trainer-offerings-${trainer.id}`);
    expect(breakdown).toBeInTheDocument();
    expect(within(breakdown).getByText('Йога')).toBeInTheDocument();
    expect(within(breakdown).getByText('Бокс')).toBeInTheDocument();
    // Активная запись на offering 101 → счётчик «1 активных» виден хотя бы раз.
    expect(within(breakdown).getByText(/1 активных/i)).toBeInTheDocument();
  });

  it('Phase 26 Step 26.9: KPI «Рейтинг» — средний балл reviews на managed-club, ссылка на /reviews', () => {
    authenticateProvider();

    const club = makeClub({ id: 1 });
    const reviews: Review[] = [
      {
        id: 101,
        createdAt: '2026-04-20T09:00:00.000Z',
        userId: 11,
        clubId: club.id,
        rating: 5,
        text: 'топ',
      },
      {
        id: 102,
        createdAt: '2026-04-20T10:00:00.000Z',
        userId: 12,
        clubId: club.id,
        rating: 4,
        text: 'ок',
      },
    ];

    render(<ProviderDashboard clubs={[club]} trainers={[]} reviews={reviews} />);

    const card = screen.getByTestId('provider-dashboard-rating');
    expect(card).toHaveTextContent('4.5');
    expect(card).toHaveTextContent(/Рейтинг/i);

    const link = screen.getByTestId('provider-dashboard-rating-link');
    expect(link).toHaveAttribute('href', '/profile/provider/reviews');
  });

  it('link навигация: pending-bookings KPI-карточка оборачивается в Link на /profile/provider/bookings', () => {
    authenticateProvider();

    render(<ProviderDashboard clubs={[makeClub({ id: 1 })]} trainers={[]} />);

    const link = screen.getByTestId('provider-dashboard-pending-bookings-link');
    expect(link).toHaveAttribute('href', '/profile/provider/bookings?tab=pending');

    const linksLink = screen.getByTestId('provider-dashboard-pending-links-link');
    expect(linksLink).toHaveAttribute('href', '/profile/provider/links');
  });
});
