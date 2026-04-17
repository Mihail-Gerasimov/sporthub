/**
 * Тесты отображения ID аккаунта в ЛК (Step 17.6).
 * Проверяют что ID видно в профилях спортсмена и провайдера.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AthleteProfilePage } from '@/components/profile/AthleteProfilePage';
import { ProviderProfilePage } from '@/components/profile/ProviderProfilePage';
import {
  AUTH_STORE_DEFAULT_STATE,
  MVP_ATHLETE_USER_ID,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

describe('ID аккаунта в ЛК (Step 17.6)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('ID аккаунта отображается в ЛК спортсмена', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: {
        id: MVP_ATHLETE_USER_ID,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
      accountType: 'athlete',
      isAuthenticated: true,
    });

    render(
      <AthleteProfilePage bookings={[]} clubs={[]} schedule={[]} trainers={[]} reviews={[]} />,
    );

    expect(screen.getByText(`ID: #${MVP_ATHLETE_USER_ID}`)).toBeInTheDocument();
  });

  it('ID аккаунта отображается в ЛК провайдера', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: {
        id: MVP_PROVIDER_USER_ID,
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
      accountType: 'provider',
      isAuthenticated: true,
    });

    render(
      <ProviderProfilePage
        bookings={[]}
        clubs={[]}
        reviews={[]}
        schedule={[]}
        trainers={[]}
        users={[]}
      />,
    );

    expect(screen.getByText(`ID: #${MVP_PROVIDER_USER_ID}`)).toBeInTheDocument();
  });
});
