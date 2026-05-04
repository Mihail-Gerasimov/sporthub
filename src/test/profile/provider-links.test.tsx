// Тесты ProviderLinks (Step 25.12): две стороны связи тренер↔клуб.
// Club-side: приём/отказ/revoke pending + invite тренера через search.
// Trainer-side: мои pending/confirmed/history + revoke own + request-link modal.
// RevokeLinkWarningModal показывает число offerings, которые станут частными.
import { fireEvent, screen, waitFor } from '@testing-library/react';
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

import { ProviderLinks } from '@/components/profile/provider/ProviderLinks';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { Club, Offering, Trainer, TrainerClubLink, User } from '@/types';

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

const myClub: Club = {
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
  coordinates: { lat: 0, lng: 0 },
  imageUrls: [],
  tagIds: [],
  amenityIds: [],
  priceFrom: 1000,
  distanceKm: 0,
  managedByUserId: providerUser.id,
};

const foreignClub: Club = {
  ...myClub,
  id: 20,
  name: 'Чужой клуб',
  managedByUserId: 999,
};

const myTrainer: Trainer = {
  id: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Мой Тренер',
  slug: 'my',
  bio: '',
  avatarUrl: '',
  experienceYears: 5,
  specialtyIds: [],
  workFormatIds: [],
  rating: 0,
  reviewCount: 0,
  priceFrom: 1500,
  sportIds: [1],
  managedByUserId: providerUser.id,
};

const foreignTrainer: Trainer = {
  ...myTrainer,
  id: 50,
  name: 'Чужой Тренер',
  managedByUserId: 888,
};

const anotherForeignTrainer: Trainer = {
  ...myTrainer,
  id: 51,
  name: 'Светлана Йога',
  managedByUserId: 777,
};

function authenticateProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountType: 'provider',
    isAuthenticated: true,
  });
}

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

describe('ProviderLinks (Step 25.12)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    refreshMock.mockReset();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('club-side: показывает pending-запросы от тренеров к моим клубам', () => {
    authenticateProvider();

    const pendingLink: TrainerClubLink = {
      id: 301,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    render(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer, foreignTrainer]}
        links={[pendingLink]}
        offerings={[]}
      />,
    );

    expect(screen.getByTestId('provider-links-club-side')).toBeInTheDocument();
    expect(screen.getByTestId(`provider-links-card-${pendingLink.id}`)).toBeInTheDocument();
  });

  it('club-side approve: клик «Подтвердить» шлёт POST /approve с userId провайдера', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 301 } }));

    const pendingLink: TrainerClubLink = {
      id: 301,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    render(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[pendingLink]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-approve-301'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/trainer-club-links/301/approve');
    expect(JSON.parse(call[1].body as string)).toEqual({ userId: providerUser.id });
  });

  it('club-side reject: клик «Отклонить» шлёт POST /reject', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const pendingLink: TrainerClubLink = {
      id: 302,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    render(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[pendingLink]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-reject-302'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/trainer-club-links/302/reject');
    });
  });

  it('club-side revoke: открывает warning modal с числом offerings и после confirm шлёт POST /revoke', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const confirmedLink: TrainerClubLink = {
      id: 303,
      createdAt: '2026-04-01T10:00:00.000Z',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'confirmed',
      initiatedBy: 'trainer',
    };

    const attachedOffering: Offering = {
      id: 401,
      createdAt: '2026-04-01T10:00:00.000Z',
      ownerType: 'trainer',
      ownerId: foreignTrainer.id,
      trainerClubLinkId: confirmedLink.id,
      sportId: 1,
      title: 'Персональная йога',
      description: '',
      format: 'personal',
      price: 1500,
      durationMinutes: 60,
      capacity: 1,
      address: '',
      coordinates: { lat: 0, lng: 0 },
    };

    render(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[confirmedLink]}
        offerings={[attachedOffering]}
      />,
    );

    // Переключаемся на таб Подтверждённые.
    fireEvent.click(screen.getByTestId('provider-links-club-tab-confirmed'));
    fireEvent.click(screen.getByTestId('provider-links-revoke-303'));

    const modal = screen.getByTestId('provider-links-revoke-warning-modal');
    expect(modal).toBeInTheDocument();
    // Показывает число offerings (1 привязанный).
    expect(modal.textContent).toMatch(/1/);

    fireEvent.click(screen.getByTestId('provider-links-revoke-warning-confirm'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/trainer-club-links/303/revoke');
    });
  });

  it('club-side invite: выбор тренера + клуба в модалке шлёт POST с initiatedBy=club', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 999 } }, 201));

    render(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer, anotherForeignTrainer]}
        links={[]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-invite-button'));

    const modal = screen.getByTestId('provider-links-invite-modal');
    expect(modal).toBeInTheDocument();

    // Фильтр по поиску — находим anotherForeignTrainer (Светлана) по подстроке.
    const search = screen.getByTestId('provider-links-invite-search') as HTMLInputElement;
    fireEvent.change(search, { target: { value: 'Светлана' } });

    fireEvent.click(
      screen.getByTestId(`provider-links-invite-trainer-option-${anotherForeignTrainer.id}`),
    );
    // Клуб всего один, уже выбран автоматически — submit.
    fireEvent.click(screen.getByTestId('provider-links-invite-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/trainer-club-links');
    const body = JSON.parse(call[1].body as string);
    expect(body).toEqual({
      trainerId: anotherForeignTrainer.id,
      clubId: myClub.id,
      userId: providerUser.id,
      // Phase 27 Step 27.9: клиент явно передаёт initiatedBy='club' из invite-модалки,
      // чтобы сервер смог направить уведомление trainer-manager'у (а не самому себе).
      initiatedBy: 'club',
    });
  });

  it('trainer-side: показывает pending-запросы моих тренеров к чужим клубам', () => {
    authenticateProvider();

    const myTrainerPending: TrainerClubLink = {
      id: 401,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: myTrainer.id,
      clubId: foreignClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    render(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer, foreignTrainer]}
        links={[myTrainerPending]}
        offerings={[]}
      />,
    );

    expect(screen.getByTestId('provider-links-trainer-side')).toBeInTheDocument();
    expect(screen.getByTestId(`provider-links-card-${myTrainerPending.id}`)).toBeInTheDocument();
  });

  it('trainer-side cancel own pending: POST /revoke для своего pending-запроса', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true }));

    const myTrainerPending: TrainerClubLink = {
      id: 402,
      createdAt: '2026-04-20T10:00:00.000Z',
      trainerId: myTrainer.id,
      clubId: foreignClub.id,
      status: 'pending',
      initiatedBy: 'trainer',
    };

    render(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer]}
        links={[myTrainerPending]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-cancel-own-402'));

    await waitFor(() => {
      expect(fetchMock.mock.calls[0][0]).toBe('/api/trainer-club-links/402/revoke');
    });
  });

  it('trainer-side request-link: выбор клуба + моего тренера шлёт POST /api/trainer-club-links', async () => {
    authenticateProvider();
    fetchMock.mockResolvedValueOnce(jsonResponse({ success: true, data: { id: 7 } }, 201));

    render(
      <ProviderLinks
        clubs={[myClub, foreignClub]}
        trainers={[myTrainer]}
        links={[]}
        offerings={[]}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-request-button'));

    const modal = screen.getByTestId('provider-links-request-modal');
    expect(modal).toBeInTheDocument();

    fireEvent.click(screen.getByTestId(`provider-links-request-club-option-${foreignClub.id}`));
    // Тренер один — выбран автоматически.
    fireEvent.click(screen.getByTestId('provider-links-request-submit'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const call = fetchMock.mock.calls[0];
    expect(call[0]).toBe('/api/trainer-club-links');
    expect(JSON.parse(call[1].body as string)).toEqual({
      trainerId: myTrainer.id,
      clubId: foreignClub.id,
      userId: providerUser.id,
      // Phase 27 Step 27.9: request-модалка всегда передаёт initiatedBy='trainer'
      // (симметрично с invite-модалкой, которая шлёт 'club').
      initiatedBy: 'trainer',
    });
  });

  it('revoke-warning отображает корректное число offerings для linkId', () => {
    authenticateProvider();

    const confirmedLink: TrainerClubLink = {
      id: 500,
      createdAt: '',
      trainerId: foreignTrainer.id,
      clubId: myClub.id,
      status: 'confirmed',
      initiatedBy: 'trainer',
    };

    const attachedOfferings: Offering[] = Array.from({ length: 3 }, (_, index) => ({
      id: 600 + index,
      createdAt: '',
      ownerType: 'trainer',
      ownerId: foreignTrainer.id,
      trainerClubLinkId: confirmedLink.id,
      sportId: 1,
      title: `Услуга ${index}`,
      description: '',
      format: 'personal',
      price: 1000,
      durationMinutes: 60,
      capacity: 1,
      address: '',
      coordinates: { lat: 0, lng: 0 },
    }));

    render(
      <ProviderLinks
        clubs={[myClub]}
        trainers={[foreignTrainer]}
        links={[confirmedLink]}
        offerings={attachedOfferings}
      />,
    );

    fireEvent.click(screen.getByTestId('provider-links-club-tab-confirmed'));
    fireEvent.click(screen.getByTestId('provider-links-revoke-500'));

    const modal = screen.getByTestId('provider-links-revoke-warning-modal');
    expect(modal.textContent).toMatch(/3/);
  });

  it('access-denied: athlete session видит отказ', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: athleteUser,
      accountType: 'athlete',
      isAuthenticated: true,
    });

    render(<ProviderLinks clubs={[]} trainers={[]} links={[]} offerings={[]} />);

    expect(screen.getByTestId('provider-links-access-denied')).toBeInTheDocument();
  });
});
