/**
 * Phase 30.10: тесты HeroSportMarquee.
 * Проверяем дублирование контента (a11y), cursor:default на чипах,
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

  it('каждый чип имеет cursor:default явно (override любого hover-наследования)', () => {
    const { container } = render(<HeroSportMarquee sports={SPORTS} />);
    const chips = container.querySelectorAll<HTMLElement>(
      '[data-testid="hero-sport-marquee"] .hero-sport-marquee > span',
    );
    expect(chips.length).toBe(6);
    chips.forEach((chip) => {
      expect(chip.style.cursor).toBe('default');
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
});
