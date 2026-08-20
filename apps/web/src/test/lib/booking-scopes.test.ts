// Сторож наборов статусов, которыми страницы сужают запрос записей.
//
// Наборы в `@/lib/booking-scopes` выведены из правил домена, но объявлены отдельно
// от них — иначе сузить запрос было бы нечем. Разъехавшись, они дают самую тихую
// поломку из возможных: страница спрашивает меньше, чем читает, счётчик становится
// меньше, а выглядит всё по-прежнему рабочим.
//
// Поэтому здесь проверяется не совпадение списков, а ПОВЕДЕНИЕ: через сами доменные
// функции прогоняются записи всех восьми статусов, и набор тех, на которые функция
// отреагировала, сравнивается с объявленным.

import {
  computeAthleteReliability,
  computeClubReliability,
  computeTrainerReliability,
  DISCIPLINE_CONFIG,
  isAthleteInQuarantine,
} from '@sporthub/domain';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@sporthub/types';
import { describe, expect, it } from 'vitest';

import {
  ATHLETE_RELIABILITY_STATUSES,
  getQuarantineDateFrom,
  PROVIDER_RELIABILITY_STATUSES,
  QUARANTINE_LOOKBACK_DAYS,
  QUARANTINE_STATUSES,
} from '@/lib/booking-scopes';

const NOW = new Date('2026-05-20T12:00:00.000Z');

/** Запись клуба 1, тренера 1 и атлета 1 — одна на статус. */
function bookingOf(status: BookingStatus, over: Partial<Booking> = {}): Booking {
  return {
    id: 1,
    createdAt: '2026-05-01T10:00:00.000Z',
    scheduleId: 1,
    userId: 1,
    ownerType: 'club',
    ownerId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 1,
    date: '2026-05-01',
    status,
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    // Поздняя отмена — единственный подвид, который читает расчёт надёжности атлета.
    ...(status === 'cancelled_by_athlete' ? { cancelReason: 'late' as const } : {}),
    ...over,
  };
}

/** Статусы, на которые правило отреагировало: запись попала в знаменатель. */
function statusesCountedBy(compute: (bookings: Booking[]) => { totalRelevant: number }) {
  return BOOKING_STATUSES.filter((status) => compute([bookingOf(status)]).totalRelevant === 1);
}

describe('Наборы статусов для сужения запроса записей', () => {
  it('надёжность клуба читает ровно PROVIDER_RELIABILITY_STATUSES', () => {
    expect(statusesCountedBy((bookings) => computeClubReliability(bookings, 1)).sort()).toEqual(
      [...PROVIDER_RELIABILITY_STATUSES].sort(),
    );
  });

  it('надёжность тренера читает тот же набор', () => {
    expect(statusesCountedBy((bookings) => computeTrainerReliability(bookings, 1)).sort()).toEqual(
      [...PROVIDER_RELIABILITY_STATUSES].sort(),
    );
  });

  it('надёжность атлета читает ровно ATHLETE_RELIABILITY_STATUSES', () => {
    expect(statusesCountedBy((bookings) => computeAthleteReliability(bookings, 1)).sort()).toEqual(
      [...ATHLETE_RELIABILITY_STATUSES].sort(),
    );
  });

  describe('карантин', () => {
    const trigger = DISCIPLINE_CONFIG.quarantine.consecutiveNoShowTrigger;
    const noShowRun = Array.from({ length: trigger }, (_, index) =>
      bookingOf('no_show', { id: index + 1, date: '2026-05-18' }),
    );

    it('срабатывает на неявках подряд', () => {
      expect(isAthleteInQuarantine(noShowRun, 1, NOW).inQuarantine).toBe(true);
    });

    it('завершённое занятие рвёт серию — значит статус читается правилом', () => {
      const withCompleted = [
        ...noShowRun.slice(0, trigger - 1),
        bookingOf('completed', { id: 99, date: '2026-05-19' }),
      ];

      expect(QUARANTINE_STATUSES).toContain('completed');
      expect(isAthleteInQuarantine(withCompleted, 1, NOW).inQuarantine).toBe(false);
    });

    it('статусы вне набора карантин не запускают', () => {
      const outside = BOOKING_STATUSES.filter((status) => !QUARANTINE_STATUSES.includes(status));

      for (const status of outside) {
        const run = Array.from({ length: trigger }, (_, index) =>
          bookingOf(status, { id: index + 1, date: '2026-05-18' }),
        );

        expect(isAthleteInQuarantine(run, 1, NOW).inQuarantine).toBe(false);
      }
    });

    it('нижняя граница периода не уже окна правила', () => {
      // Окно правила плюс запас на отметку исхода: отметить занятие провайдер вправе
      // уже следующим днём, и без запаса такая запись выпала бы из отбора.
      expect(QUARANTINE_LOOKBACK_DAYS).toBeGreaterThan(DISCIPLINE_CONFIG.quarantine.windowDays);
      expect(getQuarantineDateFrom('2026-05-20')).toBe('2026-04-18');
    });
  });
});
