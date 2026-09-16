/**
 * Контракт дизайна layout-компонентов — проверяет,
 * что Header и Footer следуют минималистичному стилю.
 */
import { BRAND_NAME, BRAND_WORDMARK } from '@sporthub/domain';
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Мокаем next/navigation (Header использует useRouter и usePathname — текущий пункт)
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: vi.fn(),
  }),
  usePathname: () => '/',
}));

import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { HEADER_NAV } from '@/lib/navigation';
import { AUTH_STORE_DEFAULT_STATE, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

describe('Минималистичный стиль layout-компонентов', () => {
  beforeEach(() => {
    localStorage.clear();
    useAuthStore.setState(AUTH_STORE_DEFAULT_STATE);
    useUIStore.setState({ isAuthModalOpen: false });
  });

  describe('Header', () => {
    // Шаг 38.34: логотип — `BrandLogo` (два бегуна + словомарка из BRAND_WORDMARK),
    // ведёт на главную и назван для экранного диктора именем площадки. Прежняя
    // марка-квадрат «S» и eyebrow с именем сняты.
    it('логотип в шапке — BrandLogo ссылкой на главную, без тени', () => {
      render(<Header />);
      const header = screen.getByRole('banner');
      const logo = screen.getByRole('img', { name: BRAND_NAME });
      expect(header.contains(logo)).toBe(true);
      expect(logo.closest('a')?.getAttribute('href')).toBe('/');
      expect(logo.className).not.toMatch(/\bshadow-/);
    });

    // Шаг 38.57: шапка по эталону — белая, липкая, 64px; тёмная плашка ушла.
    it('шапка белая и липкая, навигация — из словаря, хвост словомарки тёмный', () => {
      render(<Header />);
      const header = screen.getByRole('banner');
      expect(header.className).toContain('sticky');
      expect(header.className).toContain('bg-card');
      expect(header.className).not.toContain('bg-plate');
      expect(screen.getByText(BRAND_WORDMARK.tail).className).toContain('text-ink');
      const nav = screen.getByRole('navigation', { name: 'Основная навигация' });
      // Пунктов ровно столько, сколько в словаре (38.108: четыре — ровно шапка макета).
      expect(nav.querySelectorAll('a')).toHaveLength(HEADER_NAV.length);
      expect(HEADER_NAV).toHaveLength(4);
    });
  });

  describe('Footer', () => {
    it('логотип в подвале — BrandLogo размера sm, ссылкой на главную', () => {
      render(<Footer />);
      const logo = screen.getByRole('img', { name: BRAND_NAME });
      expect(logo.closest('a')?.getAttribute('href')).toBe('/');
      expect(logo.querySelector('svg')?.getAttribute('class')).toContain('h-7');
    });

    // Шаг 38.61: описания проекта в подвале больше нет — подвал по эталону несёт логотип,
    // ссылки и копирайт; тест leading-relaxed снят вместе с абзацем.
  });
});
