// Smoke-тесты на DISCIPLINE_CONFIG — единственный источник "магических чисел"
// дисциплинарных механик (окна FSM-переходов, окна отмены).
// Защищают от случайного изменения значений: любое обновление порогов требует
// осознанной правки этого теста.
//
// ⚠️ Фаза 38, шаг 38.25: два случая про пороги бейджа надёжности (`minCompletedForBadge`,
// `warningThreshold` / `dangerThreshold`) сняты — механизм вырезан, сами пороги уходят
// из конфига шагом 38.26 (реестр `phase-38-reliability-cut.md`, Т6).

import { describe, expect, it } from 'vitest';

import { DISCIPLINE_CONFIG } from '@sporthub/domain';

describe('DISCIPLINE_CONFIG', () => {
  it('экспортирует окно auto-cancel pending-записи (1 час до начала слота)', () => {
    expect(DISCIPLINE_CONFIG.pending.autoCancelHoursBeforeStart).toBe(1);
  });

  it('экспортирует окно check-in после окончания слота (48 часов)', () => {
    expect(DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd).toBe(48);
  });

  it('экспортирует окна бесплатной отмены для всех 4 preset-policy', () => {
    expect(DISCIPLINE_CONFIG.lateCancel.freeUntil.free_anytime).toBe(Number.POSITIVE_INFINITY);
    expect(DISCIPLINE_CONFIG.lateCancel.freeUntil.free_until_24h).toBe(24);
    expect(DISCIPLINE_CONFIG.lateCancel.freeUntil.free_until_2h).toBe(2);
    expect(DISCIPLINE_CONFIG.lateCancel.freeUntil.no_refund).toBe(0);
  });
});
