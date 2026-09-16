import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';
import { HEADER_NAV, MOBILE_NAV } from '@/lib/navigation';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  // Phase 28: MobileNav стал client-component с usePathname для подсветки активного пункта
  usePathname: () => '/',
}));

describe('AppShell', () => {
  it('рендерит header, footer, mobile nav и контент страницы', () => {
    render(
      <AppShell>
        <div>Главный контент</div>
      </AppShell>,
    );

    expect(screen.getByRole('banner')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Войти' })).toBeInTheDocument();
    expect(screen.getByText('Главный контент')).toBeInTheDocument();
    expect(screen.getByRole('contentinfo')).toBeInTheDocument();

    const primaryNavigation = screen.getByRole('navigation', { name: 'Основная навигация' });
    const mobileNavigation = screen.getByRole('navigation', { name: 'Мобильная навигация' });

    // Пункты — из словаря навигации (38.79c): тест не держит свой список подписей.
    for (const item of HEADER_NAV) {
      expect(within(primaryNavigation).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
    for (const item of MOBILE_NAV) {
      expect(within(mobileNavigation).getByRole('link', { name: item.label })).toBeInTheDocument();
    }
    expect(within(mobileNavigation).getByRole('link', { name: 'Профиль' })).toBeInTheDocument();
  });
});
