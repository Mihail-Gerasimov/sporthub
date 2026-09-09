// Шапка. Phase 34 Step 34.48: личность приходит ответом «кто я», а выход ходит
// на сервер — поэтому прежняя проверка «после rehydrate из localStorage шапка
// видит тип аккаунта» заменена на «после ответа сервера шапка видит тип аккаунта».
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// Мокаем next/navigation (Header использует useRouter,
// а NotificationBell/useUnreadCountPolling — usePathname)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
}));

import { Header } from '@/components/layout/Header';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('Header', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('«Выйти» гасит сессию на сервере и возвращает гостевое состояние', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    useAuthStore.getState().login({
      accountType: 'athlete',
      user: {
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<Header />);

    fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
    });

    expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByText('Алексей Смирнов')).not.toBeInTheDocument();
    expect(screen.queryByText('Спортсмен')).not.toBeInTheDocument();
  });

  it('после ответа «кто я» шапка видит правильный тип аккаунта', async () => {
    // Полная перезагрузка страницы: стор пуст, личность приезжает с сервера.
    vi.spyOn(globalThis, 'fetch').mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          success: true,
          data: {
            id: 2,
            name: 'Марина Крылова',
            email: 'marina@studio.local',
            role: 'club_owner',
            capabilities: [],
          },
        }),
    } as unknown as Response);

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    render(<Header />);

    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('Представитель спортивных услуг')).toBeInTheDocument();
  });
});
