/**
 * Контракт дизайна страниц — проверяет, что hero-секция
 * и страницы следуют минималистичному стилю.
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { useFilterStore } from '@/stores/useFilterStore';
import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';

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
  let stub: ApiStub;

  beforeEach(() => {
    stub = installApiStub(createFixtureRoutes());
    useFilterStore.setState({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  afterEach(() => {
    stub?.restore();
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
      // Шаг 38.33: старое имя из героя ушло; текст переписывается на 38.64 (`home-copy`).
      const description = screen.getByText(/собирает клубы/);
      expect(description.className).toContain('leading-relaxed');
    });
  });
});
