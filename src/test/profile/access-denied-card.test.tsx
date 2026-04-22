// Step 26.1: shared AccessDeniedCard для profile-маршрутов обеих ролей.
// Проверяет рендер role-badge и condition'ального session-badge, видимость
// «Войти» только для не-залогиненных, и override testId через prop (нужен
// для сохранения existing provider-testid'ов при миграции).
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import type { User } from '@/types';

const athleteUser: User = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  name: 'Алексей',
  email: 'alexey@test',
  phone: '',
  password: 'secret',
  favoriteClubIds: [],
};

const providerUser: User = {
  ...athleteUser,
  id: 2,
  role: 'club_owner',
  name: 'Марина',
  email: 'marina@test',
};

describe('AccessDeniedCard (Step 26.1)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('provider-only + athlete-сессия: Provider only + Athlete session + дефолтный testid', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: athleteUser,
      accountType: 'athlete',
      isAuthenticated: true,
    });

    render(<AccessDeniedCard requiredRole="provider" />);

    expect(screen.getByTestId('profile-access-denied-provider')).toBeInTheDocument();
    expect(screen.getByText('Provider only')).toBeInTheDocument();
    expect(screen.getByText('Athlete session')).toBeInTheDocument();
    expect(screen.getByText(/Доступ ограничен/i)).toBeInTheDocument();
    // Для залогиненного кнопка «Войти» не показывается
    expect(
      screen.queryByRole('button', { name: 'Войти или зарегистрироваться' }),
    ).not.toBeInTheDocument();
  });

  it('athlete-only + provider-сессия: Athlete only + Provider session', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: providerUser,
      accountType: 'provider',
      isAuthenticated: true,
    });

    render(<AccessDeniedCard requiredRole="athlete" />);

    expect(screen.getByTestId('profile-access-denied-athlete')).toBeInTheDocument();
    expect(screen.getByText('Athlete only')).toBeInTheDocument();
    expect(screen.getByText('Provider session')).toBeInTheDocument();
  });

  it('не-залогиненный: видит кнопку «Войти» и не видит session-бейджа', () => {
    render(<AccessDeniedCard requiredRole="provider" />);

    expect(
      screen.getByRole('button', { name: 'Войти или зарегистрироваться' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Athlete session')).not.toBeInTheDocument();
    expect(screen.queryByText('Provider session')).not.toBeInTheDocument();
  });
});
