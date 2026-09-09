// Восстановление пароля на фронте (шаг 34.73).
//
// Проверяется ход целиком: «Забыли пароль?» в модалке входа → заявка уходит на
// сервер → человеку показывается ОДИН ответ, не зависящий от того, заведена почта
// или нет. Затем страница по ссылке: успешная смена и отказ по негодной ссылке.
//
// ⚠️ Про «неразличимость ответов» фронт может проверить только своё: что он не
// придумывает разных сообщений сам. Одинаковость ответов сервера закреплена
// отдельно, в наборе бэкенда.

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { AuthModal } from '@/components/auth/AuthModal';
import { ResetPasswordForm } from '@/components/auth/ResetPasswordForm';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  usePathname: () => '/',
}));

const fetchMock = vi.fn();

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

beforeEach(() => {
  localStorage.clear();
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  useUIStore.setState({ isAuthModalOpen: true });
  useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Заявка на восстановление в модалке входа', () => {
  /** Открыть панель восстановления из вкладки входа. */
  function openForgotPanel() {
    render(<AuthModal />);
    fireEvent.click(screen.getByRole('button', { name: 'Забыли пароль?' }));
  }

  it('«Забыли пароль?» открывает форму заявки и прячет вкладки', () => {
    openForgotPanel();

    expect(screen.getByRole('form', { name: 'Восстановление пароля' })).toBeInTheDocument();
    // Вкладки убраны намеренно: восстановление — тупиковая ветка входа,
    // а не третий равноправный сценарий.
    expect(screen.queryByRole('tab', { name: 'Вход' })).not.toBeInTheDocument();
  });

  it('заявка уходит на сервер, ответ показывается один и тот же', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }, 200));

    openForgotPanel();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'athlete@test.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    await waitFor(() => {
      expect(screen.getByText(/Если такой адрес зарегистрирован/)).toBeInTheDocument();
    });

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('/api/auth/forgot-password');
    expect(JSON.parse(options.body)).toEqual({ email: 'athlete@test.local' });
    // Ни слова о том, найден адрес или нет: сообщение не зависит от ответа.
    expect(screen.queryByText(/не найден/i)).not.toBeInTheDocument();
  });

  it('некорректная почта не доходит до сервера', () => {
    openForgotPanel();

    fireEvent.change(screen.getByLabelText('Email'), { target: { value: 'не почта' } });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    expect(screen.getByText('Укажи корректный email.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('отказ по частоте показывается человеку текстом сервера', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse({ success: false, error: 'Слишком много запросов. Повторите позже.' }, 429),
    );

    openForgotPanel();

    fireEvent.change(screen.getByLabelText('Email'), {
      target: { value: 'athlete@test.local' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Отправить ссылку' }));

    await waitFor(() => {
      expect(screen.getByText('Слишком много запросов. Повторите позже.')).toBeInTheDocument();
    });
  });

  it('возврат ко входу восстанавливает вкладки', () => {
    openForgotPanel();

    fireEvent.click(screen.getByRole('button', { name: 'Вернуться ко входу' }));

    expect(screen.getByRole('tab', { name: 'Вход' })).toBeInTheDocument();
  });
});

describe('Страница смены пароля по ссылке', () => {
  it('без значения в адресе форма не показывается вовсе', () => {
    render(<ResetPasswordForm token="" />);

    expect(screen.getByText('Ссылка неполная')).toBeInTheDocument();
    expect(screen.queryByLabelText('Новый пароль')).not.toBeInTheDocument();
  });

  it('несовпадающие пароли не доходят до сервера', () => {
    render(<ResetPasswordForm token="ссылка" />);

    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'пароль-1' } });
    fireEvent.change(screen.getByLabelText('Повтори пароль'), { target: { value: 'пароль-2' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }));

    expect(screen.getByText('Пароли не совпадают.')).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('успешная смена показывает исход и чистит состояние входа', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ success: true }, 200));
    useAuthStore.setState({ ...AUTH_STORE_DEFAULT_STATE, isAuthenticated: true });

    render(<ResetPasswordForm token="ссылка" />);

    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'пароль-1' } });
    fireEvent.change(screen.getByLabelText('Повтори пароль'), { target: { value: 'пароль-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }));

    await waitFor(() => {
      expect(screen.getByText('Пароль изменён')).toBeInTheDocument();
    });

    const [url, options] = fetchMock.mock.calls[0];

    expect(url).toBe('/api/auth/reset-password');
    expect(JSON.parse(options.body)).toEqual({ token: 'ссылка', password: 'пароль-1' });
    // Сервер погасил все сессии — браузер не должен продолжать считать себя вошедшим.
    expect(useAuthStore.getState().isAuthenticated).toBe(false);
  });

  it('истёкшая ссылка показывает отказ сервера как есть', async () => {
    fetchMock.mockResolvedValue(
      jsonResponse(
        { success: false, error: 'Ссылка восстановления недействительна или устарела' },
        400,
      ),
    );

    render(<ResetPasswordForm token="протухшая" />);

    fireEvent.change(screen.getByLabelText('Новый пароль'), { target: { value: 'пароль-1' } });
    fireEvent.change(screen.getByLabelText('Повтори пароль'), { target: { value: 'пароль-1' } });
    fireEvent.click(screen.getByRole('button', { name: 'Сменить пароль' }));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ссылка восстановления недействительна или устарела',
      );
    });

    expect(screen.queryByText('Пароль изменён')).not.toBeInTheDocument();
  });
});
