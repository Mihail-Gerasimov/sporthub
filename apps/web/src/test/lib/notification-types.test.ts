// Phase 25 Step 25.14: тесты helpers notification-types.
import { describe, expect, it } from 'vitest';

import {
  canDisableNotificationType,
  isNotificationTypeEnabled,
  REQUIRED_NOTIFICATION_TYPES,
} from '@sporthub/domain';
import type { User } from '@sporthub/types';

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

  // ⚠️ Шаг 35.28a. Здесь проверялась модель видимости «тип уведомления → роль»
  // (`NOTIFICATION_TYPE_AUDIENCE`, `isNotificationTypeApplicable`). Она удалена
  // вместе с ролями: видимость строки решает её АДРЕСАТ — лицо услуг или человек, —
  // и решает это сервер, отбирая ящик запросом. Проверка переехала туда, где
  // расхождение и вылезало: `notifications-count-parity.test.tsx` сверяет число
  // в колокольчике с числом строк в ленте.

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
