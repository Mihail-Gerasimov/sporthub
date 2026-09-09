/**
 * Вход в сервисную панель и проверка доступа в браузере (Step 17.3).
 *
 * Phase 34 Step 34.48: форма больше не «входит» сама. Прежние тесты проверяли
 * фейк-вход — что подходит ЛЮБОЙ email и любой пароль от шести символов, потому
 * что форма никуда не ходила и собирала администратора из констант. Теперь
 * проверяется настоящий путь: запрос к `POST /api/auth/login`, затем «кто я»,
 * и признак администратора ставится ТОЛЬКО если роль пришла с сервера.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ServicePortalLoginForm } from '@/components/admin/ServicePortalLoginForm';
import { AdminGuard } from '@/components/admin/AdminGuard';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';

const ADMIN_USER_ID = 3;

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

/**
 * Ответы сервера: вход и следом «кто я».
 *
 * ⚠️ Шаг 35.34. Признак служебной записи — `accountKind`, а не роль: ролей
 * больше нет. Поле `role` в ответе оставлено до отдельного шага, снимающего
 * колонку, и на решение формы уже не влияет.
 */
function stubServer(role: string, loginOk = true) {
  return vi.spyOn(globalThis, 'fetch').mockImplementation((input: RequestInfo | URL) => {
    const url = String(input);

    if (url === '/api/auth/login') {
      return Promise.resolve({
        ok: loginOk,
        status: loginOk ? 200 : 401,
        json: () => Promise.resolve({ success: loginOk }),
      } as Response);
    }

    if (url === '/api/auth/me') {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            success: true,
            data: {
              id: ADMIN_USER_ID,
              name: 'Администратор SportHub',
              email: 'admin@sporthub.local',
              role,
              accountKind: role === 'admin' ? 'admin' : 'person',
              faces: [],
              capabilities: [],
            },
          }),
      } as unknown as Response);
    }

    return Promise.reject(new Error(`Неожиданный запрос: ${url}`));
  });
}

function fillAndSubmit(email: string, password: string) {
  fireEvent.change(screen.getByLabelText('Email'), { target: { value: email } });
  fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: password } });
  fireEvent.click(screen.getByRole('button', { name: 'Войти' }));
}

describe('Service Portal Login (Step 17.3)', () => {
  beforeEach(() => {
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    mockPush.mockClear();
    mockReplace.mockClear();
    mockRefresh.mockClear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // --- Рендер формы ---

  describe('ServicePortalLoginForm', () => {
    it('рендерит форму с полями email и пароль', () => {
      render(<ServicePortalLoginForm />);

      expect(screen.getByLabelText('Email')).toBeInTheDocument();
      expect(screen.getByLabelText('Пароль')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    });

    it('не подсказывает почту администратора', () => {
      // Она лежала прямо в разметке формы, открытой кому угодно: половина
      // учётных данных выдавалась до всякой попытки входа.
      const { container } = render(<ServicePortalLoginForm />);

      expect(container.innerHTML).not.toContain('admin@sporthub.local');
    });

    it('отправляет введённые данные на сервер и не выдумывает личность', async () => {
      const fetchSpy = stubServer('admin');

      render(<ServicePortalLoginForm />);
      fillAndSubmit('admin@sporthub.local', 'admin-sporthub-2026');

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/service-portal/dashboard');
      });

      const [url, init] = fetchSpy.mock.calls[0] as [string, RequestInit];

      expect(url).toBe('/api/auth/login');
      // ⚠️ Шаг 35.35. Служебность входа названа ЯВНО. Прежде её выражало
      // ОТСУТСТВИЕ поля `accountType`, то есть признак, который ломается
      // молча: уберёт кто-нибудь лишнее поле из тела — и служебный вход
      // станет обычным, а тест этого не заметит.
      expect(JSON.parse(String(init.body))).toEqual({
        email: 'admin@sporthub.local',
        password: 'admin-sporthub-2026',
        portal: 'service',
      });

      const state = useAuthStore.getState();

      expect(state.isAuthenticated).toBe(true);
      expect(state.isAdmin).toBe(true);
      expect(state.user?.id).toBe(ADMIN_USER_ID);
      expect(state.accountKind).toBe('admin');
      // Phase 30.1 (final): refresh НЕ вызывается — он отменял push в dev-mode.
      expect(mockRefresh).not.toHaveBeenCalled();
    });

    it('отказ сервера не пускает в панель', async () => {
      // Раньше входил ЛЮБОЙ email с любым паролем от шести символов: форма
      // никуда не ходила и сама объявляла вход состоявшимся.
      stubServer('admin', false);

      render(<ServicePortalLoginForm />);
      fillAndSubmit('random@user.local', '123456');

      expect(await screen.findByText('Неверная почта или пароль.')).toBeInTheDocument();
      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(useAuthStore.getState().isAuthenticated).toBe(false);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('верный пароль обычного человека не даёт доступа к панели', async () => {
      // Вид учётной записи решает сервер, а не форма: вход прошёл, но панель не для него.
      stubServer('athlete');

      render(<ServicePortalLoginForm />);
      fillAndSubmit('alexey@sporthub.local', 'athlete-pass');

      expect(
        await screen.findByText('У этой учётной записи нет доступа к сервисной панели.'),
      ).toBeInTheDocument();
      expect(useAuthStore.getState().isAdmin).toBe(false);
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('показывает ошибки валидации для пустых полей', () => {
      render(<ServicePortalLoginForm />);

      fireEvent.click(screen.getByRole('button', { name: 'Войти' }));

      expect(screen.getByText(/корректный email/i)).toBeInTheDocument();
    });
  });

  // --- AdminGuard ---

  describe('AdminGuard', () => {
    it('уводит гостя, когда ответ «кто я» уже получен', () => {
      useAuthStore.setState({ ...AUTH_STORE_DEFAULT_STATE, status: 'ready' });

      render(
        <AdminGuard>
          <div>Защищённый контент</div>
        </AdminGuard>,
      );

      expect(screen.queryByText('Защищённый контент')).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/service-portal');
    });

    it('уводит вошедшего не-администратора', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: { name: 'Тест', email: 'test@test.local' },
        isAuthenticated: true,
        accountKind: 'person',
        isAdmin: false,
        status: 'ready',
      });

      render(
        <AdminGuard>
          <div>Защищённый контент</div>
        </AdminGuard>,
      );

      expect(screen.queryByText('Защищённый контент')).not.toBeInTheDocument();
      expect(mockReplace).toHaveBeenCalledWith('/service-portal');
    });

    it('НЕ уводит, пока ответ «кто я» ещё не пришёл', () => {
      // ⚠️ Иначе администратор вылетал бы на форму входа при каждой перезагрузке
      // страницы: до фазы 34 личность лежала в localStorage и была известна сразу,
      // теперь её приносит запрос, и первые миллисекунды стор пуст.
      useAuthStore.setState({ ...AUTH_STORE_DEFAULT_STATE, status: 'unknown' });

      render(
        <AdminGuard>
          <div>Защищённый контент</div>
        </AdminGuard>,
      );

      expect(screen.queryByText('Защищённый контент')).not.toBeInTheDocument();
      expect(mockReplace).not.toHaveBeenCalled();
    });

    it('показывает контент если вошёл как admin', () => {
      useAuthStore.setState({
        ...AUTH_STORE_DEFAULT_STATE,
        user: { id: ADMIN_USER_ID, name: 'Admin', email: 'admin@sporthub.local' },
        isAuthenticated: true,
        isAdmin: true,
        status: 'ready',
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
