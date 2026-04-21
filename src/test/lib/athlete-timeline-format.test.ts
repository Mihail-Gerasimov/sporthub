// Тесты helper'а formatStatusHistoryForAthlete (Step 25.4): конвертирует BookingStatusTransition
// в user-friendly строки для атлета без actor-кодов, скрывая автопереходы (actor='system').
import { describe, expect, it } from 'vitest';

import { formatStatusHistoryForAthlete } from '@/lib/athlete-timeline-format';
import type { BookingStatusTransition } from '@/types';

describe('formatStatusHistoryForAthlete', () => {
  it('athlete actor: создание + late-отмена — «Вы записались» и «Вы отменили (поздняя отмена)»', () => {
    const history: BookingStatusTransition[] = [
      {
        from: null,
        to: 'pending',
        actor: 'athlete',
        at: '2026-04-20T10:00:00.000Z',
      },
      {
        from: 'confirmed',
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        at: '2026-04-22T15:00:00.000Z',
        reason: 'late',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result).toHaveLength(2);
    expect(result[0]).toMatchObject({
      label: 'Вы записались',
      at: '2026-04-20T10:00:00.000Z',
    });
    expect(result[1].label).toMatch(/Вы отменили/);
    expect(result[1].label).toMatch(/поздняя отмена/i);
    expect(result[1].at).toBe('2026-04-22T15:00:00.000Z');
  });

  it('provider actor: подтверждение и отмена — «Провайдер подтвердил» и «Провайдер отменил»', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'pending',
        to: 'confirmed',
        actor: 'provider',
        at: '2026-04-21T12:00:00.000Z',
      },
      {
        from: 'confirmed',
        to: 'cancelled_by_provider',
        actor: 'provider',
        at: '2026-04-22T09:00:00.000Z',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result.map((entry) => entry.label)).toEqual([
      'Провайдер подтвердил',
      'Провайдер отменил',
    ]);
  });

  it('admin actor — лейбл помечен «Админ»', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'confirmed',
        to: 'completed',
        actor: 'admin',
        at: '2026-04-22T18:00:00.000Z',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result).toHaveLength(1);
    expect(result[0].label).toMatch(/Админ/);
  });

  it('system actor: автопереходы скрыты — в таймлайне атлета не отображаем', () => {
    const history: BookingStatusTransition[] = [
      {
        from: null,
        to: 'pending',
        actor: 'athlete',
        at: '2026-04-20T10:00:00.000Z',
      },
      {
        from: 'pending',
        to: 'cancelled_by_provider',
        actor: 'system',
        at: '2026-04-22T07:00:00.000Z',
        reason: 'auto_cancel_timeout',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result).toEqual([
      {
        label: 'Вы записались',
        at: '2026-04-20T10:00:00.000Z',
      },
    ]);
  });
});
