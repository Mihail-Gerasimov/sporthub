// Тесты ProfileSidebar (Step 25.2): dumb-компонент с active-подсветкой по pathname.
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('next/navigation', () => ({
  usePathname: vi.fn(),
}));

import { usePathname } from 'next/navigation';

import { ProfileSidebar } from '@/components/profile/ProfileSidebar';
import type { ProfileNavItem } from '@/components/profile/profile-nav-items';

const items: ProfileNavItem[] = [
  { key: 'dashboard', label: 'Обзор', href: '/profile/athlete/dashboard' },
  { key: 'schedule', label: 'Расписание', href: '/profile/athlete/schedule' },
  { key: 'settings', label: 'Настройки', href: '/profile/athlete/settings' },
];

describe('ProfileSidebar', () => {
  beforeEach(() => {
    vi.mocked(usePathname).mockReset();
  });

  it('рендерит все переданные items как ссылки с правильными href', () => {
    vi.mocked(usePathname).mockReturnValue('/profile/athlete/dashboard');

    render(<ProfileSidebar items={items} ariaLabel="Разделы кабинета атлета" />);

    expect(screen.getByRole('navigation', { name: 'Разделы кабинета атлета' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Обзор' })).toHaveAttribute(
      'href',
      '/profile/athlete/dashboard',
    );
    expect(screen.getByRole('link', { name: 'Расписание' })).toHaveAttribute(
      'href',
      '/profile/athlete/schedule',
    );
    expect(screen.getByRole('link', { name: 'Настройки' })).toHaveAttribute(
      'href',
      '/profile/athlete/settings',
    );
  });

  it('подсвечивает активный пункт по pathname через aria-current="page"', () => {
    vi.mocked(usePathname).mockReturnValue('/profile/athlete/schedule');

    render(<ProfileSidebar items={items} ariaLabel="Разделы кабинета атлета" />);

    const scheduleLink = screen.getByRole('link', { name: 'Расписание' });
    const dashboardLink = screen.getByRole('link', { name: 'Обзор' });
    const settingsLink = screen.getByRole('link', { name: 'Настройки' });

    expect(scheduleLink).toHaveAttribute('aria-current', 'page');
    expect(dashboardLink).not.toHaveAttribute('aria-current');
    expect(settingsLink).not.toHaveAttribute('aria-current');
  });

  it('возвращает null при пустом массиве items (защита от мёртвой разметки)', () => {
    vi.mocked(usePathname).mockReturnValue('/profile/athlete');

    const { container } = render(<ProfileSidebar items={[]} ariaLabel="Разделы кабинета атлета" />);

    expect(container.firstChild).toBeNull();
  });
});
