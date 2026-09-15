// Тесты словарей типов уведомлений — верификация публикаций (фаза 38, шаг 38.43).
//
// Три новых типа: два владельцу (оба неотключаемые) и один очереди надзора.
// Проверяется не «тип существует» (это делает компилятор через `Record<NotificationType, …>`),
// а то, что о нём говорят словари: тема, обязательность, надзорность, предмет.

import { describe, expect, it } from 'vitest';

import {
  NOTIFICATION_TYPE_GROUP,
  NOTIFICATION_TYPE_SUBJECT,
  REQUIRED_NOTIFICATION_TYPES,
  canDisableNotificationType,
  isOversightNotificationType,
  notificationTypesOfGroup,
} from './notification-types';

describe('типы уведомлений о верификации (38.43)', () => {
  it('оба письма владельцу — в теме «Публикации», рядом с решениями о скрытии', () => {
    expect(NOTIFICATION_TYPE_GROUP.publication_verified_for_owner).toBe('publications');
    expect(NOTIFICATION_TYPE_GROUP.publication_verification_revoked_for_owner).toBe('publications');
    expect(notificationTypesOfGroup('publications')).toEqual(
      expect.arrayContaining([
        'publication_hidden_for_owner',
        'publication_unhidden_for_owner',
        'publication_verified_for_owner',
        'publication_verification_revoked_for_owner',
      ]),
    );
  });

  it('оба письма владельцу неотключаемые', () => {
    // Знак «проверено» меняет то, как публикацию видят люди; пропущенное письмо
    // об отзыве оставило бы владельца в уверенности, что знак на месте.
    expect(REQUIRED_NOTIFICATION_TYPES).toContain('publication_verified_for_owner');
    expect(REQUIRED_NOTIFICATION_TYPES).toContain('publication_verification_revoked_for_owner');
    expect(canDisableNotificationType('publication_verified_for_owner')).toBe(false);
    expect(canDisableNotificationType('publication_verification_revoked_for_owner')).toBe(false);
  });

  it('отзыв в очередь надзора — надзорный по теме, а не по особому списку', () => {
    // Надзорность выводится из префикса темы: отдельного списка нет, и новый
    // надзорный тип не может «забыть» стать неотключаемым.
    expect(NOTIFICATION_TYPE_GROUP.oversight_verification_revoked).toBe('oversight_catalog');
    expect(isOversightNotificationType('oversight_verification_revoked')).toBe(true);
    expect(canDisableNotificationType('oversight_verification_revoked')).toBe(false);
    // Письма владельцу — НЕ надзорные: они идут в ящик лица, а не в общую очередь.
    expect(isOversightNotificationType('publication_verified_for_owner')).toBe(false);
    expect(isOversightNotificationType('publication_verification_revoked_for_owner')).toBe(false);
  });

  it('предмет всех трёх — публикация обоих видов', () => {
    for (const type of [
      'publication_verified_for_owner',
      'publication_verification_revoked_for_owner',
      'oversight_verification_revoked',
    ] as const) {
      expect([...NOTIFICATION_TYPE_SUBJECT[type]]).toEqual(['club', 'trainer']);
    }
  });
});
