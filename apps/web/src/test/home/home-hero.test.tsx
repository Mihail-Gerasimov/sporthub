/**
 * Герой главной (шаг 38.65): тексты из словаря, H1 display-шрифтом в три строки
 * с зелёной третьей, тёмная плашка со свечением и волной, слоты под поиск,
 * счётчики и правую колонку; водяного знака «SH» нет. Город в подзаголовке героя —
 * из стора фильтров (38.78, тупик № 32; 38.107: чип города снят, селектор в каталоге).
 */
import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { HomeHero } from '@/components/home/HomeHero';
import { HERO } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { useFilterStore } from '@/stores/useFilterStore';

describe('HomeHero', () => {
  beforeEach(() => {
    useFilterStore.setState({ selectedCity: 'Самара' });
  });

  it('город — в подзаголовке из стора фильтров, следует за селектором; чипа города нет (38.107)', () => {
    useFilterStore.setState({ selectedCity: 'Казань' });
    render(<HomeHero />);

    const subtitle = screen.getByText(HERO.subtitle('Казань'));
    expect(subtitle.className).toContain('text-plate-muted');
    expect(screen.queryByRole('link', { name: /Город:/ })).toBeNull();

    // Смена города в селекторе — та же запись стора — меняет текст без литералов.
    act(() => {
      useFilterStore.getState().setSelectedCity('тольятти');
    });
    expect(screen.getByText(HERO.subtitle('Тольятти'))).toBeInTheDocument();
    expect(screen.queryByText(/Казань/)).toBeNull();
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
    const section = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
    expect(section.className).toContain('bg-plate');
    // Якорь и подпись — из словаря секций, не литералом (ревью 38.65).
    expect(section.id).toBe(HOME_SECTIONS.hero.id);
    // Плашка по макету (`HomePage.tsx:283-294`): метка «Новинки», текст, шеврон-декор.
    expect(screen.getByText(HERO.eyebrowTag)).toBeInTheDocument();
    expect(HERO.eyebrowTag).toBe('Новинки');
    const eyebrow = screen.getByText(HERO.eyebrow);
    expect(eyebrow.parentElement?.querySelector('svg[aria-hidden="true"]')).not.toBeNull();
    expect(screen.getByText(HERO.subtitle('Самара')).className).toContain('text-plate-muted');
    // Водяного знака «SH» больше нет; ленты видов спорта в герое нет (38.107).
    expect(section.textContent).not.toMatch(/\bSH\b/);
    expect(section.querySelector('.hero-sport-marquee')).toBeNull();
  });

  it('свечение и волна: декор токеном, волна — SVG цветом холста', () => {
    const { container } = render(<HomeHero />);
    const section = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
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
    const section = screen.getByRole('region', { name: HOME_SECTIONS.hero.label });
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
