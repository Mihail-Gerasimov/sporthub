import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { Header } from '@/components/layout/Header';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('Header', () => {
  beforeEach(() => {
    localStorage.clear();

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  it('в гостевом состоянии показывает кнопку входа', () => {
    render(<Header />);

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
  });

  it('после авторизации показывает имя, человекочитаемый тип аккаунта и аватар-заглушку', () => {
    useAuthStore.getState().register({
      accountType: 'provider',
      user: {
        name: 'Марина Крылова',
        email: 'marina@studio.local',
      },
    });

    render(<Header />);

    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('Представитель спортивных услуг')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Аватар Марина Крылова' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('после logout возвращается в гостевое состояние', () => {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument();
    expect(screen.queryByText('Спортсмен')).not.toBeInTheDocument();
  });
});
