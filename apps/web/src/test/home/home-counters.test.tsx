// Тесты счётчиков героя (шаг 38.69).
//
// Главное утверждение — ОТКУДА число: из ответа `/stats/overview`, а не из длины
// поднятого списка (диверсия д-20). Стенд даёт числа, которые невозможно получить
// длиной какого-либо массива на странице, и проверяет их дословно.
// Вторая половина — анимация: считает до конечного числа, при
// `prefers-reduced-motion` показывает конечное сразу, стартует один раз по появлению.

import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { HomeCounters } from '@/components/home/HomeCounters';
import { setMediaQueryMatches } from '@/test/setup';

const OVERVIEW = { athletes: 12345, trainers: 340, clubs: 52, reviews: 4987 };

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

  it('числа берутся ИЗ ОТВЕТА, а не из длины массива, и подписаны для диктора', () => {
    installIntersectingObserver();
    setMediaQueryMatches({ '(prefers-reduced-motion: reduce)': true });

    render(<HomeCounters overview={OVERVIEW} />);

    // Доступное имя связывает подпись и число: «Спортсменов: 12 345».
    expect(screen.getByLabelText('Спортсменов: 12 345')).toBeInTheDocument();
    expect(screen.getByLabelText('Тренеров: 340')).toBeInTheDocument();
    expect(screen.getByLabelText('Клубов: 52')).toBeInTheDocument();
    expect(screen.getByLabelText('Отзывов: 4 987')).toBeInTheDocument();
  });

  it('при prefers-reduced-motion конечное число показано сразу, без счёта', () => {
    installIntersectingObserver();
    setMediaQueryMatches({ '(prefers-reduced-motion: reduce)': true });

    render(<HomeCounters overview={OVERVIEW} />);

    // Ни одного кадра не прошло — а число уже конечное.
    expect(screen.getByLabelText('Клубов: 52')).toHaveTextContent('52');
    expect(screen.getByLabelText('Отзывов: 4 987')).toHaveTextContent('4 987');
  });

  it('с анимацией число растёт от нуля и доходит ровно до конечного', () => {
    installIntersectingObserver();

    render(<HomeCounters overview={OVERVIEW} />);

    const reviews = screen.getByLabelText('Отзывов: 4 987');

    // До первого кадра — ноль: счёт начинается с нуля, как в эталоне.
    expect(reviews).toHaveTextContent('0');

    // Половина пути — число уже не ноль и ещё не конечное.
    act(() => {
      vi.advanceTimersByTime(450);
    });
    const midway = Number(reviews.textContent?.replace(/\D/g, ''));

    expect(midway).toBeGreaterThan(0);
    expect(midway).toBeLessThan(4987);

    // Конец пути — ровно конечное, без «промаха» на округлении.
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(reviews).toHaveTextContent('4 987');
    expect(screen.getByLabelText('Клубов: 52')).toHaveTextContent('52');
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

    expect(screen.getByLabelText('Клубов: 52')).toHaveTextContent('52');
  });
});
