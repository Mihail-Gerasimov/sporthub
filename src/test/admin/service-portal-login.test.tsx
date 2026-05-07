/**
 * Тесты страницы входа /service-portal и admin guard (Step 17.3).
 * Покрывают: рендер формы, фейк-вход admin, отказ для чужого email,
 * guard redirect для неавторизованного доступа.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { ServicePortalLoginForm } from '@/components/admin/ServicePortalLoginForm';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { AUTH_STORE_DEFAULT_STATE, MVP_ADMIN_USER_ID, useAuthStore } from '@/stores/useAuthStore';

// Мокаем next/navigation
const mockPush = vi.fn();
const mockReplace = vi.fn();
const mockRefresh = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
}));

describe('Service Portal Login (Step 17.3)', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRefresh.mockClear();
  });

  // --- Рендер формы ---

  describe('ServicePortalLoginForm', () => {
    it('рендерит форму с полями email и пароль', () => {
      render(<ServicePortalLoginForm />);

      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    });

    it('фейк-вход работает для admin seed email', async () => {
      vi.useFakeTimers();

      render(<ServicePortalLoginForm />);

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'admin@sporthub.local' },
      });
      fireEvent.change(screen.getByLabelText('Пароль'), {
        target: { value: 'admin-sporthub-2026' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.user?.id).toBe(MVP_ADMIN_USER_ID);
      expect(state.accountType).toBeNull();
      expect(mockPush).toHaveBeenCalledWith('/service-portal/dashboard');
      // Phase 30.1: refresh вызывается после push для инвалидации RSC-кэша.
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(
        mockRefresh.mock.invocationCallOrder[0],
      );

      vi.useRealTimers();
    });

    it('фейк-вход работает для любого валидного email', async () => {
      vi.useFakeTimers();

      render(<ServicePortalLoginForm />);

      fireEvent.change(screen.getByLabelText('Email'), {
        target: { value: 'random@user.local' },
      });
      fireEvent.change(screen.getByLabelText('Пароль'), {
        target: { value: '123456' },
      });
      fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

      await act(async () => {
        vi.advanceTimersByTime(600);
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.user?.id).toBe(MVP_ADMIN_USER_ID);
      expect(mockPush).toHaveBeenCalledWith('/service-portal/dashboard');

      vi.useRealTimers();
    });

    it('показывает ошибки валидации для пустых полей', () => {
      render(<ServicePortalLoginForm />);

      fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

      expect(screen.getByText(/корректный email/i)).toBeInTheDocument();
    });
  });

  // --- AdminGuard ---

  describe('AdminGuard', () => {
    it('редиректит на /service-portal если не авторизован', () => {
      render(
        <AdminGuard>
          <div>Защищённый контент</div>
        </AdminGuard>,
      );

      expect(screen.queryByText('Защищённый контент')).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/service-portal');
    });

    it('редиректит на /service-portal если авторизован но не admin', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: { name: 'Тест', email: 'test@test.local' },
        isAuthenticated: true,
        accountType: 'athlete',
        isAdmin: false,
      });

      render(
        <AdminGuard>
          <div>Защищённый контент</div>
        </AdminGuard>,
      );

      expect(screen.queryByText('Защищённый контент')).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/service-portal');
    });

    it('показывает контент если авторизован как admin', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: { id: MVP_ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
        isAuthenticated: true,
        isAdmin: true,
      });

      render(
        <AdminGuard>
          <div>Защищённый контент</div>
        </AdminGuard>,
      );

      expect(screen.getByText('Защищённый контент')).toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });
  });
});
