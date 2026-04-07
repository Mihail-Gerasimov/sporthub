/**
 * Тесты impersonation flow (Step 17.5).
 * Покрывают: ImpersonationBanner, Header admin-навигация,
 * AuthModal блокировка, redirect при start/stop impersonation.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { Header } from '@/components/layout/Header';
import { AUTH_STORE_DEFAULT_STATE, MVP_ADMIN_USER_ID, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

// Мокаем next/navigation
const mockPush = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
}));

const adminUser = {
  id: MVP_ADMIN_USER_ID,
  name: 'Администратор SportHub',
  email: 'admin@sporthub.local',
};

const athleteUser = {
  id: 1,
  name: 'Алексей Смирнов',
  email: 'alexey@sporthub.local',
};

describe('Impersonation flow (Step 17.5)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
    mockPush.mockClear();
  });

  // --- ImpersonationBanner ---

  describe('ImpersonationBanner', () => {
    it('не отображается без impersonation', () => {
      const { container } = render(<ImpersonationBanner />);

      expect(container.firstChild).toBeNull();
    });

    it('не отображается для admin без impersonation', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: adminUser,
        isAuthenticated: true,
        isAdmin: true,
      });

      const { container } = render(<ImpersonationBanner />);

      expect(container.firstChild).toBeNull();
    });

    it('отображается при активном impersonation с данными пользователя', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountType: 'athlete',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      render(<ImpersonationBanner />);

      expect(screen.getByText(/Алексей Смирнов/)).toBeInTheDocument();
      expect(screen.getByText(/#1/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /вернуться в панель/i })).toBeInTheDocument();
    });

    it('кнопка «Вернуться в панель» вызывает stopImpersonation и redirect', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountType: 'athlete',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      render(<ImpersonationBanner />);

      fireEvent.click(screen.getByRole('button', { name: /вернуться в панель/i }));

      // После stopImpersonation — admin восстановлен
      expect(useAuthStore.getState().user).toEqual(adminUser);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
      expect(mockPush).toHaveBeenCalledWith('/service-portal/dashboard');
    });
  });

  // --- Header admin-навигация ---

  describe('Header для admin', () => {
    it('показывает «Панель управления» для admin без impersonation', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: adminUser,
        isAuthenticated: true,
        isAdmin: true,
      });

      render(<Header />);

      expect(screen.getByRole('link', { name: /панель управления/i })).toHaveAttribute(
        'href',
        '/service-portal/dashboard',
      );
    });

    it('показывает стандартную навигацию для обычного пользователя', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountType: 'athlete',
        isAuthenticated: true,
      });

      render(<Header />);

      expect(screen.queryByRole('link', { name: /панель управления/i })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Перейти в личный кабинет' })).toHaveAttribute(
        'href',
        '/profile/athlete',
      );
    });
  });

  // --- AuthModal блокировка ---

  describe('AuthModal блокировка', () => {
    it('кнопка «Войти» не открывает AuthModal при admin-сессии', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: adminUser,
        isAuthenticated: true,
        isAdmin: true,
      });

      render(<Header />);

      // Admin видит «Панель управления», а не кнопку «Войти» — AuthModal просто не нужна
      expect(screen.queryByRole('button', { name: 'Войти' })).not.toBeInTheDocument();
    });
  });
});
