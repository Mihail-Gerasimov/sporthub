/**
 * Контракт дизайна страниц — проверяет, что hero-секция
 * и страницы следуют минималистичному стилю.
 */
import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';

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
