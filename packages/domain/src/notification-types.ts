// Группы NotificationType для UI-фильтров в NotificationsListPage и редактора
// per-тип preferences в Settings. REQUIRED_NOTIFICATION_TYPES — критичные типы,
// которые нельзя отключить (booking_confirmed, booking_cancelled_by_provider).
// При записи preferences через API такие ключи игнорируются.
//
// ⚠️ Фаза 35, этап Э0a: группа санкций за неявки и три её типа удалены вместе
// с самим механизмом. Удаление типов группу за собой не уносит — её пришлось
// убрать отдельно, иначе в настройках осталась бы пустая вкладка.
import type { AuthAccountType, NotificationType, User } from '@sporthub/types';

// Phase 29 Step 29.4: добавлена группа 'reviews' для уведомлений по отзывам
// (получено провайдером + опубликовано автором). UI-фильтр группы появится
// автоматически благодаря NOTIFICATION_GROUP_KEYS-derived рендеру в
// NotificationsListPage. Audience группы — обе роли (athlete для подтверждения,
// provider для входящих отзывов), поэтому тaб виден и тем, и тем.
export const NOTIFICATION_GROUP_KEYS = ['booking', 'links', 'reviews'] as const;
export type NotificationGroupKey = (typeof NOTIFICATION_GROUP_KEYS)[number];

/**
 * Phase 27 Step 27.3: кому адресован каждый NotificationType.
 * - athlete: booking FSM для атлета.
 * - provider: link_* события (трейнер↔клуб) + provider-ось booking-уведомлений
 *   (booking_requested / ..._to_provider / booking_auto_expired_to_provider).
 * У каждого типа строго один адресат — пересечений нет.
 */
export const NOTIFICATION_TYPE_AUDIENCE: Record<NotificationType, AuthAccountType> = {
  booking_confirmed: 'athlete',
  booking_rejected: 'athlete',
  booking_cancelled_by_athlete: 'athlete',
  booking_cancelled_by_provider: 'athlete',
  booking_completed: 'athlete',
  booking_no_show: 'athlete',
  booking_auto_expired: 'athlete',
  booking_requested: 'provider',
  booking_cancelled_by_athlete_to_provider: 'provider',
  booking_auto_expired_to_provider: 'provider',
  link_requested: 'provider',
  link_approved: 'provider',
  link_rejected: 'provider',
  link_revoked: 'provider',
  // Phase 29 Step 29.4: review-уведомления — два одноcторонних канала.
  review_received_by_provider: 'provider',
  review_published_for_athlete: 'athlete',
};

/**
 * Возвращает true, если тип уведомления адресован этому accountType.
 * Используется в Settings-редакторе (скрыть чужие чекбоксы) и в NotificationsListPage
 * (не считать чужие типы в счётчике tab'ов, если они случайно попали в базу).
 */
export function isNotificationTypeApplicable(
  type: NotificationType,
  accountType: AuthAccountType,
): boolean {
  return NOTIFICATION_TYPE_AUDIENCE[type] === accountType;
}

/** Маппинг NotificationType → группа (для фильтров и редактора). */
export const NOTIFICATION_TYPE_GROUP: Record<NotificationType, NotificationGroupKey> = {
  booking_confirmed: 'booking',
  booking_rejected: 'booking',
  booking_cancelled_by_athlete: 'booking',
  booking_cancelled_by_provider: 'booking',
  booking_completed: 'booking',
  booking_no_show: 'booking',
  booking_auto_expired: 'booking',
  // Phase 26 hotfix: каналы провайдера для booking-событий.
  booking_requested: 'booking',
  booking_cancelled_by_athlete_to_provider: 'booking',
  booking_auto_expired_to_provider: 'booking',
  link_requested: 'links',
  link_approved: 'links',
  link_rejected: 'links',
  link_revoked: 'links',
  // Phase 29 Step 29.4: review-уведомления — отдельная группа 'reviews'.
  review_received_by_provider: 'reviews',
  review_published_for_athlete: 'reviews',
};

/**
 * Типы уведомлений, которые нельзя отключить — критичные для пользователя.
 * booking_confirmed — атлет должен знать, что провайдер подтвердил запись.
 * booking_cancelled_by_provider — атлет должен знать, что провайдер отменил его запись.
 */
export const REQUIRED_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'booking_confirmed',
  'booking_cancelled_by_provider',
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
