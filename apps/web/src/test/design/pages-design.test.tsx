/**
 * Контракт дизайна страниц — герой главной: тёмная плашка, свечение токеном,
 * описание витрины в герое (переписан на шаге 38.65).
 */
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import Home from '@/app/page';
import { HERO } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
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
    // Шаг 38.65: герой — тёмная плашка со свечением ТОКЕНОМ (`--ui-decor-plate-glow`),
    // а не hex в разметке; прежняя проверка искала строку `radial-gradient` в HTML —
    // после чистки 38.14 градиент живёт в globals.css, и HTML его не содержит.
    it('hero-секция — тёмная плашка со свечением токеном, названа для диктора', async () => {
      render(await Home());
      const hero = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
      expect(hero.className).toContain('bg-plate');
      expect(hero.className).toContain('var(--ui-decor-plate-glow)');
      expect(hero.className).not.toMatch(/#[0-9a-f]{3,8}|rgba?\(/i);
    });

    // Ревью 38.65: прежние утверждения были истинны и для СТАРОГО героя — живая главная
    // рисовала его до 38.66. Здесь то, что есть только у нового: якорь из словаря,
    // H1 классом `.t-hero` с зелёной строкой из словаря, водяного знака «SH» нет.
    it('живая главная рисует НОВЫЙ герой: якорь из словаря, H1 `.t-hero` со строкой словаря, без «SH»', async () => {
      render(await Home());
      const hero = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
      expect(hero.id).toBe(HOME_SECTIONS.hero.id);
      const h1 = screen.getByRole('heading', { level: 1 });
      expect(hero.contains(h1)).toBe(true);
      expect(h1.className).toContain('t-hero');
      expect(h1.textContent).toContain(HERO.titleAccent);
      expect(hero.textContent).not.toMatch(/\bSH\b/);
    });

    it('подзаголовок макета стоит в герое и написан приглушённым текстом плашки', async () => {
      render(await Home());
      const hero = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
      const description = screen.getByText(HERO.subtitle);
      expect(hero.contains(description)).toBe(true);
      expect(description.className).toContain('text-plate-muted');
    });
  });
});
