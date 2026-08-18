// Smoke-тесты на DISCIPLINE_CONFIG — единственный источник "магических чисел"
// дисциплинарных механик (пороги рейтингов, окна FSM-переходов, параметры карантина).
// Защищают от случайного изменения значений: любое обновление порогов требует
// осознанной правки этого теста.

import { describe, expect, it } from 'vitest';

import { DISCIPLINE_CONFIG } from '@sporthub/domain';

describe('DISCIPLINE_CONFIG', () => {
  it('экспортирует минимум completed для публичного бейджа надёжности', () => {
    expect(DISCIPLINE_CONFIG.minCompletedForBadge).toBe(5);
  });

  it('экспортирует процентные пороги бейджей warning и danger', () => {
    expect(DISCIPLINE_CONFIG.reliability.warningThreshold).toBe(0.9);
    expect(DISCIPLINE_CONFIG.reliability.dangerThreshold).toBe(0.75);
  });

  it('экспортирует параметры карантина: 3 no_show подряд за 30 дней на 7 дней', () => {
    expect(DISCIPLINE_CONFIG.quarantine.consecutiveNoShowTrigger).toBe(3);
    expect(DISCIPLINE_CONFIG.quarantine.windowDays).toBe(30);
    expect(DISCIPLINE_CONFIG.quarantine.durationDays).toBe(7);
  });

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
