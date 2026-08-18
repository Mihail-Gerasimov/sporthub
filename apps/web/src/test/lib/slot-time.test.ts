/**
 * Phase 30.7: unit-тест pure-helper'а isSlotUpcoming.
 * DEFAULT_TIME_ZONE = 'Europe/Samara' (UTC+4) → проверяем что
 * сравнение TZ-safe через строки и не зависит от системного TZ.
 */
import { describe, expect, it } from 'vitest';

import { isSlotUpcoming } from '@/lib/slot-time';

describe('isSlotUpcoming (Phase 30.7)', () => {
  it('будущая дата → true', () => {
    const now = new Date('2026-05-07T10:00:00.000Z'); // 14:00 Samara
    expect(isSlotUpcoming({ date: '2026-05-08', endTime: '00:01' }, now)).toBe(true);
    expect(isSlotUpcoming({ date: '2026-12-31', endTime: '23:59' }, now)).toBe(true);
  });

  it('прошедшая дата → false', () => {
    const now = new Date('2026-05-07T10:00:00.000Z');
    expect(isSlotUpcoming({ date: '2026-05-06', endTime: '23:59' }, now)).toBe(false);
    expect(isSlotUpcoming({ date: '2025-01-01', endTime: '23:59' }, now)).toBe(false);
  });

  it('сегодня + endTime ещё не наступило → true', () => {
    // 10:00 UTC = 14:00 Europe/Samara, слот заканчивается в 18:00 — ещё впереди
    const now = new Date('2026-05-07T10:00:00.000Z');
    expect(isSlotUpcoming({ date: '2026-05-07', endTime: '18:00' }, now)).toBe(true);
    expect(isSlotUpcoming({ date: '2026-05-07', endTime: '14:01' }, now)).toBe(true);
  });

  it('сегодня + endTime уже прошло → false', () => {
    // 10:00 UTC = 14:00 Europe/Samara, слот завершился в 08:30 → прошёл
    const now = new Date('2026-05-07T10:00:00.000Z');
    expect(isSlotUpcoming({ date: '2026-05-07', endTime: '08:30' }, now)).toBe(false);
    expect(isSlotUpcoming({ date: '2026-05-07', endTime: '13:59' }, now)).toBe(false);
  });

  it('TZ edge: now перед полуночью UTC, в Samara уже следующий день', () => {
    // 22:00 UTC = 02:00 Samara следующего дня
    const now = new Date('2026-05-07T22:00:00.000Z');
    // todayKey в Samara = '2026-05-08'
    // слот '2026-05-07' с endTime '23:00' → дата ПРОШЛА в Samara → false
    expect(isSlotUpcoming({ date: '2026-05-07', endTime: '23:00' }, now)).toBe(false);
    // слот '2026-05-08' (тот же день в Samara) с endTime '03:00' → ещё впереди (now=02:00)
    expect(isSlotUpcoming({ date: '2026-05-08', endTime: '03:00' }, now)).toBe(true);
    // слот '2026-05-08' с endTime '01:30' → уже прошёл (now=02:00 Samara)
    expect(isSlotUpcoming({ date: '2026-05-08', endTime: '01:30' }, now)).toBe(false);
  });
});
