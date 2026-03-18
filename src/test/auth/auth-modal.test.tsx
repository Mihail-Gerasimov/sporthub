import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthModal } from '@/components/auth/AuthModal';
import { AppShell } from '@/components/layout/AppShell';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('AuthModal', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();

    useUIStore.setState({
      isAuthModalOpen: false,
    });

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  it('открывается из Header и закрывается по кнопке и overlay', () => {
    render(
      <AppShell>
        <div>Контент страницы</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByRole('dialog', { name: 'Войти или создать профиль' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Закрыть модальное окно' }));

    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

    fireEvent.click(screen.getByTestId('modal-overlay'));

    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();
  });

  it('переключает табы и требует выбор типа аккаунта в каждом сценарии', () => {
    useUIStore.setState({
      isAuthModalOpen: true,
    });

    render(<AuthModal />);

    expect(screen.getByRole('tab', { name: 'Вход' })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: 'Продолжить вход' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));

    expect(screen.getByRole('button', { name: 'Продолжить вход' })).not.toBeDisabled();

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));

    expect(screen.getByRole('tab', { name: 'Регистрация' })).toHaveAttribute(
      'aria-selected',
      'true',
    );
    expect(screen.getByLabelText('Имя')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).toBeDisabled();

    fireEvent.click(screen.getByRole('button', { name: 'Представитель спортивных услуг' }));

    expect(screen.getByRole('button', { name: 'Создать аккаунт' })).not.toBeDisabled();
  });

  it('не запускает вход без выбранного типа аккаунта', () => {
    useUIStore.setState({
      isAuthModalOpen: true,
    });

    render(<AuthModal />);

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'coach@sporthub.local' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });

    const submitButton = screen.getByRole('button', { name: 'Продолжить вход' });

    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Войти или создать профиль' })).toBeInTheDocument();
  });

  it('показывает ошибки валидации email и пароля в сценарии входа', () => {
    useUIStore.setState({
      isAuthModalOpen: true,
    });

    render(<AuthModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить вход' }));

    expect(screen.getByText('Укажи корректный email.')).toBeInTheDocument();
    expect(screen.getByText('Пароль должен быть не короче 6 символов.')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('выполняет stub-вход, закрывает модалку и обновляет Header', async () => {
    vi.useFakeTimers();

    render(
      <AppShell>
        <div>Контент страницы</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.click(screen.getByRole('button', { name: 'Представитель спортивных услуг' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'marina@studio.local' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });

    const submitButton = screen.getByRole('button', { name: 'Продолжить вход' });

    fireEvent.click(submitButton);

    expect(screen.getByRole('button', { name: /Продолжить вход/i })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accountType).toBe('provider');
    expect(useAuthStore.getState().user?.email).toBe('marina@studio.local');
    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('marina')).toBeInTheDocument();
  });
});
