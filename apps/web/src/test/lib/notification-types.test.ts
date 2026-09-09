// Phase 25 Step 25.14: тесты helpers notification-types.
import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_TYPE_AUDIENCE,
  canDisableNotificationType,
  isNotificationTypeApplicable,
  isNotificationTypeEnabled,
  REQUIRED_NOTIFICATION_TYPES,
} from '@sporthub/domain';
import type { NotificationType, User } from '@sporthub/types';

describe('notification-types (Step 25.14)', () => {
  it('canDisableNotificationType: required типы нельзя отключить', () => {
    for (const type of REQUIRED_NOTIFICATION_TYPES) {
      expect(canDisableNotificationType(type)).toBe(false);
    }
    // Примеры non-required — можно.
    expect(canDisableNotificationType('booking_rejected')).toBe(true);
    expect(canDisableNotificationType('link_requested')).toBe(true);
  });

  it('isNotificationTypeEnabled: required всегда true, даже если false в prefs', () => {
    const user = {
      notificationPreferences: { booking_confirmed: false, booking_cancelled_by_provider: false },
    } as Pick<User, 'notificationPreferences'>;
    expect(isNotificationTypeEnabled(user, 'booking_confirmed')).toBe(true);
    expect(isNotificationTypeEnabled(user, 'booking_cancelled_by_provider')).toBe(true);
  });

  // Phase 27 Step 27.3: адресация типов по accountType.
  describe('isNotificationTypeApplicable (Phase 27)', () => {
    it('все booking_* → athlete; link_*, *_to_provider, booking_requested → provider', () => {
      const athleteTypes: NotificationType[] = [
        'booking_confirmed',
        'booking_rejected',
        'booking_cancelled_by_athlete',
        'booking_cancelled_by_provider',
        'booking_completed',
        'booking_no_show',
        'booking_auto_expired',
      ];
      const providerTypes: NotificationType[] = [
        'booking_requested',
        'booking_cancelled_by_athlete_to_provider',
        'booking_auto_expired_to_provider',
        'link_requested',
        'link_approved',
        'link_rejected',
        'link_revoked',
      ];

      for (const type of athleteTypes) {
        expect(isNotificationTypeApplicable(type, 'athlete')).toBe(true);
        expect(isNotificationTypeApplicable(type, 'provider')).toBe(false);
      }
      for (const type of providerTypes) {
        expect(isNotificationTypeApplicable(type, 'provider')).toBe(true);
        expect(isNotificationTypeApplicable(type, 'athlete')).toBe(false);
      }
    });

    it('NOTIFICATION_TYPE_AUDIENCE покрывает все 16 типов без пересечений', () => {
      // Было 19: Phase 29 Step 29.4 добавила 2 review-типа. Фаза 35, этап Э0a убрала
      // три типа отменённых санкций за неявки → осталось 16.
      const keys = Object.keys(NOTIFICATION_TYPE_AUDIENCE) as NotificationType[];
      expect(keys).toHaveLength(16);
      for (const key of keys) {
        expect(['athlete', 'provider']).toContain(NOTIFICATION_TYPE_AUDIENCE[key]);
      }
    });
  });

  it('isNotificationTypeEnabled: default true для пользователя без prefs; false если явно отключено', () => {
    expect(isNotificationTypeEnabled(null, 'booking_rejected')).toBe(true);
    expect(isNotificationTypeEnabled({}, 'booking_rejected')).toBe(true);

    const user = {
      notificationPreferences: { booking_rejected: false, link_requested: true },
    } as Pick<User, 'notificationPreferences'>;
    expect(isNotificationTypeEnabled(user, 'booking_rejected')).toBe(false);
    expect(isNotificationTypeEnabled(user, 'link_requested')).toBe(true);
    // Ключа нет — default true.
    expect(isNotificationTypeEnabled(user, 'link_approved')).toBe(true);
  });
});
