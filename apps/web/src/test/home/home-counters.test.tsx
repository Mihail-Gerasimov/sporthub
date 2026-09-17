// Тесты счётчиков героя (шаг 38.69).
//
// Главное утверждение — ОТКУДА число: из ответа `/stats/overview`, а не из длины
// поднятого списка (диверсия д-20). Стенд даёт числа, которые невозможно получить
// длиной какого-либо массива на странице, и проверяет их дословно.
// Вторая половина — анимация: считает до конечного числа, при
// `prefers-reduced-motion` показывает конечное сразу, стартует один раз по появлению.

import { act, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeCounters } from '@/components/home/HomeCounters';
import { setMediaQueryMatches } from '@/test/setup';

const OVERVIEW = { athletes: 12345, trainers: 340, clubs: 52, reviews: 4987 };

/** Как число пишет компонент: разряды через узкий неразрывный пробел `ru-RU`. */
const fmt = (value: number) => value.toLocaleString('ru-RU');

/**
 * Определение (`dd`) к термину (`dt`) по подписи: «Клубов» → его число.
 * Разметка — пара в общем блоке, определение идёт за термином.
 */
function definitionOf(label: string): HTMLElement {
  // Роль `term` имени от содержимого не берёт — ищем термин по тексту.
  const term = screen.getByText(label, { selector: 'dt' });
  const definition = term.parentElement?.querySelector('dd');

  if (!definition) throw new Error(`у термина «${label}» нет определения`);

  return definition;
}

/** Что слышит диктор: конечное число в `sr-only`, бегущее скрыто. */
const spokenNumber = (label: string) =>
  within(definitionOf(label)).getByText(/./, { selector: '.sr-only' }).textContent;

/** Что видно на экране: бегущее число. */
const shownNumber = (label: string) =>
  definitionOf(label).querySelector('[aria-hidden="true"]')?.textContent;

/** Наблюдатель, который «видит» блок сразу: в jsdom пересечений нет. */
function installIntersectingObserver(): { disconnects: number } {
  const state = { disconnects: 0 };

  class ImmediateObserver {
    constructor(private readonly callback: IntersectionObserverCallback) {}
    observe(target: Element): void {
      this.callback(
        [{ isIntersecting: true, target } as IntersectionObserverEntry],
        this as unknown as IntersectionObserver,
      );
    }
    unobserve(): void {}
    disconnect(): void {
      state.disconnects += 1;
    }
    takeRecords(): IntersectionObserverEntry[] {
      return [];
    }
  }

  vi.stubGlobal('IntersectionObserver', ImmediateObserver);

  return state;
}

describe('HomeCounters', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['requestAnimationFrame', 'cancelAnimationFrame', 'performance'] });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    setMediaQueryMatches({});
  });

  it('числа берутся ИЗ ОТВЕТА, а не из длины массива; диктору — подпись и конечное число', () => {
    installIntersectingObserver();
    setMediaQueryMatches({ '(prefers-reduced-motion: reduce)': true });

    render(<HomeCounters overview={OVERVIEW} />);

    // Пары «термин → определение»: подписи — из словаря, числа — из ответа.
    expect(screen.getAllByRole('term').map((term) => term.textContent)).toEqual([
      'Спортсменов',
      'Тренеров',
      'Клубов',
      'Отзывов',
    ]);
    expect(spokenNumber('Спортсменов')).toBe(fmt(12345));
    expect(spokenNumber('Тренеров')).toBe('340');
    expect(spokenNumber('Клубов')).toBe('52');
    expect(spokenNumber('Отзывов')).toBe(fmt(4987));
    // Число — DM Mono 900 зелёным 20px, как в макете (`HomePage.tsx:392`; 38.114).
    const definition = definitionOf('Клубов');
    expect(definition.className).toContain('font-mono');
    expect(definition.className).not.toContain('font-display');
    expect(definition.className).toContain('font-black');
    expect(definition.className).toContain('text-lime');
  });

  it('бегущее число скрыто от диктора, конечное — только для него', () => {
    installIntersectingObserver();

    render(<HomeCounters overview={OVERVIEW} />);

    const definition = definitionOf('Отзывов');
    const [running, spoken] = [...definition.querySelectorAll('span')];

    // Кадры счёта диктор не слышит — иначе читал бы каждый; конечное число он слышит всегда.
    expect(running).toHaveAttribute('aria-hidden', 'true');
    expect(spoken.className).toContain('sr-only');
    expect(spoken.textContent).toBe(fmt(4987));
  });

  it('при prefers-reduced-motion конечное число показано сразу, без счёта', () => {
    installIntersectingObserver();
    setMediaQueryMatches({ '(prefers-reduced-motion: reduce)': true });

    render(<HomeCounters overview={OVERVIEW} />);

    // Ни одного кадра не прошло — а на экране уже конечное.
    expect(shownNumber('Клубов')).toBe('52');
    expect(shownNumber('Отзывов')).toBe(fmt(4987));
  });

  it('с анимацией число растёт от нуля и доходит ровно до конечного', () => {
    installIntersectingObserver();

    render(<HomeCounters overview={OVERVIEW} />);

    // До первого кадра — ноль: счёт начинается с нуля, как в эталоне.
    expect(shownNumber('Отзывов')).toBe('0');

    // Половина пути — число уже не ноль и ещё не конечное.
    act(() => {
      vi.advanceTimersByTime(450);
    });
    const midway = Number(shownNumber('Отзывов')?.replace(/\D/g, ''));

    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(4987);

    // Конец пути — ровно конечное, без «промаха» на округлении.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(shownNumber('Отзывов')).toBe(fmt(4987));
    expect(shownNumber('Клубов')).toBe('52');
  });

  it('счёт стартует по появлению в поле зрения и наблюдатель отключается после первого раза', () => {
    const observer = installIntersectingObserver();
    setMediaQueryMatches({ '(prefers-reduced-motion: reduce)': true });

    render(<HomeCounters overview={OVERVIEW} />);

    // Эталон, step-22: прокрутка из вида и обратно счёт не перезапускает —
    // наблюдатель отключён сразу после первого пересечения.
    expect(observer.disconnects).toBeGreaterThanOrEqual(1);
  });

  it('без наблюдателя пересечений (нет в окружении) счёт не ждёт вечно', () => {
    vi.stubGlobal('IntersectionObserver', undefined);
    setMediaQueryMatches({ '(prefers-reduced-motion: reduce)': true });

    render(<HomeCounters overview={OVERVIEW} />);

    expect(shownNumber('Клубов')).toBe('52');
  });
});
