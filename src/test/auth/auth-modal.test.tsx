import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthModal } from '@/components/auth/AuthModal';
import { AppShell } from '@/components/layout/AppShell';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
}));
import {
  AUTH_STORE_DEFAULT_STATE,
  MVP_PROVIDER_USER_ID,
  useAuthStore,
} from '@/stores/useAuthStore';
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

  it('для спортсмена привязывает auth-session к fake user id для athlete-only действий', async () => {
    vi.useFakeTimers();

    render(
      <AppShell>
        <div>Контент страницы</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'alexey@sporthub.local' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Продолжить вход' }));

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(useAuthStore.getState().accountType).toBe('athlete');
    expect(useAuthStore.getState().user?.id).toBe(1);
  });

  it('не запускает регистрацию без выбранного типа аккаунта', () => {
    useUIStore.setState({
      isAuthModalOpen: true,
    });

    render(<AuthModal />);

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
    fireEvent.change(screen.getByLabelText('Имя'), {
      target: { value: 'Анна Петрова' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'anna@sporthub.local' },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '89270001010' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });

    const submitButton = screen.getByRole('button', { name: 'Создать аккаунт' });

    expect(submitButton).toBeDisabled();

    fireEvent.click(submitButton);

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Войти или создать профиль' })).toBeInTheDocument();
  });

  it('показывает маску телефона и ошибки валидации в сценарии регистрации', () => {
    useUIStore.setState({
      isAuthModalOpen: true,
    });

    render(<AuthModal />);

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));

    const phoneInput = screen.getByLabelText('Телефон');

    fireEvent.change(phoneInput, {
      target: { value: '89270001010' },
    });

    expect(phoneInput).toHaveValue('+7 (927) 000-10-10');

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'invalid-email' },
    });
    fireEvent.change(phoneInput, {
      target: { value: '123' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));

    expect(screen.getByText('Укажи имя.')).toBeInTheDocument();
    expect(screen.getByText('Укажи корректный email.')).toBeInTheDocument();
    expect(screen.getByText('Укажи телефон в формате +7 (999) 000-00-00.')).toBeInTheDocument();
    expect(screen.getByText('Пароль должен быть не короче 6 символов.')).toBeInTheDocument();
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('выполняет stub-регистрацию, закрывает модалку и сохраняет accountType с телефоном', async () => {
    vi.useFakeTimers();

    render(
      <AppShell>
        <div>Контент страницы</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
    fireEvent.click(screen.getByRole('button', { name: 'Представитель спортивных услуг' }));
    fireEvent.change(screen.getByLabelText('Имя'), {
      target: { value: 'Марина Крылова' },
    });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'marina@studio.local' },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '89270002020' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });

    const submitButton = screen.getByRole('button', { name: 'Создать аккаунт' });

    fireEvent.click(submitButton);

    expect(screen.getByRole('button', { name: /Создать аккаунт/i })).toHaveAttribute(
      'aria-busy',
      'true',
    );
    expect(useAuthStore.getState().isAuthenticated).toBe(false);

    await act(async () => {
      vi.advanceTimersByTime(600);
    });

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().accountType).toBe('provider');
    expect(useAuthStore.getState().user).toEqual({
      id: MVP_PROVIDER_USER_ID,
      name: 'Марина Крылова',
      email: 'marina@studio.local',
      phone: '+7 (927) 000-20-20',
      city: 'Самара',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
  });
});
