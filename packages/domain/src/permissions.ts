// Права: что может каждая роль.
//
// Один словарь на весь проект. До фазы 34 проверки роли были раскиданы по
// контроллерам — где-то вспомнили, где-то нет, и добавление роли означало обход
// всего кода в поисках мест, которые про неё забыли.
//
// Тип `Record<UserRole, ...>` держит словарь полным: новая роль в `USER_ROLES`
// не соберётся, пока ей не выдали набор прав. Тот же приём, что у `ROLE_LABELS`,
// и он уже спас проект однажды — подписи ролей разъехались ровно там, где словарь
// был неполным.
//
// ⚠️ Здесь только «что роли положено вообще». «Его ли это вещь» — отдельный вопрос,
// он требует загрузить сущность и живёт в `AccessService` на бэкенде. Смешивать
// нельзя: право видеть свои записи и право видеть чужие — разные права, а вот
// «своя ли эта запись» — не право, а факт.

import { USER_ROLES, type UserRole } from '@sporthub/types';

/**
 * Возможности платформы.
 *
 * Список намеренно плоский и без иерархии: наследование ролей («админ может всё,
 * что провайдер, плюс своё») выглядит экономией, но ломается на первом же праве,
 * которое старшей роли НЕ положено, и разбирать такое потом дороже, чем выписать
 * набор целиком.
 */
export const CAPABILITIES = [
  // --- Спортсмен ---
  /** Записываться на занятия и отменять свои записи. */
  'book_sessions',
  /** Оставлять отзывы о посещённых занятиях. */
  'write_reviews',

  // --- Представитель услуг и тренер ---
  /** Вести собственные публикации: клубы, карточку тренера, услуги, расписание. */
  'manage_own_publications',
  /** Разбирать заявки на свои занятия: подтверждать, отклонять, отмечать посещение. */
  'manage_own_bookings',
  /** Вести связи тренер↔клуб со своей стороны. */
  'manage_own_links',
  /** Вести заметки о своих клиентах. */
  'manage_own_clients',

  // --- Администратор ---
  /** Видеть и менять любого пользователя. */
  'manage_any_user',
  /** Читать журнал действий платформы. */
  'view_platform_logs',
  /** Смотреть сводную аналитику платформы. */
  'view_analytics',
  /** Скрывать и восстанавливать чужие публикации. */
  'moderate_publications',
  /** Работать от лица другого пользователя. */
  'impersonate',
  /** Пользоваться служебными действиями: карантин, пересчёт, жёсткое удаление. */
  'use_admin_tools',
] as const;

export type Capability = (typeof CAPABILITIES)[number];

/** Права спортсмена. */
const ATHLETE: readonly Capability[] = ['book_sessions', 'write_reviews'];

/**
 * Права представителя спортивных услуг и тренера.
 *
 * ⚠️ Сейчас наборы совпадают, и это ВРЕМЕННО: разделение — отдельный этап той же
 * фазы (Э8a). Наборы объявлены раздельно именно поэтому — когда права разойдутся,
 * это будет правка двух строк, а не поиск всех мест, где «провайдер» значило обе роли.
 */
const PROVIDER: readonly Capability[] = [
  'manage_own_publications',
  'manage_own_bookings',
  'manage_own_links',
  'manage_own_clients',
];

/**
 * Права администратора.
 *
 * Записываться и оставлять отзывы админ не может: это действия клиента площадки,
 * и админской учётке они не нужны. Понадобится — заведёт себе обычную.
 */
const ADMIN: readonly Capability[] = [
  'manage_any_user',
  'view_platform_logs',
  'view_analytics',
  'moderate_publications',
  'impersonate',
  'use_admin_tools',
];

/** Роль → что ей можно. Полнота словаря держится типом. */
export const ROLE_CAPABILITIES: Record<UserRole, ReadonlySet<Capability>> = {
  athlete: new Set(ATHLETE),
  club_owner: new Set(PROVIDER),
  trainer: new Set(PROVIDER),
  admin: new Set(ADMIN),
};

/** Положено ли роли такое действие. */
export function roleCan(role: UserRole, capability: Capability): boolean {
  return ROLE_CAPABILITIES[role].has(capability);
}

/** Все права роли — для ответа «кто я»: интерфейс рисует по ним, а не угадывает. */
export function capabilitiesOf(role: UserRole): Capability[] {
  return [...ROLE_CAPABILITIES[role]];
}

/** Роли, которым положено такое действие. Нужно тестам и разбору прав. */
export function rolesWith(capability: Capability): UserRole[] {
  return USER_ROLES.filter((role) => roleCan(role, capability));
}
