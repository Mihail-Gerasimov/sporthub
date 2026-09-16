// Сторож словарей действий журнала (фаза 38, шаг 38.26).
//
// Живые действия (`ACTION_LABELS`, по `LOG_ACTIONS`) и словарь прошлого
// (`LEGACY_ACTION_LABELS`) — два словаря с одним смыслом «подпись действия», и
// граница между ними одна: есть ли у значения писатель. Значение, попавшее в оба,
// означало бы, что механизм 37.29 сломан: действие и живое, и историческое сразу.
// Обратная половина: у каждого исторического значения ЕСТЬ подпись, а живому она
// не нужна дважды.

import { describe, expect, it } from 'vitest';

import { ACTION_LABELS, ACTION_TONES, LEGACY_ACTION_LABELS } from '@/lib/log-action-labels';
import { LOG_ACTIONS } from '@sporthub/types';

describe('словари действий журнала', () => {
  it('историческое значение не бывает живым: словарь прошлого не пересекается с LOG_ACTIONS', () => {
    const revived = Object.keys(LEGACY_ACTION_LABELS).filter((action) =>
      (LOG_ACTIONS as readonly string[]).includes(action),
    );

    expect(
      revived,
      'у исторического действия снова появился писатель — уберите из прошлого',
    ).toEqual([]);
  });

  it('у каждого живого действия есть подпись и тон, у исторического — подпись', () => {
    for (const action of LOG_ACTIONS) {
      expect(ACTION_LABELS[action], action).toBeTruthy();
      expect(ACTION_TONES[action], action).toBeTruthy();
    }

    // Снятые с надёжностью и в 37.29 значения читаются с подписью, а не сырой строкой.
    for (const action of ['reliability_recompute', 'admin_login', 'moderation_auto_restore']) {
      expect(LEGACY_ACTION_LABELS[action], action).toBeTruthy();
    }
  });
});
