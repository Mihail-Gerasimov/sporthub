/**
 * Мобильный док (шаг 38.62): пункты из словаря плюс «Мой», подсветка активного
 * по адресу И по хэшу, скрытие при открытом меню шапки.
 * Шаг 38.108 — док ровно `BOTTOM_TABS` макета (`App.tsx` ~2700): Главная (`/`),
 * Клубы (`/catalog`, режим клубов), Лента и Маркет (обе → «в разработке»), Мой —
 * гостю кнопка входа, вошедшему ссылка в личный кабинет. «Слоты» из дока ушли —
 * к ним ведёт «Все слоты» из карточки героя.
 * Подсветка по паре «путь + хэш» сохранена (38.79c): хэш страницы не гасит её вкладку;
 * адрес, который делят два пункта («Лента» и «Маркет»), не подсвечивает никого —
 * какой из них выбран, по адресу не узнать (названо).
 * Шаг 38.86 — узкие экраны: док есть до `md` (768) и скрыт с неё; в шапке навигация
 * видна с точки `menu` (960), ниже — кнопка меню; обе точки — из словаря брейкпоинтов.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { Header } from '@/components/layout/Header';
import { MobileNav } from '@/components/layout/MobileNav';
import { MOBILE_NAV } from '@/lib/navigation';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';
import { useUIStore } from '@/stores/useUIStore';

function setHash(hash: string) {
  window.location.hash = hash;
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

/** Вошедший человек без лиц услуг — «Мой» ведёт в личный кабинет. */
function signIn() {
  useAuthStore.getState().login({
    user: { name: 'Алексей Смирнов', email: 'alexey@sporthub.local' },
  });
}

describe('MobileNav', () => {
  beforeEach(() => {
    pathname = '/';
    window.location.hash = '';
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isHeaderMenuOpen: false, isAuthModalOpen: false });
    useFilterStore.setState({ discoveryMode: 'clubs' });
  });

  it('пункты — BOTTOM_TABS макета: словарь плюс «Мой»; адреса совпадают со словарём', () => {
    signIn();
    render(<MobileNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual(['Главная', 'Клубы', 'Лента', 'Маркет', 'Мой']);
    expect(links.map((a) => a.textContent)).toEqual([...MOBILE_NAV.map((i) => i.label), 'Мой']);
    for (const item of MOBILE_NAV) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
    // «Слоты» и «Каталог» прежнего дока ушли; «Профиль» переименован в «Мой».
    for (const gone of ['Слоты', 'Каталог', 'Профиль']) {
      expect(screen.queryByRole('link', { name: gone })).not.toBeInTheDocument();
    }
  });

  it('«Мой» вошедшему — ссылка в личный кабинет, без прохода через прежний адрес', () => {
    signIn();
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Мой' })).toHaveAttribute(
      'href',
      '/profile/me/dashboard',
    );
    expect(screen.queryByRole('button', { name: 'Мой' })).not.toBeInTheDocument();
  });

  it('«Мой» гостю — кнопка входа: открывает модалку, ссылки в кабинет нет', () => {
    render(<MobileNav />);
    expect(screen.queryByRole('link', { name: 'Мой' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Мой' }));
    expect(useUIStore.getState().isAuthModalOpen).toBe(true);
  });

  it('«Клубы» ставит режим клубов на клике, как в шапке; «Главная» стор не трогает', () => {
    useFilterStore.setState({ discoveryMode: 'trainers' });
    render(<MobileNav />);
    fireEvent.click(screen.getByRole('link', { name: 'Клубы' }));
    expect(useFilterStore.getState().discoveryMode).toBe('clubs');

    useFilterStore.setState({ discoveryMode: 'trainers' });
    fireEvent.click(screen.getByRole('link', { name: 'Главная' }));
    expect(useFilterStore.getState().discoveryMode).toBe('trainers');
  });

  it('на каталоге активны «Клубы» — без хэша и на любом якоре страницы', () => {
    pathname = '/catalog';
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Клубы' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');

    // Хэш страницы не гасит её вкладку: «Слотов» в доке нет, якорь остаётся при «Клубах».
    for (const hash of ['#results', '#availability', '#map']) {
      setHash(hash);
      expect(screen.getByRole('link', { name: 'Клубы' })).toHaveAttribute('aria-current', 'page');
    }
  });

  // ⚠️ Клик по пункту — без ручного диспатча событий: `next/link` идёт через
  // `pushState`, на который `hashchange` не поднимается; подсветку ставит сам клик.
  it('клик по «Клубы» с чужим хэшем сбрасывает хэш и держит подсветку на «Клубах»', () => {
    pathname = '/catalog';
    window.location.hash = '#availability';
    render(<MobileNav />);
    fireEvent.click(screen.getByRole('link', { name: 'Клубы' }));
    expect(screen.getByRole('link', { name: 'Клубы' })).toHaveAttribute('aria-current', 'page');
  });

  it('«назад/вперёд» (popstate) перечитывает хэш из адреса, вкладка страницы остаётся', () => {
    pathname = '/catalog';
    render(<MobileNav />);
    window.location.hash = '#availability';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('link', { name: 'Клубы' })).toHaveAttribute('aria-current', 'page');
  });

  it('на главной активна «Главная» — и без хэша, и с якорем витрины', () => {
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Клубы' })).not.toHaveAttribute('aria-current');

    setHash('#steps');
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Клубы' })).not.toHaveAttribute('aria-current');
  });

  it('на «раздел в разработке» не подсвечен никто: адрес делят «Лента» и «Маркет»', () => {
    pathname = '/coming-soon';
    render(<MobileNav />);
    for (const label of ['Лента', 'Маркет', 'Главная', 'Клубы']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  });

  it('в кабинете активен «Мой» по корню адреса, остальные не подсвечиваются', () => {
    signIn();
    pathname = '/profile/club/3/bookings';
    window.location.hash = '#availability';
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Мой' })).toHaveAttribute('aria-current', 'page');
    for (const label of ['Главная', 'Клубы', 'Лента', 'Маркет']) {
      expect(screen.getByRole('link', { name: label })).not.toHaveAttribute('aria-current');
    }
  });

  it('при открытом меню шапки док не рисуется — поверх оверлея ничего не остаётся', () => {
    render(<MobileNav />);
    expect(screen.getByRole('navigation', { name: 'Мобильная навигация' })).toBeInTheDocument();

    act(() => useUIStore.getState().setHeaderMenuOpen(true));
    expect(
      screen.queryByRole('navigation', { name: 'Мобильная навигация' }),
    ).not.toBeInTheDocument();

    act(() => useUIStore.getState().setHeaderMenuOpen(false));
    expect(screen.getByRole('navigation', { name: 'Мобильная навигация' })).toBeInTheDocument();
  });
});

describe('Узкие экраны (38.86): док до md, навигация шапки с точки menu', () => {
  beforeEach(() => {
    pathname = '/';
    window.location.hash = '';
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isHeaderMenuOpen: false, isAuthModalOpen: false });
  });

  it('док прижат к низу и скрыт с md (768): выше планшета его место занимает шапка', () => {
    render(<MobileNav />);
    const dock = screen.getByRole('navigation');
    expect(dock.className).toContain('fixed');
    expect(dock.className).toContain('bottom-0');
    expect(dock.className).toContain('md:hidden');
    expect(dock.className).not.toMatch(/\b(sm|lg|xl|menu):hidden\b/);
  });

  it('шапка: горизонтальная навигация с menu (960), до неё — кнопка меню; точка одна на обоих', () => {
    render(<Header />);
    const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
    expect(nav.className).toContain('hidden');
    expect(nav.className).toContain('menu:flex');

    const menuButton = screen.getByRole('button', { name: 'Открыть меню' });
    expect(menuButton.closest('.menu\\:hidden')).not.toBeNull();
  });
});
