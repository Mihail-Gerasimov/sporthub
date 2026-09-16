/**
 * Phase 30.10: тесты HeroSportMarquee.
 * Проверяем дублирование контента (a11y), cursor-default на чипах,
 * aria-hidden на дубликате, пустой массив → null.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { HeroSportMarquee } from '@/components/home/HeroSportMarquee';

const SPORTS = [
  { id: 1, name: 'Йога' },
  { id: 2, name: 'Бокс' },
  { id: 3, name: 'Плавание' },
];

describe('HeroSportMarquee (Phase 30.10)', () => {
  it('возвращает null при пустом массиве', () => {
    const { container } = render(<HeroSportMarquee sports={[]} />);
    expect(container.querySelector('[data-testid="hero-sport-marquee"]')).toBeNull();
  });

  it('рендерит контент дважды (оригинал + aria-hidden дубликат)', () => {
    render(<HeroSportMarquee sports={SPORTS} />);
    /* 3 спорта × 2 копии = 6 чипов с текстом «Йога» */
    expect(screen.getAllByText('Йога')).toHaveLength(2);
    expect(screen.getAllByText('Бокс')).toHaveLength(2);
    expect(screen.getAllByText('Плавание')).toHaveLength(2);
  });

  it('каждый чип имеет cursor-default явно (override любого hover-наследования)', () => {
    const { container } = render(<HeroSportMarquee sports={SPORTS} />);
    const chips = container.querySelectorAll<HTMLElement>(
      '[data-testid="hero-sport-marquee"] .hero-sport-marquee > span',
    );
    expect(chips.length).toBe(6);
    chips.forEach((chip) => {
      // Шаг 38.9: курсор задаётся классом, а не инлайновым стилем.
      expect(chip.className).toMatch(/\bcursor-default\b/);
      expect(chip.getAttribute('style')).toBeNull();
    });
  });

  it('первая половина чипов без aria-hidden, вторая — с aria-hidden=true', () => {
    const { container } = render(<HeroSportMarquee sports={SPORTS} />);
    const chips = container.querySelectorAll<HTMLElement>(
      '[data-testid="hero-sport-marquee"] .hero-sport-marquee > span',
    );
    /* Первые 3 чипа — оригинал (без aria-hidden) */
    expect(chips[0].getAttribute('aria-hidden')).toBeNull();
    expect(chips[1].getAttribute('aria-hidden')).toBeNull();
    expect(chips[2].getAttribute('aria-hidden')).toBeNull();
    /* Следующие 3 — дубликат с aria-hidden="true" */
    expect(chips[3].getAttribute('aria-hidden')).toBe('true');
    expect(chips[4].getAttribute('aria-hidden')).toBe('true');
    expect(chips[5].getAttribute('aria-hidden')).toBe('true');
  });

  it('инициал в lime-square — первая буква названия в верхнем регистре', () => {
    render(<HeroSportMarquee sports={[{ id: 1, name: 'плавание' }]} />);
    /* «П» в верхнем регистре, две копии */
    const initials = screen.getAllByText('П').filter((el) => el.tagName.toLowerCase() === 'span');
    expect(initials.length).toBe(2);
  });

  // a11y-прогон 38.96 (MED): буква-значок вида на тёмной плашке героя — зелёная,
  // не графит: `text-ink` на `bg-lime-soft` поверх плашки давал 1,24:1.
  it('буква-значок вида — text-lime на подложке lime-soft, без text-ink', () => {
    render(<HeroSportMarquee sports={[{ id: 3, name: 'Плавание' }]} />);

    const badge = screen.getAllByText('П')[0];

    expect(badge.className).toContain('text-lime');
    expect(badge.className).toContain('bg-lime-soft');
    expect(badge.className).not.toMatch(/\btext-ink\b|var\(--ui-ink\)/);
  });
});
