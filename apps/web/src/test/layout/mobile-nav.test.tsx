/**
 * Мобильный док (шаг 38.62): пункты из словаря плюс «Профиль», подсветка активного
 * по адресу И по хэшу, скрытие при открытом меню шапки. Шаг 38.79c: пункты — Главная,
 * Каталог (`/catalog`), Слоты (`/catalog#availability`); подсветка по паре «путь + хэш»
 * на любой странице, не только на `/#…`.
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
import { useUIStore } from '@/stores/useUIStore';

function setHash(hash: string) {
  window.location.hash = hash;
  act(() => {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
  });
}

describe('MobileNav', () => {
  beforeEach(() => {
    pathname = '/';
    window.location.hash = '';
    useUIStore.setState({ isHeaderMenuOpen: false });
  });

  it('пункты — из словаря плюс «Профиль», адреса совпадают', () => {
    render(<MobileNav />);
    const links = screen.getAllByRole('link');
    expect(links.map((a) => a.textContent)).toEqual([...MOBILE_NAV.map((i) => i.label), 'Профиль']);
    for (const item of MOBILE_NAV) {
      expect(screen.getByRole('link', { name: item.label })).toHaveAttribute('href', item.href);
    }
  });

  // ⚠️ Клик по пункту — без ручного диспатча событий: `next/link` идёт через
  // `pushState`, на который `hashchange` не поднимается; подсветку ставит сам клик.
  it('на каталоге клик по «Слоты» подсвечивает его сразу, клик по «Каталог» возвращает подсветку каталогу', () => {
    pathname = '/catalog';
    render(<MobileNav />);
    fireEvent.click(screen.getByRole('link', { name: 'Слоты' }));
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Каталог' })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('link', { name: 'Каталог' }));
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Слоты' })).not.toHaveAttribute('aria-current');
  });

  it('«назад/вперёд» (popstate) перечитывает хэш из адреса', () => {
    pathname = '/catalog';
    render(<MobileNav />);
    window.location.hash = '#availability';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('aria-current', 'page');
  });

  it('на каталоге без хэша и с чужим хэшем активен «Каталог»; с хэшем слотов — «Слоты»', () => {
    pathname = '/catalog';
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Слоты' })).not.toHaveAttribute('aria-current');

    setHash('#results');
    expect(screen.getByRole('link', { name: 'Каталог' })).toHaveAttribute('aria-current', 'page');

    setHash('#availability');
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Каталог' })).not.toHaveAttribute('aria-current');
  });

  it('на главной активна «Главная» — и без хэша, и с якорем витрины; хэш слотов на главной чужой', () => {
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Каталог' })).not.toHaveAttribute('aria-current');

    setHash('#steps');
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');

    // `#availability` живёт на каталоге: на главной «Слоты» не подсвечиваются.
    setHash('#availability');
    expect(screen.getByRole('link', { name: 'Слоты' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
  });

  it('в кабинете активен «Профиль» по корню адреса, каталог и главная не подсвечиваются', () => {
    pathname = '/profile/club/3/bookings';
    window.location.hash = '#availability';
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Каталог' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Слоты' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');
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
