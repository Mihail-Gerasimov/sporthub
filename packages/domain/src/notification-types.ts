// Группы NotificationType для UI-фильтров в NotificationsListPage и редактора
// per-тип preferences в Settings. REQUIRED_NOTIFICATION_TYPES — критичные типы,
// которые нельзя отключить (booking_confirmed, booking_cancelled_by_provider).
// При записи preferences через API такие ключи игнорируются.
//
// ⚠️ Фаза 35, этап Э0a: группа санкций за неявки и три её типа удалены вместе
// с самим механизмом. Удаление типов группу за собой не уносит — её пришлось
// убрать отдельно, иначе в настройках осталась бы пустая вкладка.
import type { NotificationType, User } from '@sporthub/types';

// Phase 29 Step 29.4: добавлена группа 'reviews' для уведомлений по отзывам
// (получено провайдером + опубликовано автором). UI-фильтр группы появится
// автоматически благодаря NOTIFICATION_GROUP_KEYS-derived рендеру в
// NotificationsListPage.
//
// ⚠️ Фаза 35: группа — это ТЕМА уведомления («записи», «связи», «отзывы»),
// а не его получатель. Кому строка видна, решает адресат, и решает это сервер.
export const NOTIFICATION_GROUP_KEYS = ['booking', 'links', 'reviews', 'moderation'] as const;
export type NotificationGroupKey = (typeof NOTIFICATION_GROUP_KEYS)[number];

// ⚠️ Фаза 35, шаг 35.28a. Здесь жила модель видимости «тип уведомления → роль
// человека»: `NOTIFICATION_TYPE_AUDIENCE` и `isNotificationTypeApplicable`.
// Она удалена целиком, и вот почему.
//
// Формула отвечала на вопрос «показывать ли эту строку» ролью получателя, а ролей
// больше нет: человек с клубом сам ходит на занятия, и его лента смешанная
// по построению. Пока роль совпадала с «ролью» типа, числа сходились СЛУЧАЙНО;
// как только перестали — появлялось «в колокольчике 3, а в списке 0»: счётчик
// считает сервер по ящику, а лента прятала строки сама, в браузере, по формуле.
//
// Теперь видимость строки решает её АДРЕСАТ — лицо услуг или человек, — и решает
// это сервер, отбирая ящик запросом. Правило одно, и оно в одном месте.

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
  // Шаг 36.21: надзор. Группа своя, а не 'booking': тема у неё другая, и человеку,
  // который отключил уведомления о записях, надзорные приходить не перестают.
  publication_recheck_requested: 'moderation',
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
