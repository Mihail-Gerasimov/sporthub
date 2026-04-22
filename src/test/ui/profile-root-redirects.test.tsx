// Phase 26 Step 26.5: корневые /profile/athlete и /profile/provider больше не
// имеют UI — они делают redirect на /dashboard-подмаршруты. Тест проверяет
// факт redirect'а (оба server-route экспортируют функцию, которая вызывает
// `redirect(...)` с правильным путём) и что MobileNav «Профиль» ведёт на
// dashboard атлета напрямую, без прохождения через корневой redirect.
import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// Мокаем next/navigation.redirect — Next в рантайме бросает спец-ошибку, в
// юнит-тесте нам достаточно проверить факт и аргумент вызова. vi.hoisted нужен
// потому что vi.mock подымается в top-of-file, а обычный const — нет.
const { redirectMock } = vi.hoisted(() => ({
  redirectMock: vi.fn(),
}));
vi.mock('next/navigation', () => ({
  redirect: redirectMock,
}));

import AthleteProfileRoute from '@/app/profile/athlete/page';
import ProviderProfileRoute from '@/app/profile/provider/page';
import { MobileNav } from '@/components/layout/MobileNav';

describe('Корневые /profile/* → redirect на /dashboard (Step 26.5)', () => {
  it('/profile/athlete → redirect(«/profile/athlete/dashboard»)', () => {
    redirectMock.mockClear();
    AthleteProfileRoute();
    expect(redirectMock).toHaveBeenCalledWith('/profile/athlete/dashboard');
  });

  it('/profile/provider → redirect(«/profile/provider/dashboard»)', () => {
    redirectMock.mockClear();
    ProviderProfileRoute();
    expect(redirectMock).toHaveBeenCalledWith('/profile/provider/dashboard');
  });

  it('MobileNav «Профиль» ссылается на /profile/athlete/dashboard (без редиректа через корневой)', () => {
    const { container } = render(<MobileNav />);
    const profileLink = Array.from(container.querySelectorAll('a')).find(
      (anchor) => anchor.textContent?.trim() === 'Профиль',
    );
    expect(profileLink).toBeDefined();
    expect(profileLink).toHaveAttribute('href', '/profile/athlete/dashboard');
  });
});
