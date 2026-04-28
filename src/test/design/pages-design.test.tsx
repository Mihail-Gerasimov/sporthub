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
    // Phase 28: новый дизайн UI Kit использует радиальные градиенты на hero billboard
    // (lime + orange атмосфера) для энергии. Раньше (светлая палитра) действовало
    // правило «никаких radial-gradient». Теперь — наоборот: ждём декоративный фон.
    it('hero-секция содержит атмосферные radial-gradient декорации (UI Kit)', async () => {
      render(await Home());
      const main = screen.getByRole('main');
      const heroSection = main.querySelector('section');
      expect(heroSection).not.toBeNull();
      // Hero-billboard имеет радиальные градиенты в before:[background:radial-gradient(...)]
      // Ищем подстроку в className любого элемента секции (включая саму section).
      const heroHTML = heroSection!.outerHTML;
      expect(heroHTML).toContain('radial-gradient');
    });

    it('hero-описание использует leading-relaxed', async () => {
      render(await Home());
      const description = screen.getByText(/SportHub собирает клубы/);
      expect(description.className).toContain('leading-relaxed');
    });
  });
});
