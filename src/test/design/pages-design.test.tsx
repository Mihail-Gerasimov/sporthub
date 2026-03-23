/**
 * Контракт дизайна страниц — проверяет, что hero-секция
 * и страницы следуют минималистичному стилю.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';

/* Мок next/navigation для useRouter */
vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
  }),
  notFound: () => {
    throw new Error('Not found');
  },
}));

describe('Минималистичный стиль страниц', () => {
  beforeEach(() => {
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  describe('Home page hero', () => {
    it('hero-секция не содержит radial-gradient декорации', async () => {
      render(await Home());
      // Hero-секция — первая section внутри main
      const main = screen.getByRole('main');
      const heroSection = main.querySelector('section');
      expect(heroSection).not.toBeNull();
      // Ищем элемент с radial-gradient
      const gradientOverlay = heroSection!.querySelector('[class*="radial-gradient"]');
      expect(gradientOverlay).toBeNull();
    });

    it('hero-описание использует leading-relaxed', async () => {
      render(await Home());
      const description = screen.getByText(/SportHub собирает клубы/);
      expect(description.className).toContain('leading-relaxed');
    });
  });
});
