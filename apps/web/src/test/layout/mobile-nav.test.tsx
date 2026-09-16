/**
 * Мобильный док (шаг 38.62): пункты из словаря плюс «Профиль», подсветка активного
 * по адресу И по хэшу (якоря главной), скрытие при открытом меню шапки.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

let pathname = '/';
vi.mock('next/navigation', () => ({
  usePathname: () => pathname,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

import { MobileNav } from '@/components/layout/MobileNav';
import { MOBILE_NAV } from '@/lib/navigation';
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
  it('клик по пункту-якорю подсвечивает его сразу, клик по «Главная» снимает', () => {
    render(<MobileNav />);
    fireEvent.click(screen.getByRole('link', { name: 'Слоты' }));
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');

    fireEvent.click(screen.getByRole('link', { name: 'Главная' }));
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Слоты' })).not.toHaveAttribute('aria-current');
  });

  it('«назад/вперёд» (popstate) перечитывает хэш из адреса', () => {
    render(<MobileNav />);
    window.location.hash = '#availability';
    act(() => {
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('aria-current', 'page');
  });

  it('на главной без хэша активна «Главная», с хэшем (правка адреса руками) — пункт-якорь', () => {
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Главная' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Поиск' })).not.toHaveAttribute('aria-current');

    setHash('#discover');
    expect(screen.getByRole('link', { name: 'Поиск' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Главная' })).not.toHaveAttribute('aria-current');

    setHash('#availability');
    expect(screen.getByRole('link', { name: 'Слоты' })).toHaveAttribute('aria-current', 'page');
  });

  it('в кабинете активен «Профиль» по корню адреса, якоря главной не подсвечиваются', () => {
    pathname = '/profile/club/3/bookings';
    window.location.hash = '#discover';
    render(<MobileNav />);
    expect(screen.getByRole('link', { name: 'Профиль' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Поиск' })).not.toHaveAttribute('aria-current');
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
