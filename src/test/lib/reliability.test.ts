// Phase 24 Step 24.12: тесты функций reliability — athlete/club/trainer,
// computeCancelReason, isAthleteInQuarantine.
import { describe, expect, it } from 'vitest';

import { DISCIPLINE_CONFIG } from '@/lib/discipline-config';
import {
  computeAthleteReliability,
  computeCancelReason,
  computeClubReliability,
  computeTrainerReliability,
  isAthleteInQuarantine,
} from '@/lib/reliability';
import type { Booking, Schedule } from '@/types';

function makeBooking(overrides: Partial<Booking>): Booking {
  return {
    id: overrides.id ?? 1,
    createdAt: '2026-03-01T00:00:00.000Z',
    scheduleId: 100,
    userId: 1,
    sportId: 3,
    date: '2026-03-15',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1000,
    ...overrides,
  };
}

const config = DISCIPLINE_CONFIG;

describe('computeAthleteReliability', () => {
  it('isNewUser=true при completed < 5', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'completed' }),
      makeBooking({ id: 2, status: 'completed' }),
    ];
    const result = computeAthleteReliability(bookings, 1, config);
    expect(result.isNewUser).toBe(true);
    expect(result.completedCount).toBe(2);
    expect(result.badge).toBeNull();
  });

  it('0 bookings → completionRate=1 и isNewUser=true', () => {
    const result = computeAthleteReliability([], 1, config);
    expect(result.totalRelevant).toBe(0);
    expect(result.completionRate).toBe(1);
    expect(result.isNewUser).toBe(true);
  });

  it('5 completed → isNewUser=false, badge=null', () => {
    const bookings = Array.from({ length: 5 }, (_, i) =>
      makeBooking({ id: i + 1, status: 'completed' }),
    );
    const result = computeAthleteReliability(bookings, 1, config);
    expect(result.isNewUser).toBe(false);
    expect(result.completionRate).toBe(1);
    expect(result.badge).toBeNull();
  });

  it('warning бейдж при completionRate между 75% и 90%', () => {
    // 8 completed + 2 no_show из 10 = 80%
    const bookings = [
      ...Array.from({ length: 8 }, (_, i) => makeBooking({ id: i + 1, status: 'completed' })),
      makeBooking({ id: 9, status: 'no_show' }),
      makeBooking({ id: 10, status: 'no_show' }),
    ];
    const result = computeAthleteReliability(bookings, 1, config);
    expect(result.completionRate).toBeCloseTo(0.8);
    expect(result.badge).toBe('warning');
  });

  it('danger бейдж при completionRate < 75%', () => {
    const bookings = [
      ...Array.from({ length: 5 }, (_, i) => makeBooking({ id: i + 1, status: 'completed' })),
      ...Array.from({ length: 5 }, (_, i) => makeBooking({ id: i + 10, status: 'no_show' })),
    ];
    const result = computeAthleteReliability(bookings, 1, config);
    expect(result.completionRate).toBe(0.5);
    expect(result.badge).toBe('danger');
  });

  it('late cancel попадает в relevant и знаменатель', () => {
    const bookings = [
      ...Array.from({ length: 9 }, (_, i) => makeBooking({ id: i + 1, status: 'completed' })),
      makeBooking({ id: 10, status: 'cancelled_by_athlete', cancelReason: 'late' }),
    ];
    const result = computeAthleteReliability(bookings, 1, config);
    expect(result.totalRelevant).toBe(10);
    expect(result.lateCancelCount).toBe(1);
    expect(result.completionRate).toBeCloseTo(0.9);
  });

  it('on_time cancel НЕ попадает в relevant', () => {
    const bookings = [
      ...Array.from({ length: 5 }, (_, i) => makeBooking({ id: i + 1, status: 'completed' })),
      makeBooking({ id: 10, status: 'cancelled_by_athlete', cancelReason: 'on_time' }),
    ];
    const result = computeAthleteReliability(bookings, 1, config);
    expect(result.totalRelevant).toBe(5);
    expect(result.completionRate).toBe(1);
  });
});

describe('computeClubReliability', () => {
  it('учитывает completed + no_show как held, cancelled_by_provider снижает', () => {
    const bookings = [
      makeBooking({ id: 1, clubId: 10, status: 'completed' }),
      makeBooking({ id: 2, clubId: 10, status: 'completed' }),
      makeBooking({ id: 3, clubId: 10, status: 'no_show' }),
      makeBooking({ id: 4, clubId: 10, status: 'cancelled_by_provider' }),
      makeBooking({ id: 5, clubId: 10, status: 'rejected_by_provider' }),
      // Другой клуб не должен учитываться.
      makeBooking({ id: 6, clubId: 20, status: 'completed' }),
    ];
    const result = computeClubReliability(bookings, 10, config);
    expect(result.totalRelevant).toBe(5);
    expect(result.completedCount).toBe(2);
    expect(result.noShowCount).toBe(1);
    expect(result.rejectedByProviderCount).toBe(1);
    // held = 3; total = 5 → 60% danger.
    expect(result.completionRate).toBeCloseTo(0.6);
    expect(result.isNewUser).toBe(true); // held < 5
    expect(result.badge).toBeNull(); // isNewUser скрывает badge
  });

  it('cancelled_by_athlete НЕ учитывается в клубной reliability', () => {
    const bookings = Array.from({ length: 10 }, (_, i) => {
      if (i < 7) return makeBooking({ id: i + 1, clubId: 10, status: 'completed' });
      return makeBooking({
        id: i + 1,
        clubId: 10,
        status: 'cancelled_by_athlete',
        cancelReason: 'on_time',
      });
    });
    const result = computeClubReliability(bookings, 10, config);
    expect(result.totalRelevant).toBe(7);
    expect(result.completionRate).toBe(1);
    expect(result.isNewUser).toBe(false);
  });

  it('резолв по ownerType=club / ownerId как fallback', () => {
    const bookings = [
      makeBooking({ id: 1, ownerType: 'club', ownerId: 10, status: 'completed' }),
      makeBooking({ id: 2, ownerType: 'club', ownerId: 10, status: 'no_show' }),
    ];
    const result = computeClubReliability(bookings, 10, config);
    expect(result.totalRelevant).toBe(2);
  });
});

describe('computeTrainerReliability', () => {
  it('резолв по trainerId', () => {
    const bookings = [
      makeBooking({ id: 1, trainerId: 5, status: 'completed' }),
      makeBooking({ id: 2, trainerId: 5, status: 'rejected_by_provider' }),
      makeBooking({ id: 3, trainerId: 6, status: 'completed' }),
    ];
    const result = computeTrainerReliability(bookings, 5, config);
    expect(result.totalRelevant).toBe(2);
    expect(result.completedCount).toBe(1);
    expect(result.rejectedByProviderCount).toBe(1);
    expect(result.completionRate).toBe(0.5);
  });
});

describe('computeCancelReason', () => {
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

  it('free_anytime → всегда on_time', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_anytime' });
    const now = new Date('2026-04-10T11:59:00.000Z');
    expect(computeCancelReason(booking, slot, now, config)).toBe('on_time');
  });

  it('no_refund → всегда late', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'no_refund' });
    const now = new Date('2026-04-01T00:00:00.000Z'); // за 9 дней до слота
    expect(computeCancelReason(booking, slot, now, config)).toBe('late');
  });

  it('free_until_24h: в окне → on_time', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_until_24h' });
    // Слот 2026-04-10 12:00 в локальном TZ; берём >48h запас, чтобы перекрыть любой TZ.
    const now = new Date('2026-04-07T00:00:00.000Z');
    expect(computeCancelReason(booking, slot, now, config)).toBe('on_time');
  });

  it('free_until_24h: меньше 24h → late', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_until_24h' });
    // Слот 2026-04-10 12:00 локальн.; «за несколько часов» — с запасом к late.
    const now = new Date('2026-04-10T06:00:00.000Z');
    expect(computeCancelReason(booking, slot, now, config)).toBe('late');
  });

  it('slot=null → late (защитный дефолт)', () => {
    const booking = makeBooking({ cancellationPolicySnapshot: 'free_until_24h' });
    const now = new Date('2026-04-01T00:00:00.000Z');
    expect(computeCancelReason(booking, null, now, config)).toBe('late');
  });

  it('fallback policy=free_until_24h когда snapshot отсутствует', () => {
    const booking = makeBooking({}); // без cancellationPolicySnapshot
    const now = new Date('2026-04-01T00:00:00.000Z'); // ~9 дней до слота — точно on_time
    expect(computeCancelReason(booking, slot, now, config)).toBe('on_time');
  });
});

describe('isAthleteInQuarantine', () => {
  const now = new Date('2026-04-21T00:00:00.000Z');

  it('нет карантина при 0 bookings', () => {
    expect(isAthleteInQuarantine([], 1, now, { config })).toEqual({ inQuarantine: false });
  });

  it('нет карантина при < 3 no_show подряд', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'no_show', date: '2026-04-10' }),
      makeBooking({ id: 2, status: 'no_show', date: '2026-04-15' }),
    ];
    expect(isAthleteInQuarantine(bookings, 1, now, { config }).inQuarantine).toBe(false);
  });

  it('3 no_show подряд в окне 30 дней → карантин 7 дней', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'no_show', date: '2026-04-10' }),
      makeBooking({ id: 2, status: 'no_show', date: '2026-04-15' }),
      makeBooking({ id: 3, status: 'no_show', date: '2026-04-20' }),
    ];
    const result = isAthleteInQuarantine(bookings, 1, now, { config });
    expect(result.inQuarantine).toBe(true);
    expect(result.until).toBeDefined();
  });

  it('3 no_show но один completed посередине → карантин НЕ срабатывает', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'no_show', date: '2026-04-10' }),
      makeBooking({
        id: 2,
        status: 'completed',
        date: '2026-04-13',
        completedAt: '2026-04-13T12:00:00.000Z',
      }),
      makeBooking({ id: 3, status: 'no_show', date: '2026-04-15' }),
      makeBooking({ id: 4, status: 'no_show', date: '2026-04-20' }),
    ];
    const result = isAthleteInQuarantine(bookings, 1, now, { config });
    // Последние 3: completed, no_show, no_show — НЕ все no_show
    expect(result.inQuarantine).toBe(false);
  });

  it('карантин истёк → inQuarantine=false', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'no_show', date: '2026-04-01' }),
      makeBooking({ id: 2, status: 'no_show', date: '2026-04-03' }),
      makeBooking({ id: 3, status: 'no_show', date: '2026-04-05' }),
    ];
    // last no_show 2026-04-05 23:59 + 7 дней ≈ 2026-04-12. now = 21 апреля.
    const result = isAthleteInQuarantine(bookings, 1, now, { config });
    expect(result.inQuarantine).toBe(false);
  });

  it('bookings другого пользователя не учитываются', () => {
    const bookings = [
      makeBooking({ id: 1, userId: 2, status: 'no_show', date: '2026-04-18' }),
      makeBooking({ id: 2, userId: 2, status: 'no_show', date: '2026-04-19' }),
      makeBooking({ id: 3, userId: 2, status: 'no_show', date: '2026-04-20' }),
    ];
    expect(isAthleteInQuarantine(bookings, 1, now, { config }).inQuarantine).toBe(false);
  });

  // Phase 24 Step 24.15: admin-снятие карантина через User.quarantineLiftedAt.
  it('quarantineLiftedAt после последнего no_show → inQuarantine=false', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'no_show', date: '2026-04-18' }),
      makeBooking({ id: 2, status: 'no_show', date: '2026-04-19' }),
      makeBooking({ id: 3, status: 'no_show', date: '2026-04-20' }),
    ];
    // last no_show ≈ 2026-04-20T23:59:59Z; lift через день после
    const result = isAthleteInQuarantine(bookings, 1, now, {
      config,
      quarantineLiftedAt: '2026-04-21T00:00:00.000Z',
    });
    expect(result.inQuarantine).toBe(false);
  });

  it('quarantineLiftedAt ДО последнего no_show → карантин действует', () => {
    const bookings = [
      makeBooking({ id: 1, status: 'no_show', date: '2026-04-18' }),
      makeBooking({ id: 2, status: 'no_show', date: '2026-04-19' }),
      makeBooking({ id: 3, status: 'no_show', date: '2026-04-20' }),
    ];
    // lift был раньше последнего no_show — не считается (новый инцидент после снятия)
    const result = isAthleteInQuarantine(bookings, 1, now, {
      config,
      quarantineLiftedAt: '2026-04-15T00:00:00.000Z',
    });
    expect(result.inQuarantine).toBe(true);
  });
});
