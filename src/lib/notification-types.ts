// Phase 25 Step 25.14: группы NotificationType для UI-фильтров в NotificationsListPage
// и редактора per-тип preferences в Settings. REQUIRED_NOTIFICATION_TYPES — критичные
// типы, которые нельзя отключить (booking_confirmed, booking_cancelled_by_provider,
// quarantine_start). При записи preferences через API такие ключи игнорируются.
import type { NotificationType, User } from '@/types';

export const NOTIFICATION_GROUP_KEYS = ['booking', 'links', 'quarantine'] as const;
export type NotificationGroupKey = (typeof NOTIFICATION_GROUP_KEYS)[number];

/** Маппинг NotificationType → группа (для фильтров и редактора). */
export const NOTIFICATION_TYPE_GROUP: Record<NotificationType, NotificationGroupKey> = {
  booking_confirmed: 'booking',
  booking_rejected: 'booking',
  booking_cancelled_by_athlete: 'booking',
  booking_cancelled_by_provider: 'booking',
  booking_completed: 'booking',
  booking_no_show: 'booking',
  booking_auto_expired: 'booking',
  link_requested: 'links',
  link_approved: 'links',
  link_rejected: 'links',
  link_revoked: 'links',
  quarantine_start: 'quarantine',
  quarantine_end: 'quarantine',
  quarantine_lifted_by_admin: 'quarantine',
};

/**
 * Типы уведомлений, которые нельзя отключить — критичные для пользователя.
 * booking_confirmed — атлет должен знать, что провайдер подтвердил запись.
 * booking_cancelled_by_provider — атлет должен знать, что провайдер отменил его запись.
 * quarantine_start — атлет должен знать, что попал в карантин (бан на запись 7 дней).
 */
export const REQUIRED_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'booking_confirmed',
  'booking_cancelled_by_provider',
  'quarantine_start',
];

/** Проверяет, можно ли отключить уведомление этого типа. */
export function canDisableNotificationType(type: NotificationType): boolean {
  return !REQUIRED_NOTIFICATION_TYPES.includes(type);
}

/**
 * Вычисляет, включено ли уведомление этого типа для пользователя.
 * Если тип обязательный — всегда true.
 * Если preferences не заданы или ключа нет в map — true (default).
 * Иначе — значение из preferences.
 */
export function isNotificationTypeEnabled(
  user: Pick<User, 'notificationPreferences'> | null | undefined,
  type: NotificationType,
): boolean {
  if (REQUIRED_NOTIFICATION_TYPES.includes(type)) {
    return true;
  }
  const prefs = user?.notificationPreferences;
  if (!prefs) return true;
  // Если ключа нет в map — default true.
  if (!(type in prefs)) return true;
  return prefs[type] !== false;
}
