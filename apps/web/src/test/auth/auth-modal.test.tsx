// Phase 26 Step 26.7: AuthModal теперь шлёт fetch к /api/auth/login и
// /api/auth/register. Тесты используют fetchMock, старые fake-timers убраны.
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';

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
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('AuthModal', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    localStorage.clear();
    vi.useRealTimers();
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);

    useUIStore.setState({
      isAuthModalOpen: false,
    });

    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function jsonResponse(body: unknown, status: number) {
    return new Response(JSON.stringify(body), {
      status,
      headers: { 'content-type': 'application/json' },
    });
  }

  /**
   * Ответы сервера для сценариев входа и регистрации.
   *
   * ⚠️ Вопрос «кто я» отвечается ОТДЕЛЬНО, как гостю. Общая оболочка задаёт его
   * при монтировании (фаза 34: личность приходит с сервера, а не из localStorage),
   * и без разделения по адресу этот вопрос получал бы ответ входа — тест был бы
   * зелёным не потому, что вход сработал.
   */
  function stubAuthApi(response: Response) {
    fetchMock.mockImplementation((input: RequestInfo | URL) =>
      String(input) === '/api/auth/me'
        ? Promise.resolve(jsonResponse({ success: false, error: 'Требуется вход' }, 401))
        : Promise.resolve(response.clone()),
    );
  }

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
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('выполняет login-fetch, закрывает модалку и обновляет Header', async () => {
    stubAuthApi(
      jsonResponse(
        {
          success: true,
          data: {
            id: 2,
            name: 'Марина Крылова',
            email: 'marina@studio.local',
            phone: '+7 (927) 000-20-20',
            city: 'Самара',
          },
        },
        200,
      ),
    );

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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Продолжить вход' }));
    });

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(useAuthStore.getState().accountType).toBe('provider');
    expect(useAuthStore.getState().user?.email).toBe('marina@studio.local');
    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/login',
      expect.objectContaining({ method: 'POST' }),
    );

    // ⚠️ Пароль обязан УЙТИ НА СЕРВЕР. До фазы 34 форма его спрашивала, но
    // не отправляла: сервер пускал по одной почте, и поле пароля было
    // украшением — вход открывался знанием чужого адреса.
    const loginCall = fetchMock.mock.calls.find(([url]) => url === '/api/auth/login');

    expect(JSON.parse(String((loginCall?.[1] as RequestInit).body))).toEqual({
      email: 'marina@studio.local',
      password: '123456',
      accountType: 'provider',
    });
  });

  it('для спортсмена получает user.id из server response', async () => {
    stubAuthApi(
      jsonResponse(
        {
          success: true,
          data: {
            id: 1,
            name: 'Алексей Смирнов',
            email: 'alexey@sporthub.local',
            phone: '+7 (927) 000-10-10',
            city: 'Самара',
          },
        },
        200,
      ),
    );

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

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Продолжить вход' }));
    });

    await waitFor(() => {
      expect(useAuthStore.getState().accountType).toBe('athlete');
    });
    expect(useAuthStore.getState().user?.id).toBe(1);
  });

  it('login: 404 от сервера показывает ошибку в форме, модалка остаётся', async () => {
    stubAuthApi(jsonResponse({ success: false, error: 'Пользователь не найден' }, 404));

    useUIStore.setState({ isAuthModalOpen: true });
    render(<AuthModal />);

    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'nope@nowhere.local' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Продолжить вход' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Пользователь не найден/i)).toBeInTheDocument();
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Войти или создать профиль' })).toBeInTheDocument();
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
    expect(fetchMock).not.toHaveBeenCalled();
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
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('выполняет register-fetch, закрывает модалку и сохраняет accountType', async () => {
    stubAuthApi(
      jsonResponse(
        {
          success: true,
          data: {
            id: 8,
            name: 'Марина Крылова',
            email: 'marina-new@studio.local',
            phone: '+7 (927) 000-20-20',
            city: 'Самара',
          },
        },
        201,
      ),
    );

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
      target: { value: 'marina-new@studio.local' },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), {
      target: { value: '89270002020' },
    });
    fireEvent.change(screen.getByLabelText('Пароль'), {
      target: { value: '123456' },
    });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    });

    await waitFor(() => {
      expect(useAuthStore.getState().isAuthenticated).toBe(true);
    });
    expect(useAuthStore.getState().accountType).toBe('provider');
    expect(useAuthStore.getState().user).toMatchObject({
      id: 8,
      name: 'Марина Крылова',
      email: 'marina-new@studio.local',
    });
    expect(
      screen.queryByRole('dialog', { name: 'Войти или создать профиль' }),
    ).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('register: 409 от сервера показывает «Email уже зарегистрирован», модалка остаётся', async () => {
    stubAuthApi(jsonResponse({ success: false, error: 'Email уже зарегистрирован' }, 409));

    useUIStore.setState({ isAuthModalOpen: true });
    render(<AuthModal />);

    fireEvent.click(screen.getByRole('tab', { name: 'Регистрация' }));
    fireEvent.click(screen.getByRole('button', { name: 'Спортсмен' }));
    fireEvent.change(screen.getByLabelText('Имя'), { target: { value: 'Дубликат' } });
    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'alexey@sporthub.local' },
    });
    fireEvent.change(screen.getByLabelText('Телефон'), { target: { value: '89270001010' } });
    fireEvent.change(screen.getByLabelText('Пароль'), { target: { value: '123456' } });

    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Создать аккаунт' }));
    });

    await waitFor(() => {
      expect(screen.getByText(/Email уже зарегистрирован/i)).toBeInTheDocument();
    });
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(screen.getByRole('dialog', { name: 'Войти или создать профиль' })).toBeInTheDocument();
  });
});
