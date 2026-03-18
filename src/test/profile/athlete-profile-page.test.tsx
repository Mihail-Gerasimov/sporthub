import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import AthleteProfileRoute from '@/app/profile/athlete/page';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('AthleteProfilePage', () => {
  beforeEach(() => {
    localStorage.clear();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  it('показывает athlete-only кабинет с данными пользователя из auth-state', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'athlete',
      user: {
        id: 1,
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
        phone: '+7 (927) 000-10-10',
      },
    });

    render(await AthleteProfileRoute());

    expect(screen.getByRole('heading', { name: 'Кабинет спортсмена' })).toBeInTheDocument();
    expect(screen.getByText('Алексей Смирнов')).toBeInTheDocument();
    expect(screen.getByText('alexey@sporthub.local')).toBeInTheDocument();
    expect(screen.queryByText('Кабинет представителя спортивных услуг')).not.toBeInTheDocument();
  });

  it('для гостя показывает ограничение и открывает auth-модалку по CTA', async () => {
    render(await AthleteProfileRoute());

    expect(screen.getByText('Кабинет спортсмена доступен только после входа.')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти или зарегистрироваться' }));

    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
  });

  it('для provider не смешивает кабинеты и показывает отдельное ограничение', async () => {
    useAuthStore.setState({
      isAuthenticated: true,
      accountType: 'provider',
      user: {
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(await AthleteProfileRoute());

    expect(
      screen.getByText(
        'Ты вошёл как представитель спортивных услуг. Кабинет спортсмена недоступен.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Кабинет спортсмена' })).not.toBeInTheDocument();
  });
});
