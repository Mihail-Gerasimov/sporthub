/**
 * Тесты impersonation flow (Step 17.5).
 * Покрывают: ImpersonationBanner, Header admin-навигация,
 * AuthModal блокировка, redirect при start/stop impersonation.
 */
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ImpersonationBanner } from '@/components/admin/ImpersonationBanner';
import { Header } from '@/components/layout/Header';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

// Мокаем next/navigation. Phase 27 Step 27.15: refresh вынесен в именованный
// mock, чтобы можно было ассертить его вызов после stopImpersonation.
// Phase 30.6: replace вынесен в именованный mock — обычный logout теперь
// делает router.replace('/') + router.refresh().
const mockPush = vi.fn();
const mockRefresh = vi.fn();
const mockReplace = vi.fn();

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    refresh: mockRefresh,
  }),
  usePathname: () => '/',
}));

/**
 * Стенд сессии: работу от чужого лица начинает и заканчивает сервер, а стор
 * после каждого такого шага перечитывает «кто я».
 */
function stubSession(me: Record<string, unknown>) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    if (String(input) === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ success: true, data: me }),
      } as unknown as Response);
    }

    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ success: true }),
    } as unknown as Response);
  });
}

const ADMIN_USER_ID = 3;

const adminUser = {
  id: ADMIN_USER_ID,
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
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
    mockPush.mockClear();
    mockRefresh.mockClear();
    mockReplace.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      render(<ImpersonationBanner />);

      expect(screen.getByText(/Алексей Смирнов/)).toBeInTheDocument();
      expect(screen.getByText(/#1/)).toBeInTheDocument();
      // Настоящий исполнитель тоже на виду: подмену нельзя принять за свой вход.
      expect(screen.getByText(/Администратор SportHub/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /вернуться в панель/i })).toBeInTheDocument();
    });

    it('переживает перезагрузку: состояние восстановлено ответом сервера', async () => {
      // ⚠️ Тот самый дефект: после полной перезагрузки стор пуст, а сессия на
      // сервере всё ещё подменённая. Плашка обязана вернуться вместе с ней.
      stubSession({
        ...athleteUser,
        capabilities: [],
        impersonating: true,
        actorName: adminUser.name,
      });

      const { rerender } = render(<ImpersonationBanner />);

      await act(async () => {
        await useAuthStore.getState().loadSession();
      });

      rerender(<ImpersonationBanner />);

      expect(screen.getByText(/Алексей Смирнов/)).toBeInTheDocument();
      expect(screen.getByText(/Администратор SportHub/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /вернуться в панель/i })).toBeInTheDocument();
    });

    it('использует плотный заметный фон (не полупрозрачный)', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      const { container } = render(<ImpersonationBanner />);

      const banner = container.firstChild as HTMLElement;
      // Фон должен быть плотным (bg-warning), а не полупрозрачным (bg-warning/10)
      expect(banner.className).toContain('bg-warning');
      expect(banner.className).not.toMatch(/bg-warning\/\d/);
    });

    it('кнопка «Вернуться в панель» гасит подмену НА СЕРВЕРЕ и делает redirect', async () => {
      const fetchSpy = stubSession({ ...adminUser, accountKind: 'admin', capabilities: [] });

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      render(<ImpersonationBanner />);

      fireEvent.click(screen.getByRole('button', { name: /вернуться в панель/i }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/service-portal/dashboard');
      });

      // Возврат делает сервер: очистить только стор — значит оставить
      // подменённую сессию живой.
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/impersonate/stop', { method: 'POST' });
      // После stopImpersonation — admin восстановлен
      expect(useAuthStore.getState().user?.id).toBe(ADMIN_USER_ID);
      expect(useAuthStore.getState().isImpersonating).toBe(false);
      // Phase 27 Step 27.15: refresh вызван после push, иначе RSC-кэш отрисует
      // /service-portal/dashboard под старым cookie (с подменённым userId).
      expect(mockRefresh).toHaveBeenCalled();
      // Phase 30.5: порядок push → refresh критичен (refresh инвалидирует RSC,
      // push должен успеть стартовать навигацию первым).
      expect(mockPush.mock.invocationCallOrder[0]).toBeLessThan(
        mockRefresh.mock.invocationCallOrder[0],
      );
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
        accountKind: 'person',
        isAuthenticated: true,
      });

      render(<Header />);

      expect(screen.queryByRole('link', { name: /панель управления/i })).not.toBeInTheDocument();
      expect(screen.getByRole('link', { name: /Перейти в кабинет/ })).toHaveAttribute(
        'href',
        '/profile/me',
      );
    });
  });

  // --- Header «Выйти» при impersonation ---

  describe('Header logout при impersonation', () => {
    it('«Выйти» при impersonation вызывает stopImpersonation, push в панель и refresh', async () => {
      stubSession({ ...adminUser, accountKind: 'admin', capabilities: [] });

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
        isAdmin: true,
        isImpersonating: true,
        adminOriginalUser: adminUser,
      });

      render(<Header />);

      fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/service-portal/dashboard');
      });

      // После stopImpersonation — admin-сессия сохранена
      const state = useAuthStore.getState();

      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.isAdmin).toBe(true);
      expect(state.isImpersonating).toBe(false);
      expect(state.isAuthenticated).toBe(true);
      // Phase 30.6: refresh добавлен в impersonation-ветку Header.handleLogout —
      // симметрично ImpersonationBanner.handleStop, инвалидирует RSC-кэш.
      expect(mockRefresh).toHaveBeenCalled();
    });

    it('«Выйти» без имперсонизации гасит сессию, делает replace на / и refresh', async () => {
      const fetchSpy = vi
        .spyOn(globalThis, 'fetch')
        .mockResolvedValue({ ok: true, status: 200 } as Response);

      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: athleteUser,
        accountKind: 'person',
        isAuthenticated: true,
      });

      render(<Header />);

      fireEvent.click(screen.getByRole('button', { name: 'Выйти' }));

      await waitFor(() => {
        expect(mockReplace).toHaveBeenCalledWith('/');
      });

      const state = useAuthStore.getState();

      // ⚠️ Уход на главную происходит ПОСЛЕ ответа сервера: иначе главная
      // отрисовалась бы под ещё живой сессией.
      expect(fetchSpy).toHaveBeenCalledWith('/api/auth/logout', { method: 'POST' });
      expect(state.isAuthenticated).toBe(false);
      expect(state.user).toBeNull();
      // Phase 30.6: обычный logout редиректит на главную и инвалидирует RSC-кэш —
      // иначе пользователь застревает на /profile/*/dashboard с AccessDeniedCard
      // в кривом узком layout. replace, не push — history-back не должен возвращать на ЛК.
      expect(mockReplace).toHaveBeenCalledWith('/');
      expect(mockRefresh).toHaveBeenCalled();
      expect(mockPush).not.toHaveBeenCalled();
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
