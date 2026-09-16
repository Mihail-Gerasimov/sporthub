/**
 * Герой главной (шаг 38.65): тексты из словаря, H1 display-шрифтом в три строки
 * с зелёной третьей, тёмная плашка со свечением и волной, слоты под поиск,
 * счётчики и правую колонку; водяного знака «SH» нет. Город в бейдже героя —
 * из селектора (38.78, тупик № 32): читается из стора фильтров, не литералом.
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeHero } from '@/components/home/HomeHero';
import { HERO } from '@/lib/home-copy';
import { homeSectionHref } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';

describe('HomeHero', () => {
  beforeEach(() => {
    useFilterStore.setState({ selectedCity: 'Самара' });
  });

  it('город в бейдже — из стора фильтров, следует за селектором и ведёт к нему', () => {
    useFilterStore.setState({ selectedCity: 'Казань' });
    render(<HomeHero />);

    const badge = screen.getByRole('link', { name: 'Город: Казань' });
    expect(badge).toHaveAttribute('href', homeSectionHref('discover'));

    // Смена города в селекторе — та же запись стора — меняет бейдж без литералов.
    act(() => {
      useFilterStore.getState().setSelectedCity('тольятти');
    });
    expect(screen.getByRole('link', { name: 'Город: Тольятти' })).toBeInTheDocument();
    expect(screen.queryByText('Казань')).toBeNull();
  });

  it('H1 — из словаря, display-шрифтом, три строки, третья зелёная', () => {
    render(<HomeHero />);
    const h1 = screen.getByRole('heading', { level: 1 });
    expect(h1.className).toContain('t-hero');
    const lines = [...h1.querySelectorAll('span')].map((s) => s.textContent);
    expect(lines).toEqual([...HERO.titleLines, HERO.titleAccent]);
    expect(h1.querySelectorAll('span')[2].className).toContain('text-lime');
    // Кириллица заголовка: сторож шрифта — базовое правило `h1` + класс `.t-hero`.
    expect(h1.textContent).toMatch(/[а-яё]/i);
  });

  it('плашка и подзаголовок — из словаря; секция названа для диктора и тёмная', () => {
    render(<HomeHero />);
    const section = screen.getByRole('region', { name: 'Главный экран' });
    expect(section.className).toContain('bg-plate');
    expect(section.id).toBe('hero');
    expect(screen.getByText(HERO.eyebrowTag)).toBeInTheDocument();
    expect(screen.getByText(HERO.eyebrow)).toBeInTheDocument();
    expect(screen.getByText(HERO.subtitle).className).toContain('text-plate-muted');
    // Водяного знака «SH» больше нет.
    expect(section.textContent).not.toMatch(/\bSH\b/);
  });

  it('свечение и волна: декор токеном, волна — SVG цветом холста', () => {
    const { container } = render(<HomeHero />);
    const section = screen.getByRole('region', { name: 'Главный экран' });
    expect(section.className).toContain('var(--ui-decor-plate-glow)');
    const wave = container.querySelector('svg[viewBox="0 0 1440 56"]');
    expect(wave).not.toBeNull();
    expect(wave?.querySelector('path')?.getAttribute('fill')).toBe('currentColor');
    expect(wave?.parentElement?.className).toContain('text-bg');
  });

  it('слоты поиска и счётчиков — на своих местах; правая колонка — FocusCard по данным дня', () => {
    render(
      <HomeHero
        search={<div data-testid="slot-search" />}
        counters={<div data-testid="slot-counters" />}
        focus={{ sessions: [], dateLabel: '16 сентября' }}
      />,
    );
    const section = screen.getByRole('region', { name: 'Главный экран' });
    const search = screen.getByTestId('slot-search');
    const counters = screen.getByTestId('slot-counters');
    // Порядок: заголовок → поиск → счётчики; колонка — в отдельной ячейке сетки, с xl.
    expect(
      search.compareDocumentPosition(counters) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    const aside = screen.getByRole('complementary', { name: 'Сегодня в фокусе' });
    expect(aside.closest('[data-hero-aside]')).not.toBeNull();
    expect(section.querySelector('[data-hero-aside]')?.className).toContain('xl:block');
  });

  it('без слотов секция целая: ни пустой обёртки поиска, ни правой колонки', () => {
    const { container } = render(<HomeHero />);
    expect(container.querySelector('[data-hero-aside]')).toBeNull();
  });
});
