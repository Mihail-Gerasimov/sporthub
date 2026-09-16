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

// Мокаем next/navigation (Header использует useRouter и usePathname — текущий пункт,
// NotificationBell/useUnreadCountPolling — usePathname)
let pathname = '/';
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => pathname,
}));

import { Header } from '@/components/layout/Header';
import { catalogSectionHref } from '@/lib/catalog-sections';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { HEADER_NAV } from '@/lib/navigation';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { useUIStore } from '@/stores/useUIStore';

describe('Header', () => {
  beforeEach(() => {
    pathname = '/';
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useFilterStore.setState({ discoveryMode: 'clubs' });
    useUIStore.setState({
      isAuthModalOpen: false,
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('в гостевом состоянии показывает кнопку входа; колокольчика у гостя нет', () => {
    render(<Header />);

    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Выйти' })).not.toBeInTheDocument();
    // Колокольчик у гостя из макета не рисуется — у гостя нет ящика (38.108, названо);
    // вошедшему он есть — проверка ниже, иначе это «зелёное от пустоты».
    expect(screen.queryByRole('button', { name: /^Уведомления/ })).not.toBeInTheDocument();
    // Каталог — из словаря секций каталога (38.79c).
    expect(screen.getByRole('link', { name: 'Клубы' })).toHaveAttribute(
      'href',
      catalogSectionHref('results'),
    );
    expect(screen.getByRole('link', { name: 'Тренеры' })).toHaveAttribute(
      'href',
      catalogSectionHref('results'),
    );
  });

  // Шаг 38.108: шапка — ровно макет (`App.tsx` ~2778). Секции витрины «Как это работает»
  // и «Возможности» из навигации ушли; «Мой Спорт» макета — позже, решением заказчика.
  it('навигация — ровно пункты словаря: Клубы · Тренеры · Командные · Маркет, без секций витрины', () => {
    render(<Header />);
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    const links = [...nav.querySelectorAll('a')];
    expect(links.map((a) => a.textContent)).toEqual(['Клубы', 'Тренеры', 'Командные', 'Маркет']);
    expect(links.map((a) => a.getAttribute('href'))).toEqual(HEADER_NAV.map((i) => i.href));
    for (const key of ['steps', 'features'] as const) {
      expect(
        screen.queryByRole('link', { name: HOME_SECTIONS[key].label }),
      ).not.toBeInTheDocument();
    }
    expect(screen.queryByText('Мой Спорт')).not.toBeInTheDocument();
  });

  // Аудит главной 17.09, п. 16: в макете пункты приглушённые, текущий и наведённый —
  // чернилами на подложке; у нас все были чернилами, а наведение — зелёным.
  it('пункты приглушённые; текущий — чернилами на подложке с aria-current, наведение — чернилами', () => {
    pathname = catalogSectionHref('results').split('#')[0];
    useFilterStore.setState({ discoveryMode: 'clubs' });
    render(<Header />);
    const clubs = screen.getByRole('link', { name: 'Клубы' });
    const trainers = screen.getByRole('link', { name: 'Тренеры' });

    expect(clubs).toHaveAttribute('aria-current', 'page');
    expect(clubs.className).toContain('text-ink');
    expect(clubs.className).toContain('bg-bg');
    expect(trainers).not.toHaveAttribute('aria-current');
    expect(trainers.className).toContain('text-muted');
    expect(trainers.className).not.toMatch(/(^|\s)text-ink(\s|$)/);
    for (const link of [clubs, trainers]) {
      expect(link.className).toContain('hover:text-ink');
      expect(link.className).not.toContain('hover:text-lime-hov');
    }
  });

  it('на каталоге текущий пункт следует за режимом стора: «Тренеры» в режиме тренеров', () => {
    pathname = catalogSectionHref('results').split('#')[0];
    useFilterStore.setState({ discoveryMode: 'trainers' });
    render(<Header />);
    expect(screen.getByRole('link', { name: 'Тренеры' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Клубы' })).not.toHaveAttribute('aria-current');
  });

  it('на главной и на «раздел в разработке» текущего пункта нет: адрес ничей или общий', () => {
    for (const path of ['/', '/coming-soon']) {
      pathname = path;
      const { unmount } = render(<Header />);
      const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
      expect([...nav.querySelectorAll('[aria-current]')], path).toEqual([]);
      unmount();
    }
  });

  it('«Войти» несёт значок входа перед текстом (макет LogIn 14)', () => {
    render(<Header />);
    const login = screen.getByRole('button', { name: 'Войти' });
    const icon = login.querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('class')).toContain('size-3.5');
    // Значок — до текста, а не после.
    expect(login.firstElementChild?.contains(icon!)).toBe(true);
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
    fireEvent.click(screen.getByRole('link', { name: 'Командные' }));
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
    // Колокольчик — только вошедшему (пара к гостевой проверке выше).
    expect(screen.getByRole('button', { name: /^Уведомления/ })).toBeInTheDocument();
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
