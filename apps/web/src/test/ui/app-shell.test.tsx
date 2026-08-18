import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { AppShell } from '@/components/layout/AppShell';

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

    expect(within(primaryNavigation).getByRole('link', { name: 'Подборки' })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole('link', { name: 'Выдача' })).toBeInTheDocument();
    expect(within(primaryNavigation).getByRole('link', { name: 'Слоты' })).toBeInTheDocument();

    expect(within(mobileNavigation).getByRole('link', { name: 'Главная' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('link', { name: 'Поиск' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('link', { name: 'Слоты' })).toBeInTheDocument();
    expect(within(mobileNavigation).getByRole('link', { name: 'Профиль' })).toBeInTheDocument();
  });
});
