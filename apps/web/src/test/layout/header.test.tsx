// Шапка. Phase 34 Step 34.48: личность приходит ответом «кто я», а выход ходит
// на сервер — поэтому прежняя проверка «после rehydrate из localStorage шапка
// видит тип аккаунта» заменена на «после ответа сервера шапка видит личность».
//
// ⚠️ Фаза 35, шаг 35.36 (ловушка 7.11). Адрес кабинета брался из типа учётной
// записи. Типа не стало — и ссылка исчезла бы у ВСЕХ молча: шапка просто
// перестала бы её рисовать, без ошибки и без красного теста. Поэтому здесь
// проверяются оба случая модели: человек без лиц услуг (ведёт в личный кабинет)
// и человек с лицом (ведёт в кабинет лица, подписан именем лица).
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

  it('у человека с лицом услуг ссылка ведёт в кабинет ЛИЦА и подписана его именем', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { name: 'Марина Крылова', email: 'marina@studio.local' },
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      status: 'ready',
    });

    render(<Header />);

    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('CrossFit Garage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Перейти в личный кабинет' })).toHaveAttribute(
      'href',
      '/profile/club/3',
    );
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('у человека без лиц услуг ссылка ведёт в личный кабинет и не пропадает', () => {
    useAuthStore.getState().login({
      user: {
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<Header />);

    expect(screen.getByRole('link', { name: 'Перейти в личный кабинет' })).toHaveAttribute(
      'href',
      '/profile/me',
    );
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  it('«Выйти» гасит сессию на сервере и возвращает гостевое состояние', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue({ ok: true, status: 200 } as Response);

    useAuthStore.getState().login({
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

  it('после ответа «кто я» шапка видит лицо услуг', async () => {
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
            accountKind: 'person',
            faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
            capabilities: [],
          },
        }),
    } as unknown as Response);

    await act(async () => {
      await useAuthStore.getState().loadSession();
    });

    render(<Header />);

    expect(screen.getByText('Марина Крылова')).toBeInTheDocument();
    expect(screen.getByText('CrossFit Garage')).toBeInTheDocument();
  });
});
