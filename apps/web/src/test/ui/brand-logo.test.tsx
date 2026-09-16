/**
 * Логотип ПРОСПОРТ (шаг 38.34): словомарка из `BRAND_WORDMARK`, два бегуна-SVG,
 * подпись для экранного диктора — имя площадки целиком.
 */
import { BRAND_NAME, BRAND_WORDMARK } from '@sporthub/domain';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { BrandLogo } from '@/components/ui/BrandLogo';

describe('BrandLogo', () => {
  it('словомарка собрана из половин BRAND_WORDMARK, а не литералом', () => {
    render(<BrandLogo />);
    const lead = screen.getByText(BRAND_WORDMARK.lead);
    const tail = screen.getByText(BRAND_WORDMARK.tail);
    expect(lead.className).toContain('text-lime');
    expect(tail.className).toContain('text-ink');
    // Половины — соседние span'ы одного слова.
    expect(lead.parentElement).toBe(tail.parentElement);
  });

  it('для экранного диктора логотип — одно имя площадки, бегуны скрыты', () => {
    render(<BrandLogo />);
    const logo = screen.getByRole('img', { name: BRAND_NAME });
    const runners = logo.querySelectorAll('svg[aria-hidden="true"]');
    expect(runners).toHaveLength(2);
    // Контур — трассировка растра макета: замкнутые пути, а не растровая маска.
    for (const runner of runners) {
      expect(runner.getAttribute('viewBox')).toBe('0 0 133 142');
      expect(runner.querySelector('path')?.getAttribute('d')).toMatch(/^M[\d. ]+.*Z$/);
    }
  });

  it('на тёмной плашке хвост словомарки и второй бегун — белые', () => {
    render(<BrandLogo tone="plate" />);
    expect(screen.getByText(BRAND_WORDMARK.tail).className).toContain('text-plate-ink');
    const runners = screen.getByRole('img', { name: BRAND_NAME }).querySelectorAll('svg');
    expect(runners[0].getAttribute('class')).toContain('text-lime');
    expect(runners[1].getAttribute('class')).toContain('text-plate-ink');
  });

  it('размер sm — меньший бегун и кегль, без инлайновых стилей', () => {
    render(<BrandLogo size="sm" />);
    const logo = screen.getByRole('img', { name: BRAND_NAME });
    expect(logo.querySelector('svg')?.getAttribute('class')).toContain('h-7');
    expect(screen.getByText(BRAND_WORDMARK.lead).parentElement?.className).toContain('text-[18px]');
    expect(logo.querySelectorAll('[style]')).toHaveLength(0);
  });
});
