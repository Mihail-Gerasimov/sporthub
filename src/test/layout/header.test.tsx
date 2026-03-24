import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { Header } from '@/components/layout/Header';
import { AUTH_STORAGE_KEY, AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
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
    expect(screen.getByRole('link', { name: 'Подборки' })).toHaveAttribute('href', '/#discover');
    expect(screen.getByRole('link', { name: 'Выдача' })).toHaveAttribute('href', '/#results');
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('href', '/#availability');
  });

  it('после авторизации показывает имя, человекочитаемый тип аккаунта и ссылку в кабинет', () => {
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
    // Provider avatar теперь ведёт в кабинет провайдера
    expect(screen.getByRole('link', { name: 'Перейти в личный кабинет' })).toHaveAttribute(
      'href',
      '/profile/provider',
    );
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('для спортсмена делает иконку аккаунта ссылкой в личный кабинет', () => {
    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<Header />);

    expect(screen.getByRole('link', { name: 'Перейти в личный кабинет' })).toHaveAttribute(
      'href',
      '/profile/athlete',
    );
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

  it('после rehydrate из localStorage UI по-прежнему видит правильный тип аккаунта', async () => {
    localStorage.setItem(
      AUTH_STORAGE_KEY,
      JSON.stringify({
        state: {
          user: {
            name: 'Марина Крылова',
            email: 'marina@studio.local',
          },
          accountType: 'provider',
          isAuthenticated: true,
        },
        version: 0,
      }),
    );

    await act(async () => {
      await useAuthStore.persist.rehydrate();
    });

    render(<Header />);

    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('Представитель спортивных услуг')).toBeInTheDocument();
  });
});
