/*
 * Тесты ChipMarquee — бесконечная горизонтальная лента чипов с pause-on-hover
 * и pointer-drag scrub. Если все чипы влезают (scrollWidth ≤ container) —
 * переходит в режим .no-loop (статика без анимации, без mask, без grab cursor).
 *
 * jsdom не считает layout (scrollWidth/offsetWidth/clientWidth = 0), поэтому
 * мокаем layout-свойства через Object.defineProperty. requestAnimationFrame
 * мокаем чтобы tick не запускался автоматически.
 */
import { render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { ChipMarquee } from '@/components/ui/ChipMarquee';

// Глобальное состояние для моков layout-свойств — менется в каждом тесте.
let MOCK_CONTAINER_W = 500;
let MOCK_CONTENT_W = 200;

// Мокаем layout-свойства для .chip-marquee и .chip-track.
function installLayoutMocks() {
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList?.contains?.('chip-marquee')) return MOCK_CONTAINER_W;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      if (this.classList?.contains?.('chip-track')) return MOCK_CONTENT_W;
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetLeft', {
    configurable: true,
    get() {
      return 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'offsetWidth', {
    configurable: true,
    get() {
      return 50;
    },
  });
}

describe('ChipMarquee', () => {
  beforeEach(() => {
    installLayoutMocks();
    // rAF: вернуть фиктивный id, не вызывать callback (предсказуемость).
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation(() => 1);
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('возвращает null при пустом списке items', () => {
    const { container } = render(<ChipMarquee items={[]} variant="solid" accent="lime" />);
    expect(container.querySelector('.chip-marquee')).toBeNull();
  });

  it('рендерит N оригинальных чипов с data-chip-original', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = ['A', 'B', 'C', 'D', 'E'].map((label) => ({ label }));
    const { container } = render(<ChipMarquee items={items} variant="solid" accent="lime" />);
    const originals = container.querySelectorAll('[data-chip-original="true"]');
    expect(originals.length).toBe(5);
  });

  it('добавляет класс .no-loop когда контент влезает в контейнер', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200; // влезает
    const items = [{ label: 'A' }, { label: 'B' }];
    const { container } = render(<ChipMarquee items={items} variant="outline" accent="lime" />);
    const marquee = container.querySelector('.chip-marquee');
    expect(marquee?.classList.contains('no-loop')).toBe(true);
  });

  it('НЕ добавляет .no-loop когда контент шире контейнера и клонирует чипы', () => {
    MOCK_CONTAINER_W = 200;
    MOCK_CONTENT_W = 800; // не влезает
    const items = ['A', 'B', 'C'].map((label) => ({ label }));
    const { container } = render(<ChipMarquee items={items} variant="solid" accent="orange" />);
    const marquee = container.querySelector('.chip-marquee');
    expect(marquee?.classList.contains('no-loop')).toBe(false);

    // Должны появиться клоны (всего детей > 3 оригиналов).
    const allChildren = container.querySelectorAll('.chip-track > *');
    expect(allChildren.length).toBeGreaterThan(3);
  });

  it('отрисовывает label каждого item в чипе', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'Йога' }, { label: 'Бокс' }];
    const { container } = render(<ChipMarquee items={items} variant="solid" accent="lime" />);
    expect(container.textContent).toContain('Йога');
    expect(container.textContent).toContain('Бокс');
  });

  it('применяет solid+lime стили (классы lime-soft/lime)', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'X' }];
    const { container } = render(<ChipMarquee items={items} variant="solid" accent="lime" />);
    const chip = container.querySelector('[data-chip-original="true"]');
    expect(chip?.className).toMatch(/var\(--ui-lime-soft\)|--ui-lime/);
  });

  it('применяет solid+orange стили (классы orange-soft/orange)', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'X' }];
    const { container } = render(<ChipMarquee items={items} variant="solid" accent="orange" />);
    const chip = container.querySelector('[data-chip-original="true"]');
    expect(chip?.className).toMatch(/var\(--ui-orange-soft\)|--ui-orange/);
  });

  it('применяет outline стили (без solid-фона)', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'X' }];
    const { container } = render(<ChipMarquee items={items} variant="outline" accent="lime" />);
    const chip = container.querySelector('[data-chip-original="true"]');
    expect(chip?.className).not.toMatch(/var\(--ui-lime-soft\)/);
    expect(chip?.className).toMatch(/transparent|bg-transparent/);
  });
});
