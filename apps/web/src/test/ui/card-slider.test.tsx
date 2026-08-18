/*
 * Тесты CardSlider — переиспользуемый клиентский слайдер карточек
 * со стрелками вперёд/назад, точками-индикаторами и адаптивом
 * через matchMedia (1 видимая на ≤768, 2 на 1024+; в 28.12 расширено
 * до тернарного через visibleByBp).
 *
 * Проверяем: pill-счётчик, dots, edge-disable стрелок, переключение idx,
 * empty state при total=0, tools-слот, visibleByBp 1↔2↔3.
 */
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CardSlider } from '@/components/ui/CardSlider';

// jsdom не имплементирует matchMedia — мокаем перед каждым тестом.
function mockMatchMedia(matches: boolean) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

/* Phase 28.12: lookup по query-строкам для тестов visibleByBp.
 * Любой не указанный query → matches=false. */
function mockMatchMediaByQuery(states: Record<string, boolean>) {
  Object.defineProperty(window, 'matchMedia', {
    writable: true,
    configurable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: states[query] ?? false,
      media: query,
      onchange: null,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

function makeChildren(count: number) {
  return Array.from({ length: count }, (_, i) => (
    <article key={i} data-testid={`slide-${i}`}>
      Card {i + 1}
    </article>
  ));
}

describe('CardSlider', () => {
  beforeEach(() => {
    // По умолчанию — мобильный режим (visible=1, dots = total).
    mockMatchMedia(false);
  });

  it('рендерит eyebrow, заголовок и pill-счётчик', () => {
    render(
      <CardSlider eyebrow="Club list" title="Клубы" accent="lime" sliderId="t1" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    expect(screen.getByText('Club list')).toBeInTheDocument();
    expect(screen.getByText('Клубы')).toBeInTheDocument();
    // Pill: число "6" + текст "в выдаче"
    expect(screen.getByText('6')).toBeInTheDocument();
    expect(screen.getByText(/в выдаче/i)).toBeInTheDocument();
  });

  it('на mobile (visible=1, total=6) рендерит 6 dots, первая активна', () => {
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t2" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    const dots = document.querySelectorAll('[data-card-slider-dot]');
    expect(dots.length).toBe(6);
    expect(dots[0]?.getAttribute('data-active')).toBe('true');
    expect(dots[1]?.getAttribute('data-active')).toBe('false');
  });

  it('prev disabled на старте, next enabled', () => {
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t3" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    const prev = screen.getByRole('button', { name: /назад/i });
    const next = screen.getByRole('button', { name: /вперёд/i });
    expect(prev).toBeDisabled();
    expect(next).not.toBeDisabled();
  });

  it('клик next двигает idx на 1, prev становится enabled', () => {
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t4" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    const next = screen.getByRole('button', { name: /вперёд/i });
    fireEvent.click(next);

    const dots = document.querySelectorAll('[data-card-slider-dot]');
    expect(dots[1]?.getAttribute('data-active')).toBe('true');
    expect(dots[0]?.getAttribute('data-active')).toBe('false');

    const prev = screen.getByRole('button', { name: /назад/i });
    expect(prev).not.toBeDisabled();
  });

  it('next disabled на последнем индексе', () => {
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t5" total={2}>
        {makeChildren(2)}
      </CardSlider>,
    );
    // visible=1, total=2 → maxIdx=1, кликаем 1 раз вперёд
    const next = screen.getByRole('button', { name: /вперёд/i });
    fireEvent.click(next);
    expect(next).toBeDisabled();
  });

  it('empty state при total=0: нет rail, есть emptyMessage', () => {
    render(
      <CardSlider
        eyebrow="X"
        title="Y"
        accent="lime"
        sliderId="t6"
        total={0}
        emptyMessage="Ничего нет"
      >
        {[]}
      </CardSlider>,
    );
    expect(screen.getByText('Ничего нет')).toBeInTheDocument();
    expect(document.querySelector('[data-card-slider-rail]')).toBeNull();
    expect(document.querySelectorAll('[data-card-slider-dot]').length).toBe(0);
  });

  it('клик по dot переключает idx на её индекс', () => {
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t7" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    const dots = document.querySelectorAll('[data-card-slider-dot]');
    fireEvent.click(dots[3] as Element);
    expect(dots[3]?.getAttribute('data-active')).toBe('true');
    expect(dots[0]?.getAttribute('data-active')).toBe('false');
  });

  // ============================================================
  // Phase 28.12: tools-слот + visibleByBp
  // ============================================================

  it('без tools — рендерится дефолтный pill-счётчик «N в выдаче»', () => {
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t8" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    expect(screen.getByText(/в выдаче/i)).toBeInTheDocument();
  });

  it('tools передан — pill-счётчик НЕ рендерится, вместо него содержимое tools', () => {
    render(
      <CardSlider
        eyebrow="X"
        title="Y"
        accent="lime"
        sliderId="t9"
        total={6}
        tools={<span data-testid="custom-tools">CUSTOM</span>}
      >
        {makeChildren(6)}
      </CardSlider>,
    );
    expect(screen.queryByText(/в выдаче/i)).not.toBeInTheDocument();
    expect(screen.getByTestId('custom-tools')).toBeInTheDocument();
  });

  it('visibleByBp не передан → старое 1↔2 (default mobile, visible=1, 6 dots для total=6)', () => {
    mockMatchMedia(false);
    render(
      <CardSlider eyebrow="X" title="Y" accent="lime" sliderId="t10" total={6}>
        {makeChildren(6)}
      </CardSlider>,
    );
    const dots = document.querySelectorAll('[data-card-slider-dot]');
    expect(dots.length).toBe(6); // visible=1 → maxIdx=5 → 6 dots
  });

  it('visibleByBp={sm:1,md:2,xl:3} + xl mediaQuery true → visible=3 (4 dots для total=6)', () => {
    mockMatchMediaByQuery({
      '(min-width: 768px)': true,
      '(min-width: 1280px)': true,
    });
    render(
      <CardSlider
        eyebrow="X"
        title="Y"
        accent="lime"
        sliderId="t11"
        total={6}
        visibleByBp={{ sm: 1, md: 2, xl: 3 }}
      >
        {makeChildren(6)}
      </CardSlider>,
    );
    const dots = document.querySelectorAll('[data-card-slider-dot]');
    expect(dots.length).toBe(4); // visible=3 → maxIdx=3 → 4 dots
  });

  it('visibleByBp={sm:1,md:2,xl:3} + только md mediaQuery true → visible=2 (5 dots для total=6)', () => {
    mockMatchMediaByQuery({
      '(min-width: 768px)': true,
      '(min-width: 1280px)': false,
    });
    render(
      <CardSlider
        eyebrow="X"
        title="Y"
        accent="lime"
        sliderId="t12"
        total={6}
        visibleByBp={{ sm: 1, md: 2, xl: 3 }}
      >
        {makeChildren(6)}
      </CardSlider>,
    );
    const dots = document.querySelectorAll('[data-card-slider-dot]');
    expect(dots.length).toBe(5); // visible=2 → maxIdx=4 → 5 dots
  });

  it('visibleByBp={sm:1,md:2,xl:3} + оба false → visible=1 (6 dots для total=6)', () => {
    mockMatchMediaByQuery({
      '(min-width: 768px)': false,
      '(min-width: 1280px)': false,
    });
    render(
      <CardSlider
        eyebrow="X"
        title="Y"
        accent="lime"
        sliderId="t13"
        total={6}
        visibleByBp={{ sm: 1, md: 2, xl: 3 }}
      >
        {makeChildren(6)}
      </CardSlider>,
    );
    const dots = document.querySelectorAll('[data-card-slider-dot]');
    expect(dots.length).toBe(6); // visible=1 → maxIdx=5 → 6 dots
  });
});
