// Step 25.5: тесты helper'а athlete-streaks — стрики по неделям с хотя бы одной
// completed-тренировкой. Используем фиксированный NOW (среда 2026-04-22), чтобы
// "текущая неделя" детерминированно начиналась с понедельника 2026-04-20.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { computeCurrentStreak, computeMaxStreak } from '@/lib/athlete-streaks';
import type { Booking } from '@/types';

const NOW = new Date('2026-04-22T12:00:00.000Z');

function makeBooking(overrides: Partial<Booking> & Pick<Booking, 'id' | 'date'>): Booking {
  return {
    createdAt: '2026-03-01T00:00:00.000Z',
    scheduleId: 100,
    userId: 1,
    sportId: 3,
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

describe('athlete-streaks (Step 25.5)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('current streak = 0 при отсутствии completed-bookings', () => {
    expect(computeCurrentStreak([], 1)).toBe(0);
    expect(computeMaxStreak([], 1)).toBe(0);
  });

  it('current streak = 3 при трёх подряд неделях с completed (включая текущую)', () => {
    const bookings: Booking[] = [
      // Текущая неделя (понедельник 2026-04-20).
      makeBooking({ id: 1, date: '2026-04-22' }),
      // Неделя 2026-04-13.
      makeBooking({ id: 2, date: '2026-04-15' }),
      // Неделя 2026-04-06.
      makeBooking({ id: 3, date: '2026-04-08' }),
    ];

    expect(computeCurrentStreak(bookings, 1)).toBe(3);
    expect(computeMaxStreak(bookings, 1)).toBe(3);
  });

  it('стрик прерывается пустой неделей в середине истории: current считаем только до разрыва', () => {
    const bookings: Booking[] = [
      // Текущая неделя — есть.
      makeBooking({ id: 1, date: '2026-04-22' }),
      // Неделя 2026-04-13 — пропуск (нет записей).
      // Неделя 2026-04-06 — есть.
      makeBooking({ id: 2, date: '2026-04-08' }),
      // Неделя 2026-03-30 — есть.
      makeBooking({ id: 3, date: '2026-04-01' }),
    ];

    expect(computeCurrentStreak(bookings, 1)).toBe(1);
    expect(computeMaxStreak(bookings, 1)).toBe(2);
  });

  it('max streak больше current: 4 подряд недели в прошлом + 2 подряд недели сейчас', () => {
    const bookings: Booking[] = [
      // Current: 2 подряд недели (2026-04-20 и 2026-04-13).
      makeBooking({ id: 1, date: '2026-04-22' }),
      makeBooking({ id: 2, date: '2026-04-15' }),
      // Gap: 2026-04-06 пустая.
      // Past: 4 подряд недели (2026-03-30, 2026-03-23, 2026-03-16, 2026-03-09).
      makeBooking({ id: 3, date: '2026-04-01' }),
      makeBooking({ id: 4, date: '2026-03-25' }),
      makeBooking({ id: 5, date: '2026-03-18' }),
      makeBooking({ id: 6, date: '2026-03-11' }),
    ];

    expect(computeCurrentStreak(bookings, 1)).toBe(2);
    expect(computeMaxStreak(bookings, 1)).toBe(4);
  });

  it('две completed в одной неделе считаются как одна неделя (edge на границе недели)', () => {
    const bookings: Booking[] = [
      // Понедельник 2026-04-20 и среда 2026-04-22 — одна неделя.
      makeBooking({ id: 1, date: '2026-04-20' }),
      makeBooking({ id: 2, date: '2026-04-22' }),
      // Для проверки, что "два события одной недели" не создают фальшивого стрика в max:
      // если это единственная неделя с completed, max тоже равен 1.
    ];

    expect(computeCurrentStreak(bookings, 1)).toBe(1);
    expect(computeMaxStreak(bookings, 1)).toBe(1);
  });

  it('игнорирует чужих пользователей и не-completed статусы', () => {
    const bookings: Booking[] = [
      // completed — правильный пользователь, текущая неделя.
      makeBooking({ id: 1, date: '2026-04-22' }),
      // no_show того же атлета — не считается.
      makeBooking({ id: 2, date: '2026-04-15', status: 'no_show' }),
      // completed чужого пользователя — не считается.
      makeBooking({ id: 3, date: '2026-04-08', userId: 999 }),
    ];

    // Только текущая неделя прошла в completed → current = 1, max = 1.
    expect(computeCurrentStreak(bookings, 1)).toBe(1);
    expect(computeMaxStreak(bookings, 1)).toBe(1);
  });
});
