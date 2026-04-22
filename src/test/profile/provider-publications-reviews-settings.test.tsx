// Smoke-тесты client-обёрток Step 25.14-A: ProviderPublications / ProviderReviews /
// ProviderSettings. Проверяем access-gate и базовый рендер без падений.
import { screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithToast as render } from '@/test/helpers/render-with-toast';

// Phase 26 Step 26.4: ProviderPublications теперь использует useRouter для router.refresh
// после delete/edit-success — тесту нужен моковый router, иначе invariant-падение.
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: vi.fn(),
    push: vi.fn(),
    replace: vi.fn(),
  }),
}));

import { ProviderPublications } from '@/components/profile/provider/ProviderPublications';
import { ProviderReviews } from '@/components/profile/provider/ProviderReviews';
import { ProviderSettings } from '@/components/profile/provider/ProviderSettings';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { User } from '@/types';

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

function authProvider() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: providerUser,
    accountType: 'provider',
    isAuthenticated: true,
  });
}

function authAthlete() {
  useAuthStore.setState({
    ...AUTH_STORE_DEFAULT_STATE,
    user: athleteUser,
    accountType: 'athlete',
    isAuthenticated: true,
  });
}

describe('ProviderPublications (Step 25.14-A)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит раздел для провайдера', () => {
    authProvider();
    render(<ProviderPublications clubs={[]} trainers={[]} />);
    expect(screen.getByTestId('provider-publications')).toBeInTheDocument();
  });

  it('рендерит access-denied для athlete-session', () => {
    authAthlete();
    render(<ProviderPublications clubs={[]} trainers={[]} />);
    expect(screen.getByTestId('provider-publications-access-denied')).toBeInTheDocument();
  });
});

describe('ProviderReviews (Step 25.14-A)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит раздел для провайдера', () => {
    authProvider();
    render(<ProviderReviews reviews={[]} clubs={[]} trainers={[]} />);
    expect(screen.getByTestId('provider-reviews')).toBeInTheDocument();
  });

  it('рендерит access-denied для athlete-session', () => {
    authAthlete();
    render(<ProviderReviews reviews={[]} clubs={[]} trainers={[]} />);
    expect(screen.getByTestId('provider-reviews-access-denied')).toBeInTheDocument();
  });
});

describe('ProviderSettings (Step 25.14-A)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('рендерит раздел для провайдера', () => {
    authProvider();
    render(<ProviderSettings />);
    expect(screen.getByTestId('provider-settings')).toBeInTheDocument();
  });

  it('рендерит access-denied для athlete-session', () => {
    authAthlete();
    render(<ProviderSettings />);
    expect(screen.getByTestId('provider-settings-access-denied')).toBeInTheDocument();
  });
});
