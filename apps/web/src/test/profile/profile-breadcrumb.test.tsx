// Phase 26 Step 26.10: тесты ProfileBreadcrumb.
// Breadcrumb на подмаршрутах ЛК: виден только если pathname совпадает с нон-dashboard
// nav item, items непустые и вариант athlete/provider корректный. На Dashboard,
// при пустых items и при mismatch pathname — компонент возвращает null.
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProfileNavItem } from '@/components/profile/profile-nav-items';

const athleteItems: ProfileNavItem[] = [
  { key: 'dashboard', label: 'Обзор', href: '/profile/athlete/dashboard' },
  { key: 'schedule', label: 'Расписание', href: '/profile/athlete/schedule' },
  { key: 'stats', label: 'Статистика', href: '/profile/athlete/stats' },
];

const mocks = vi.hoisted(() => ({ pathname: '/profile/athlete/dashboard' }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
}));

async function renderAt(
  pathname: string,
  items: ProfileNavItem[],
  variant: 'athlete' | 'provider',
) {
  mocks.pathname = pathname;
  const mod = await import('@/components/profile/ProfileBreadcrumb');
  render(<mod.ProfileBreadcrumb items={items} variant={variant} />);
}

describe('ProfileBreadcrumb (Step 26.10)', () => {
  afterEach(() => {
    mocks.pathname = '/profile/athlete/dashboard';
  });

  it('на Dashboard breadcrumb не рендерится (нет в DOM)', async () => {
    await renderAt('/profile/athlete/dashboard', athleteItems, 'athlete');

    expect(screen.queryByTestId('profile-breadcrumb')).not.toBeInTheDocument();
  });

  it('на подмаршруте: link «Обзор» ведёт на /profile/athlete/dashboard + label активного пункта', async () => {
    await renderAt('/profile/athlete/stats', athleteItems, 'athlete');

    const nav = screen.getByTestId('profile-breadcrumb');
    expect(nav).toBeInTheDocument();

    const link = screen.getByRole('link', { name: /обзор/i });
    expect(link).toHaveAttribute('href', '/profile/athlete/dashboard');

    expect(nav).toHaveTextContent('Статистика');
  });

  it('для provider: link ведёт на /profile/provider/dashboard', async () => {
    const providerItems: ProfileNavItem[] = [
      { key: 'dashboard', label: 'Обзор', href: '/profile/provider/dashboard' },
      { key: 'publications', label: 'Публикации', href: '/profile/provider/publications' },
    ];

    await renderAt('/profile/provider/publications', providerItems, 'provider');

    const link = screen.getByRole('link', { name: /обзор/i });
    expect(link).toHaveAttribute('href', '/profile/provider/dashboard');
    expect(screen.getByTestId('profile-breadcrumb')).toHaveTextContent('Публикации');
  });

  it('items=[] → breadcrumb не рендерится', async () => {
    await renderAt('/profile/athlete/stats', [], 'athlete');

    expect(screen.queryByTestId('profile-breadcrumb')).not.toBeInTheDocument();
  });

  it('pathname не мэтчит ни один item → breadcrumb не рендерится', async () => {
    await renderAt('/profile/athlete/unknown-route', athleteItems, 'athlete');

    expect(screen.queryByTestId('profile-breadcrumb')).not.toBeInTheDocument();
  });
});
