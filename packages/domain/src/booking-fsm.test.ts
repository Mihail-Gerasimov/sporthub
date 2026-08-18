// Тесты конечного автомата записи. Проверяем правила целиком, а не выборочно:
// перебираем все пары статусов и всех акторов. Так добавление нового статуса
// не сможет пройти незамеченным.

import { describe, expect, it } from 'vitest';

import {
  FSM_TRANSITIONS,
  TRANSITION_ACTORS,
  canTransition,
  getBookedCountDelta,
  validateTransition,
} from './booking-fsm';

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
