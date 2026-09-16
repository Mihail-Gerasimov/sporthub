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
import { catalogSectionHref } from '@/lib/catalog-sections';
import { useFilterStore } from '@/stores/useFilterStore';
import { HOME_SECTIONS } from '@/lib/home-sections';
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
    // Пункты — из словаря навигации: секции витрины адресом из словаря секций (38.89:
    // «Подборки» врала), каталог — из словаря секций каталога (38.79c).
    for (const key of ['steps', 'features'] as const) {
      expect(screen.getByRole('link', { name: HOME_SECTIONS[key].label })).toHaveAttribute(
        'href',
        `/#${HOME_SECTIONS[key].id}`,
      );
    }
    expect(screen.getByRole('link', { name: 'Клубы' })).toHaveAttribute(
      'href',
      catalogSectionHref('results'),
    );
    expect(screen.getByRole('link', { name: 'Тренеры' })).toHaveAttribute(
      'href',
      catalogSectionHref('results'),
    );
  });

  it('«Тренеры» и «Клубы» переключают режим стора на клике — как чип сегмента (38.79c)', () => {
    useFilterStore.setState({ discoveryMode: 'clubs' });
    render(<Header />);
    fireEvent.click(screen.getByRole('link', { name: 'Тренеры' }));
    expect(useFilterStore.getState().discoveryMode).toBe('trainers');
    fireEvent.click(screen.getByRole('link', { name: 'Клубы' }));
    expect(useFilterStore.getState().discoveryMode).toBe('clubs');
    // Пункт без режима стор не трогает.
    useFilterStore.setState({ discoveryMode: 'trainers' });
    fireEvent.click(screen.getByRole('link', { name: HOME_SECTIONS.steps.label }));
    expect(useFilterStore.getState().discoveryMode).toBe('trainers');
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

    // Имя стоит и в плашке, и в подсказке аватара (38.60) — берём плашку.
    expect(screen.getByText('Марина Крылова', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('CrossFit Garage')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Перейти в кабинет/ })).toHaveAttribute(
      'href',
      '/profile/club/3',
    );
    expect(screen.getByRole('button', { name: 'Выйти' })).toBeInTheDocument();
  });

  // Шаг 38.60: полное имя — подсказкой на аватаре (наведение, фокус, касание, диктор),
  // а не `title=` на обрезанной строке, которого с клавиатуры не достать.
  it('полное имя — описанием аватара через Hint, без title на плашке', () => {
    useAuthStore.setState({
      ...AUTH_STORE_DEFAULT_STATE,
      user: { name: 'Марина Крылова-Достоевская', email: 'marina@studio.local' },
      isAuthenticated: true,
      accountKind: 'person',
      faces: [{ kind: 'club', id: 3, name: 'CrossFit Garage' }],
      activeFaceKey: 'club:3',
      status: 'ready',
    });
    render(<Header />);
    const avatar = screen.getByRole('link', { name: /Перейти в кабинет/ });
    const describedBy = avatar.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)?.textContent).toBe('Марина Крылова-Достоевская');
    expect(screen.getByText('Марина Крылова-Достоевская', { selector: 'p' })).not.toHaveAttribute(
      'title',
    );
  });

  it('у человека без лиц услуг ссылка ведёт в личный кабинет и не пропадает', () => {
    useAuthStore.getState().login({
      user: {
        name: 'Алексей Смирнов',
        email: 'alexey@sporthub.local',
      },
    });

    render(<Header />);

    expect(screen.getByRole('link', { name: /Перейти в кабинет/ })).toHaveAttribute(
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

    // Имя стоит и в плашке, и в подсказке аватара (38.60) — берём плашку.
    expect(screen.getByText('Марина Крылова', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('CrossFit Garage')).toBeInTheDocument();
  });
});
