// Тесты русского склонения по числу (шаг 38.53): одно правило вместо десяти копий.
import { describe, expect, it } from 'vitest';

import { countRu, pluralRu } from '@/lib/plural';

const REVIEW = ['отзыв', 'отзыва', 'отзывов'] as const;

describe('pluralRu / countRu', () => {
  it('различает три формы, включая «11–14» и «21»', () => {
    const cases: Array<[number, string]> = [
      [0, 'отзывов'],
      [1, 'отзыв'],
      [2, 'отзыва'],
      [4, 'отзыва'],
      [5, 'отзывов'],
      [11, 'отзывов'],
      [12, 'отзывов'],
      [14, 'отзывов'],
      [21, 'отзыв'],
      [22, 'отзыва'],
      [25, 'отзывов'],
      [101, 'отзыв'],
      [111, 'отзывов'],
    ];

    for (const [count, expected] of cases) {
      expect(pluralRu(count, REVIEW), String(count)).toBe(expected);
    }
  });

  it('countRu ставит число перед словом', () => {
    expect(countRu(3, REVIEW)).toBe('3 отзыва');
    expect(countRu(0, ['тренер', 'тренера', 'тренеров'])).toBe('0 тренеров');
  });
});
