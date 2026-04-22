// Тесты ProviderClients (Step 25.10-B): агрегация уникальных клиентов из bookings
// провайдера, per-offering фильтр, reliability-фильтр, drawer с историей записей
// и CRM-заметкой (POST создаёт, DELETE удаляет).
import { fireEvent, screen, waitFor, within } from '@testing-library/react';
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

import { ProviderClients } from '@/components/profile/provider/ProviderClients';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Offering, ProviderClientNote, Schedule, Trainer, User } from '@/types';

process.env.TZ = 'UTC';

const providerUser: User = {
  id: 10,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'club_owner',
  name: 'Ирина Провайдер',
  email: 'provider@studio.local',
  phone: '+7 999 222-33-44',
  password: 'secret',
  favoriteClubIds: [],
};

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
  phone: '+7 999 111-22-33',
  password: 'secret',
  favoriteClubIds: [],
};

const athleteUser2: User = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  name: 'Ольга Петрова',
  email: 'olga@sporthub.local',
  phone: '+7 999 000-00-00',
  password: 'secret',
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
  isFeatured: false,
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

function makeSchedule(overrides: Partial<Schedule> & Pick<Schedule, 'id'>): Schedule {
  return {
    createdAt: '2026-04-20T09:00:00.000Z',
    clubId: club.id,
    sportId: 3,
    title: 'Занятие',
    date: '2026-04-25',
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
    createdAt: '2026-04-20T09:00:00.000Z',
    scheduleId: 1001,
    offeringId: clubOffering.id,
    ownerType: 'club',
    ownerId: club.id,
    userId: athleteUser.id,
    clubId: club.id,
    sportId: 3,
    date: '2026-04-25',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountType: 'provider',
    isAuthenticated: true,
  });
}

const fetchMock = vi.fn();

function createJsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProviderClients (Step 25.10-B)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('показывает карточки для каждого уникального userId из bookings провайдера', () => {
    authenticateProvider();

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });
    const b2 = makeBooking({ id: 502, status: 'completed', userId: athleteUser2.id });

    render(
      <ProviderClients
        bookings={[b1, b2]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser, athleteUser2]}
        notes={[]}
      />,
    );

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();
  });

  it('per-offering фильтр: выбор Йоги скрывает клиента с booking только на Бокс', () => {
    authenticateProvider();

    const yogaBooking = makeBooking({
      id: 601,
      status: 'completed',
      userId: athleteUser.id,
      offeringId: offeringYoga.id,
      ownerType: 'trainer',
      ownerId: trainer.id,
      trainerId: trainer.id,
      clubId: undefined,
      sportId: 1,
    });
    const boxBooking = makeBooking({
      id: 602,
      status: 'completed',
      userId: athleteUser2.id,
      offeringId: offeringBox.id,
      ownerType: 'trainer',
      ownerId: trainer.id,
      trainerId: trainer.id,
      clubId: undefined,
      sportId: 4,
    });

    render(
      <ProviderClients
        bookings={[yogaBooking, boxBooking]}
        clubs={[]}
        trainers={[trainer]}
        offerings={[offeringYoga, offeringBox]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser, athleteUser2]}
        notes={[]}
      />,
    );

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();

    const select = screen.getByTestId('provider-clients-filter-offering') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: String(offeringYoga.id) } });

    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.queryByTestId('provider-clients-card-2')).not.toBeInTheDocument();
  });

  it('фильтр по reliability: выбор «danger» оставляет только клиентов с danger-бейджем', () => {
    authenticateProvider();

    // DISCIPLINE_CONFIG: minCompletedForBadge=5, dangerThreshold=0.75.
    // user 1: 6 completed → completedCount≥5 (не new) + rate=1 (нет бейджа) → normal.
    // user 2: 5 completed + 20 no_show → completedCount≥5 + rate=0.2<0.75 → danger.
    const normalBookings: Booking[] = Array.from({ length: 6 }, (_, index) =>
      makeBooking({
        id: 700 + index,
        status: 'completed',
        userId: athleteUser.id,
      }),
    );

    const dangerBookings: Booking[] = [
      ...Array.from({ length: 5 }, (_, index) =>
        makeBooking({
          id: 800 + index,
          status: 'completed',
          userId: athleteUser2.id,
        }),
      ),
      ...Array.from({ length: 20 }, (_, index) =>
        makeBooking({
          id: 900 + index,
          status: 'no_show',
          userId: athleteUser2.id,
        }),
      ),
    ];

    render(
      <ProviderClients
        bookings={[...normalBookings, ...dangerBookings]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser, athleteUser2]}
        notes={[]}
      />,
    );

    // Изначально оба клиента видны.
    expect(screen.getByTestId('provider-clients-card-1')).toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();

    const select = screen.getByTestId('provider-clients-filter-reliability') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'danger' } });

    expect(screen.queryByTestId('provider-clients-card-1')).not.toBeInTheDocument();
    expect(screen.getByTestId('provider-clients-card-2')).toBeInTheDocument();
  });

  it('клик по карточке открывает drawer с именем клиента и историей записей', () => {
    authenticateProvider();

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });
    const b2 = makeBooking({ id: 502, status: 'pending', userId: athleteUser.id });

    render(
      <ProviderClients
        bookings={[b1, b2]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser]}
        notes={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-clients-card-1'));

    const drawer = screen.getByTestId('provider-clients-drawer');
    expect(drawer).toBeInTheDocument();
    expect(within(drawer).getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(
      within(drawer).getByTestId('provider-clients-drawer-history-item-501'),
    ).toBeInTheDocument();
    expect(
      within(drawer).getByTestId('provider-clients-drawer-history-item-502'),
    ).toBeInTheDocument();
  });

  it('save-note создаёт заметку через POST /api/provider-client-notes', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true, data: { id: 77 } }, 201));

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });

    render(
      <ProviderClients
        bookings={[b1]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser]}
        notes={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-clients-card-1'));

    const textarea = screen.getByTestId(
      'provider-clients-drawer-note-textarea',
    ) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: 'Мотивированный клиент' } });
    fireEvent.click(screen.getByTestId('provider-clients-drawer-note-save'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/provider-client-notes');
    expect(call[1].method).toBe('POST');
    expect(JSON.parse(call[1].body as string)).toEqual({
      providerUserId: providerUser.id,
      clientUserId: athleteUser.id,
      note: 'Мотивированный клиент',
    });
  });

  it('delete-note удаляет существующую заметку через DELETE /api/provider-client-notes/[id]', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(createJsonResponse({ success: true }));

    const b1 = makeBooking({ id: 501, status: 'completed', userId: athleteUser.id });
    const existing: ProviderClientNote = {
      id: 42,
      createdAt: '2026-04-20T10:00:00.000Z',
      updatedAt: '2026-04-20T10:00:00.000Z',
      providerUserId: providerUser.id,
      clientUserId: athleteUser.id,
      note: 'Старая заметка',
    };

    render(
      <ProviderClients
        bookings={[b1]}
        clubs={[club]}
        trainers={[]}
        offerings={[clubOffering]}
        schedule={[makeSchedule({ id: 1001 })]}
        users={[providerUser, athleteUser]}
        notes={[existing]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-clients-card-1'));
    fireEvent.click(screen.getByTestId('provider-clients-drawer-note-delete'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/provider-client-notes/42');
    expect(call[1].method).toBe('DELETE');
    expect(JSON.parse(call[1].body as string)).toEqual({ userId: providerUser.id });
  });

  it('рендерит access-denied, если пользователь — атлет', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: athleteUser,
      accountType: 'athlete',
      isAuthenticated: true,
    });

    render(
      <ProviderClients
        bookings={[]}
        clubs={[]}
        trainers={[]}
        offerings={[]}
        schedule={[]}
        users={[]}
        notes={[]}
      />,
    );

    expect(screen.getByTestId('provider-clients-access-denied')).toBeInTheDocument();
  });
});
