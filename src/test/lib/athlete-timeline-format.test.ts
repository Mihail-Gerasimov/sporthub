// Тесты helper'а formatStatusHistoryForAthlete (Step 25.4): конвертирует BookingStatusTransition
// в user-friendly строки для атлета без actor-кодов, скрывая автопереходы (actor='system').
import { describe, expect, it } from 'vitest';

import { formatStatusHistoryForAthlete } from '@/lib/athlete-timeline-format';
import type { BookingStatusTransition } from '@sporthub/types';

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

  // Phase 27 Step 27.5: исключение для auto-expire pending — system-событие показываем,
  // чтобы атлет увидел причину отмены своей записи.
  it('system actor + reason=auto_cancel_pending_expired: событие показываем с понятным лейблом', () => {
    const history: BookingStatusTransition[] = [
      {
        from: null,
        to: 'pending',
        actor: 'athlete',
        at: '2026-04-22T09:00:00.000Z',
      },
      {
        from: 'pending',
        to: 'cancelled_by_provider',
        actor: 'system',
        at: '2026-04-22T10:00:00.000Z',
        reason: 'auto_cancel_pending_expired',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result).toHaveLength(2);
    expect(result[0].label).toBe('Вы записались');
    expect(result[1]).toMatchObject({
      at: '2026-04-22T10:00:00.000Z',
    });
    expect(result[1].label).toMatch(/автоматически/i);
    expect(result[1].label).toMatch(/провайдер не подтвердил/i);
  });

  // Phase 27 Step 27.14: причина отказа провайдера приходит свободной строкой через
  // POST /api/bookings/[id]/reject и хранится в transition.reason. Таймлайн атлета
  // должен дописать «. Причина: …» симметрично формату notification-copy.ts.
  it('Step 27.14 — provider + rejected_by_provider + reason: дописывает причину к лейблу', () => {
    const history: BookingStatusTransition[] = [
      {
        from: null,
        to: 'pending',
        actor: 'athlete',
        at: '2026-04-27T10:00:00.000Z',
      },
      {
        from: 'pending',
        to: 'rejected_by_provider',
        actor: 'provider',
        at: '2026-04-27T10:30:00.000Z',
        reason: 'Время не подходит',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result).toHaveLength(2);
    expect(result[1].label).toBe('Провайдер отклонил. Причина: Время не подходит');
  });

  it('Step 27.14 — provider + rejected_by_provider БЕЗ reason: лейбл без суффикса (обратная совместимость)', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'pending',
        to: 'rejected_by_provider',
        actor: 'provider',
        at: '2026-04-27T10:30:00.000Z',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result[0].label).toBe('Провайдер отклонил');
  });

  it('Step 27.14 — provider + cancelled_by_provider + reason: дописывает причину к лейблу', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'confirmed',
        to: 'cancelled_by_provider',
        actor: 'provider',
        at: '2026-04-27T11:00:00.000Z',
        reason: 'Тренер заболел',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result[0].label).toBe('Провайдер отменил. Причина: Тренер заболел');
  });

  it('Step 27.14 — provider + cancelled_by_provider БЕЗ reason: лейбл без суффикса', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'confirmed',
        to: 'cancelled_by_provider',
        actor: 'provider',
        at: '2026-04-27T11:00:00.000Z',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result[0].label).toBe('Провайдер отменил');
  });

  it('Step 27.14 — provider + reason из пробелов: лейбл без суффикса (trim в helper)', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'pending',
        to: 'rejected_by_provider',
        actor: 'provider',
        at: '2026-04-27T10:30:00.000Z',
        reason: '   ',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result[0].label).toBe('Провайдер отклонил');
  });

  // Регрессия Step 27.14: служебный CancelReason 'late' у athlete-actor НЕ должен
  // утечь в UI как «. Причина: late» — он уже зашит в самом лейбле «(поздняя отмена)».
  it('Step 27.14 — athlete + cancelled_by_athlete + reason=late: служебный код НЕ утекает в UI', () => {
    const history: BookingStatusTransition[] = [
      {
        from: 'confirmed',
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        at: '2026-04-27T12:00:00.000Z',
        reason: 'late',
      },
    ];

    const result = formatStatusHistoryForAthlete(history);

    expect(result[0].label).toBe('Вы отменили (поздняя отмена)');
    expect(result[0].label).not.toMatch(/Причина:/);
  });
});
