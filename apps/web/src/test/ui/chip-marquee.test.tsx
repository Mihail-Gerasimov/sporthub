/*
 * Тесты ChipMarquee — бесконечная горизонтальная лента чипов с pause-on-hover
 * и pointer-drag scrub. Если все чипы влезают (scrollWidth ≤ container) —
 * переходит в режим .no-loop (статика без анимации, без mask, без grab cursor).
 *
 * jsdom не считает layout (scrollWidth/offsetWidth/clientWidth = 0), поэтому
 * мокаем layout-свойства через Object.defineProperty. requestAnimationFrame
 * мокаем чтобы tick не запускался автоматически.
 */
import { fireEvent, render } from '@testing-library/react';
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
    // Шаг 38.14: цвет — токеном-классом, а не `var(--ui-*)` в произвольном значении.
    expect(chip?.className).toMatch(/\bbg-lime-soft\b/);
  });

  it('применяет solid+orange стили (классы orange-soft/orange)', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'X' }];
    const { container } = render(<ChipMarquee items={items} variant="solid" accent="orange" />);
    const chip = container.querySelector('[data-chip-original="true"]');
    expect(chip?.className).toMatch(/\bbg-orange-soft\b/);
  });

  it('применяет outline стили (без solid-фона)', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'X' }];
    const { container } = render(<ChipMarquee items={items} variant="outline" accent="lime" />);
    const chip = container.querySelector('[data-chip-original="true"]');
    expect(chip?.className).not.toMatch(/\bbg-lime-soft\b/);
    expect(chip?.className).toMatch(/transparent|bg-transparent/);
  });

  // --- Phase 30.8 ---

  it('Phase 30.8: на каждом чипе явно cursor-default (override grab от родителя)', () => {
    MOCK_CONTAINER_W = 500;
    MOCK_CONTENT_W = 200;
    const items = [{ label: 'A' }, { label: 'B' }];
    const { container } = render(<ChipMarquee items={items} variant="outline" accent="lime" />);
    const chips = container.querySelectorAll<HTMLElement>('[data-chip-original="true"]');
    expect(chips.length).toBe(2);
    chips.forEach((chip) => {
      // Шаг 38.9: курсор задаётся классом, а не инлайновым стилем.
      expect(chip.className).toMatch(/\bcursor-default\b/);
      expect(chip.getAttribute('style')).toBeNull();
    });
  });

  it('Phase 30.8: подписывается на IntersectionObserver и отписывается при unmount', () => {
    MOCK_CONTAINER_W = 200;
    MOCK_CONTENT_W = 800; // включаем loop-режим, чтобы effect зашёл в IO-блок
    const observe = vi.fn();
    const disconnect = vi.fn();
    const originalIO = globalThis.IntersectionObserver;
    globalThis.IntersectionObserver = class {
      constructor() {}
      observe = observe;
      unobserve = vi.fn();
      disconnect = disconnect;
      takeRecords = () => [];
      root = null;
      rootMargin = '';
      thresholds: ReadonlyArray<number> = [];
    } as unknown as typeof IntersectionObserver;

    const items = ['A', 'B', 'C'].map((label) => ({ label }));
    const { unmount } = render(<ChipMarquee items={items} variant="solid" accent="lime" />);
    expect(observe).toHaveBeenCalledTimes(1);
    unmount();
    expect(disconnect).toHaveBeenCalled();

    globalThis.IntersectionObserver = originalIO;
  });

  // Ревью f07dc4d (LOW): в карточках лента лежит под растянутой ссылкой — указатель
  // бьёт в псевдоэлемент ссылки, и drag с паузой по наведению недостижимы. В карточке
  // лента декоративная: слушатели не вешаются, курсор обычный; детальные страницы —
  // интерактивные, как прежде.
  describe('interactive={false} — декоративная лента в карточке', () => {
    it('drag не вешается: pointerdown не даёт is-dragging, mouseenter не ставит паузу', () => {
      MOCK_CONTAINER_W = 200;
      MOCK_CONTENT_W = 800;
      const addTrack = vi.spyOn(HTMLDivElement.prototype, 'addEventListener');
      const items = ['A', 'B', 'C'].map((label) => ({ label }));
      const { container } = render(
        <ChipMarquee items={items} variant="solid" accent="lime" interactive={false} />,
      );
      const track = container.querySelector('.chip-track') as HTMLElement;
      const marquee = container.querySelector('.chip-marquee') as HTMLElement;

      // Только слушатели самой ленты: React вешает свои на корень для всех событий.
      const listened = addTrack.mock.calls
        .filter((_, i) => [track, marquee].includes(addTrack.mock.contexts[i] as HTMLElement))
        .map(([type]) => type);
      for (const type of ['pointerdown', 'pointermove', 'pointerup', 'mouseenter', 'mouseleave']) {
        expect(listened, `слушатель ${type} повешен`).not.toContain(type);
      }

      fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 });
      expect(track.classList.contains('is-dragging')).toBe(false);
      fireEvent.mouseEnter(marquee);
      // Курсор — обычный, не grab: тянуть нечего.
      expect(track.className).not.toContain('cursor-grab');
    });

    it('по умолчанию (детальная страница) лента интерактивна: drag и пауза на месте', () => {
      MOCK_CONTAINER_W = 200;
      MOCK_CONTENT_W = 800;
      const addTrack = vi.spyOn(HTMLDivElement.prototype, 'addEventListener');
      const items = ['A', 'B', 'C'].map((label) => ({ label }));
      const { container } = render(<ChipMarquee items={items} variant="solid" accent="lime" />);
      const track = container.querySelector('.chip-track') as HTMLElement;

      const marquee = container.querySelector('.chip-marquee') as HTMLElement;
      const listened = addTrack.mock.calls
        .filter((_, i) => [track, marquee].includes(addTrack.mock.contexts[i] as HTMLElement))
        .map(([type]) => type);
      expect(listened).toEqual(expect.arrayContaining(['pointerdown', 'mouseenter']));
      fireEvent.pointerDown(track, { clientX: 10, pointerId: 1 });
      expect(track.classList.contains('is-dragging')).toBe(true);
      expect(track.className).toContain('cursor-grab');
    });
  });
});
