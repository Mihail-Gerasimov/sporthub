// Тесты конечного автомата записи. Проверяем правила целиком, а не выборочно:
// перебираем все пары статусов и всех акторов. Так добавление нового статуса
// не сможет пройти незамеченным.

import { describe, expect, it } from 'vitest';

import type { Booking, Schedule } from '@sporthub/types';

import {
  FSM_TRANSITIONS,
  TRANSITION_ACTORS,
  canTransition,
  computeCancelReason,
  getBookedCountDelta,
  validateTransition,
} from './booking-fsm';
import { DISCIPLINE_CONFIG } from './discipline-config';

const ALL_STATUSES = Object.keys(FSM_TRANSITIONS) as (keyof typeof FSM_TRANSITIONS)[];
const ALL_ACTORS = ['athlete', 'provider', 'admin', 'system'] as const;

describe('FSM записи', () => {
  describe('граф переходов', () => {
    it('из ожидания есть четыре ветви, из подтверждённой — пять', () => {
      expect(FSM_TRANSITIONS.pending).toHaveLength(4);
      expect(FSM_TRANSITIONS.confirmed).toHaveLength(5);
    });

    it('финальные статусы не имеют исходящих переходов', () => {
      for (const status of [
        'completed',
        'no_show',
        'unmarked',
        'rejected_by_provider',
        'cancelled_by_athlete',
        'cancelled_by_provider',
      ] as const) {
        expect(FSM_TRANSITIONS[status]).toEqual([]);
      }
    });

    it('каждый разрешённый переход имеет запись о допустимых акторах', () => {
      for (const from of ALL_STATUSES) {
        for (const to of FSM_TRANSITIONS[from]) {
          expect(TRANSITION_ACTORS[`${from}->${to}`]).toBeDefined();
        }
      }
    });
  });

  describe('validateTransition', () => {
    it('пропускает все разрешённые пары с их законными акторами', () => {
      for (const from of ALL_STATUSES) {
        for (const to of FSM_TRANSITIONS[from]) {
          for (const actor of TRANSITION_ACTORS[`${from}->${to}`] ?? []) {
            expect(() => validateTransition(from, to, actor)).not.toThrow();
          }
        }
      }
    });

    it('отклоняет любую пару, которой нет в графе', () => {
      for (const from of ALL_STATUSES) {
        const allowed = new Set(FSM_TRANSITIONS[from]);
        for (const to of ALL_STATUSES) {
          if (allowed.has(to)) continue;

          expect(() => validateTransition(from, to, 'admin')).toThrow(
            `Недопустимый переход booking: ${from} → ${to}`,
          );
        }
      }
    });

    it('администратору разрешён любой допустимый переход', () => {
      for (const from of ALL_STATUSES) {
        for (const to of FSM_TRANSITIONS[from]) {
          expect(() => validateTransition(from, to, 'admin')).not.toThrow();
        }
      }
    });

    it('актору без права отказывает с дословным текстом', () => {
      // Атлет не может подтвердить свою же заявку — это право провайдера.
      expect(() => validateTransition('pending', 'confirmed', 'athlete')).toThrow(
        "Actor 'athlete' не может выполнять переход pending → confirmed",
      );
    });

    it('ни один актор, кроме перечисленных и админа, не проходит', () => {
      for (const from of ALL_STATUSES) {
        for (const to of FSM_TRANSITIONS[from]) {
          const legal = new Set<string>([...(TRANSITION_ACTORS[`${from}->${to}`] ?? []), 'admin']);
          for (const actor of ALL_ACTORS) {
            if (legal.has(actor)) continue;

            expect(() => validateTransition(from, to, actor)).toThrow(
              `Actor '${actor}' не может выполнять переход ${from} → ${to}`,
            );
          }
        }
      }
    });
  });

  describe('getBookedCountDelta', () => {
    it('отмена и отказ освобождают место', () => {
      for (const to of [
        'cancelled_by_athlete',
        'cancelled_by_provider',
        'rejected_by_provider',
      ] as const) {
        expect(getBookedCountDelta('pending', to)).toBe(-1);
      }
    });

    it('завершение, неявка и «не отмечено» счётчик не трогают', () => {
      for (const to of ['completed', 'no_show', 'unmarked', 'confirmed'] as const) {
        expect(getBookedCountDelta('confirmed', to)).toBe(0);
      }
    });
  });

  describe('canTransition', () => {
    it('совпадает с графом переходов', () => {
      for (const from of ALL_STATUSES) {
        for (const to of ALL_STATUSES) {
          expect(canTransition(from, to)).toBe(FSM_TRANSITIONS[from].includes(to));
        }
      }
    });
  });
});

// Правило «отмена вовремя или поздно» (фаза 38, шаг 38.23 — переехало из файла
// надёжности вместе с функцией). Проверяется по политике, замороженной в записи,
// и по часам до начала слота; слот всегда один и тот же, меняется только «сейчас».
describe('computeCancelReason', () => {
  const makeBooking = (overrides: Partial<Booking>): Booking => ({
    id: 1,
    createdAt: '2026-03-01T00:00:00.000Z',
    scheduleId: 100,
    userId: 1,
    sportId: 3,
    date: '2026-03-15',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  });

  const slot: Schedule = {
    id: 100,
    createdAt: '2026-03-01T00:00:00.000Z',
    sportId: 3,
    title: 'Тренировка',
    date: '2026-04-10',
    startTime: '12:00',
    endTime: '13:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 1,
    bookedCount: 0,
    price: 1000,
  };

  const config = DISCIPLINE_CONFIG;

  it('free_anytime → всегда on_time', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_anytime' });
    const now = new Date('2026-04-10T11:59:00.000Z');

    expect(computeCancelReason(booking, slot, now, config)).toBe('on_time');
  });

  it('no_refund → всегда late', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'no_refund' });
    // За девять дней до слота — и всё равно поздно: окна нет.
    const now = new Date('2026-04-01T00:00:00.000Z');

    expect(computeCancelReason(booking, slot, now, config)).toBe('late');
  });

  it('free_until_24h: в окне → on_time', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_until_24h' });
    // Запас больше двух суток, чтобы перекрыть любой часовой пояс зала.
    const now = new Date('2026-04-07T00:00:00.000Z');

    expect(computeCancelReason(booking, slot, now, config)).toBe('on_time');
  });

  it('free_until_24h: меньше 24 часов → late', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_until_24h' });
    const now = new Date('2026-04-10T06:00:00.000Z');

    expect(computeCancelReason(booking, slot, now, config)).toBe('late');
  });

  it('слот не найден → late (защитный дефолт)', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_until_24h' });
    const now = new Date('2026-04-01T00:00:00.000Z');

    expect(computeCancelReason(booking, null, now, config)).toBe('late');
  });

  it('без снимка политики действует free_until_24h', () => {
    const booking = makeBooking({});
    const now = new Date('2026-04-01T00:00:00.000Z');

    expect(computeCancelReason(booking, slot, now, config)).toBe('on_time');
  });
});
