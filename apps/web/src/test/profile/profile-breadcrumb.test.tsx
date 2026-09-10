// Хлебные крошки кабинета.
//
// Крошки видны только на подразделе: на обзоре, при пустом наборе разделов
// и при адресе, которого в наборе нет, компонент не рисуется вовсе.
//
// ⚠️ Шаг 35.31. Вместо признака «атлет или провайдер» компонент получает АДРЕС
// открытого кабинета. Признака вида было мало с самого начала — у человека
// с тремя клубами «провайдер» не говорит, в чей кабинет вести «Обзор», — а после
// переезда на адресные кабинеты он и вовсе перестал существовать.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProfileNavItem } from '@/components/profile/profile-nav-items';

const personalItems: ProfileNavItem[] = [
  { key: 'dashboard', label: 'Обзор', href: '/profile/me/dashboard' },
  { key: 'schedule', label: 'Расписание', href: '/profile/me/schedule' },
  { key: 'stats', label: 'Статистика', href: '/profile/me/stats' },
];

const mocks = vi.hoisted(() => ({ pathname: '/profile/me/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

async function renderAt(pathname: string, items: ProfileNavItem[], cabinetPath: string) {
  mocks.pathname = pathname;
  const mod = await import('@/components/profile/ProfileBreadcrumb');
  render(<mod.ProfileBreadcrumb items={items} cabinetPath={cabinetPath} />);
}

describe('ProfileBreadcrumb', () => {
  afterEach(() => {
    mocks.pathname = '/profile/me/dashboard';
  });

  it('на обзоре крошки не рисуются', async () => {
    await renderAt('/profile/me/dashboard', personalItems, '/profile/me');

    expect(screen.queryByTestId('profile-breadcrumb')).not.toBeInTheDocument();
  });

  it('на подразделе «Обзор» ведёт в личный кабинет, а подпись — раздел', async () => {
    await renderAt('/profile/me/stats', personalItems, '/profile/me');

    const nav = screen.getByTestId('profile-breadcrumb');
    expect(nav).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /обзор/i });
    expect(link).toHaveAttribute('href', '/profile/me/dashboard');

    expect(nav).toHaveTextContent('Статистика');
  });

  it('в кабинете лица «Обзор» ведёт в кабинет ЭТОГО лица', async () => {
    // ⚠️ Ровно то, чего не мог прежний признак вида: у владельца трёх клубов
    // крошка обязана вести в кабинет того клуба, который открыт, а не в общий.
    const faceItems: ProfileNavItem[] = [
      { key: 'dashboard', label: 'Обзор', href: '/profile/club/3/dashboard' },
      { key: 'publications', label: 'Публикации', href: '/profile/club/3/publications' },
    ];

    await renderAt('/profile/club/3/publications', faceItems, '/profile/club/3');

    const link = screen.getByRole('link', { name: /обзор/i });
    expect(link).toHaveAttribute('href', '/profile/club/3/dashboard');
    expect(screen.getByTestId('profile-breadcrumb')).toHaveTextContent('Публикации');
  });

  it('items=[] → breadcrumb не рендерится', async () => {
    await renderAt('/profile/me/stats', [], '/profile/me');

    expect(screen.queryByTestId('profile-breadcrumb')).not.toBeInTheDocument();
  });

  it('pathname не мэтчит ни один item → breadcrumb не рендерится', async () => {
    await renderAt('/profile/me/unknown-route', personalItems, '/profile/me');

    expect(screen.queryByTestId('profile-breadcrumb')).not.toBeInTheDocument();
  });
});
