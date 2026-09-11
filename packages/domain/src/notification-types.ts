// Группы NotificationType для UI-фильтров в NotificationsListPage и редактора
// per-тип preferences в Settings. REQUIRED_NOTIFICATION_TYPES — критичные типы,
// которые нельзя отключить (booking_confirmed, booking_cancelled_by_provider).
// При записи preferences через API такие ключи игнорируются.
//
// ⚠️ Фаза 35, этап Э0a: группа санкций за неявки и три её типа удалены вместе
// с самим механизмом. Удаление типов группу за собой не уносит — её пришлось
// убрать отдельно, иначе в настройках осталась бы пустая вкладка.
import { NOTIFICATION_SUBJECT_TYPES } from '@sporthub/types';
import type {
  EntityId,
  NotificationSubject,
  NotificationSubjectType,
  NotificationType,
  User,
} from '@sporthub/types';

// Phase 29 Step 29.4: добавлена группа 'reviews' для уведомлений по отзывам
// (получено провайдером + опубликовано автором). UI-фильтр группы появится
// автоматически благодаря NOTIFICATION_GROUP_KEYS-derived рендеру в
// NotificationsListPage.
//
// ⚠️ Фаза 35: группа — это ТЕМА уведомления («записи», «связи», «отзывы»),
// а не его получатель. Кому строка видна, решает адресат, и решает это сервер.
// ⚠️ Фаза 37. Группа `moderation` УДАЛЕНА, и на её месте три надзорные темы.
//
// Причина не в переименовании. `moderation` содержала ровно один тип, адресованный
// администратору, а редактор настроек рисовал группы по словарю — и показывал
// КАЖДОМУ человеку пустую секцию «Модерация» с галочкой, которую он не мог получить
// никогда. Комментарий рядом утверждал, что у обычного человека группа пуста; это
// была неправда.
//
// Теперь надзорные темы отделены от человеческих, а редактор рисует только то, что
// ящик может получить и что вообще настраивается (шаг 37.23).
export const NOTIFICATION_GROUP_KEYS = [
  'booking',
  'links',
  'reviews',
  // Надзорные темы: отбор вкладки надзора идёт по ним, и он уходит в ЗАПРОС.
  'oversight_admin',
  'oversight_catalog',
  'oversight_security',
] as const;
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
  // Шаг 37.30: тип переезжает в общую очередь надзора, тема — каталог и модерация.
  publication_recheck_requested: 'oversight_catalog',
  // --- Фаза 37: надзорные типы ---------------------------------------------------
  oversight_impersonation_started: 'oversight_admin',
  oversight_password_changed_by_admin: 'oversight_admin',
  oversight_booking_hard_deleted: 'oversight_admin',
  oversight_link_force_revoked: 'oversight_admin',
  oversight_publication_deleted: 'oversight_catalog',
  oversight_publication_hidden: 'oversight_catalog',
  oversight_publication_created: 'oversight_catalog',
  oversight_login_blocked: 'oversight_security',
};

/**
 * Темы, которые видит ТОЛЬКО очередь надзора.
 *
 * ⚠️ Считается из словаря групп, а не выписывается списком: иначе новый надзорный
 * тип пришлось бы вносить в два места, и забытое второе означало бы, что редактор
 * настроек снова нарисует человеку галочку, которую тот не может получить.
 */
export const OVERSIGHT_GROUP_KEYS = NOTIFICATION_GROUP_KEYS.filter((group) =>
  group.startsWith('oversight_'),
);

/** Надзорный ли это тип: тема у него надзорная. */
export function isOversightNotificationType(type: NotificationType): boolean {
  return NOTIFICATION_TYPE_GROUP[type].startsWith('oversight_');
}

/**
 * Типы уведомлений одной темы — единственное объявление на весь проект (шаг 37.18).
 *
 * ⚠️ Считается ИЗ словаря `NOTIFICATION_TYPE_GROUP`, а не выписывается вторым
 * списком. Второй список — это второе место, где можно забыть новый тип, и забыть
 * его молча: отбор просто не показал бы строк, которые обязан показывать.
 *
 * Нужно серверу: отбор ленты по теме уходит в ЗАПРОС. В человеческой ленте он
 * до сих пор делался в памяти поверх выданной страницы с потолком в 100 строк —
 * для общей очереди надзора это означало бы «честно ровно до 101-й строки».
 */
export function notificationTypesOfGroup(group: NotificationGroupKey): NotificationType[] {
  return (Object.keys(NOTIFICATION_TYPE_GROUP) as NotificationType[]).filter(
    (type) => NOTIFICATION_TYPE_GROUP[type] === group,
  );
}

/**
 * Типы уведомлений, которые нельзя отключить — критичные для пользователя.
 * booking_confirmed — атлет должен знать, что провайдер подтвердил запись.
 * booking_cancelled_by_provider — атлет должен знать, что провайдер отменил его запись.
 */
export const REQUIRED_NOTIFICATION_TYPES: readonly NotificationType[] = [
  'booking_confirmed',
  'booking_cancelled_by_provider',
  // ⚠️ Фаза 37: надзорные типы отключить нельзя, и это не строгость ради строгости.
  // Строка в общей очереди ОДНА на всех администраторов: личная галочка одного
  // погасила бы событие для всех коллег — настройка превратилась бы в глушилку.
  // Довод тот же, что у двух типов выше: пропущенное событие — вред, а не неудобство.
  ...(Object.keys(NOTIFICATION_TYPE_GROUP) as NotificationType[]).filter((type) =>
    NOTIFICATION_TYPE_GROUP[type].startsWith('oversight_'),
  ),
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

// --- Шаг 36.51: предмет уведомления ---------------------------------------------

/**
 * Какой ПРЕДМЕТ называет уведомление каждого типа.
 *
 * ⚠️ Словарь, а не догадка по имени типа. До этого шага предмет назывался в
 * `payload` четырьмя разными формами — по одной на фазу, которая тип заводила, —
 * и каждому читателю приходилось разбирать все четыре. Уборка публикаций одну
 * из форм пропустила и оставляла сироту после каждого прогона.
 *
 * Объявление здесь же, рядом с группами: добавление типа уведомления — это
 * правка ОДНОГО файла, а не семи. Тип `Record<NotificationType, …>` не даст
 * забыть новый тип — сборка не пройдёт.
 *
 * Список, а не одно значение: у надзорного уведомления предмет — публикация,
 * а публикация бывает и клубом, и карточкой тренера.
 */
export const NOTIFICATION_TYPE_SUBJECT = {
  // Записи: предмет — сама запись, а не клуб или тренер, у которых она стоит.
  // Через запись читатель дойдёт и до публикации, а обратно — нет.
  booking_confirmed: ['booking'],
  booking_rejected: ['booking'],
  booking_cancelled_by_athlete: ['booking'],
  booking_cancelled_by_provider: ['booking'],
  booking_completed: ['booking'],
  booking_no_show: ['booking'],
  booking_auto_expired: ['booking'],
  booking_requested: ['booking'],
  booking_cancelled_by_athlete_to_provider: ['booking'],
  booking_auto_expired_to_provider: ['booking'],
  // Связи: предмет — сама связь. Стороны выводятся из неё.
  link_requested: ['link'],
  link_approved: ['link'],
  link_rejected: ['link'],
  link_revoked: ['link'],
  // Отзывы: предмет — отзыв. Лицо, о котором он написан, читается из отзыва.
  review_received_by_provider: ['review'],
  review_published_for_athlete: ['review'],
  // Надзор: предмет — сама публикация, и она бывает двух видов.
  publication_recheck_requested: ['club', 'trainer'],
  // --- Фаза 37 -------------------------------------------------------------------
  // Действия администраторов: предмет — тот, КОГО действие задело.
  oversight_impersonation_started: ['user'],
  oversight_password_changed_by_admin: ['user'],
  oversight_booking_hard_deleted: ['booking'],
  oversight_link_force_revoked: ['link'],
  // Каталог: предмет — сама публикация, и она бывает двух видов.
  oversight_publication_deleted: ['club', 'trainer'],
  oversight_publication_hidden: ['club', 'trainer'],
  oversight_publication_created: ['club', 'trainer'],
  // Вход: предмет — учётная запись, в которую закрыли вход.
  oversight_login_blocked: ['user'],
} as const satisfies Record<NotificationType, readonly NotificationSubjectType[]>;

/** Виды предмета, допустимые для типа уведомления. Считается из словаря выше. */
export type NotificationSubjectOf<T extends NotificationType> =
  (typeof NOTIFICATION_TYPE_SUBJECT)[T][number];

/**
 * Собрать `payload` уведомления: ссылка на предмет одной формой плюс всё
 * остальное, что нужно тексту.
 *
 * ⚠️ Зачем тип уведомления первым аргументом, если в результат он не попадает.
 * Он связывает вид предмета с типом на этапе СБОРКИ: назвать запись клубом
 * (`notificationPayload('booking_confirmed', 'club', …)`) не получится — проект
 * не соберётся. Проверка не рантаймовая намеренно: уведомление — побочный
 * эффект, и падение построителя уронило бы саму запись на тренировку.
 *
 * ⚠️ Построитель не проверяет `extra` на прежние формы: это стережёт
 * `apps/api/src/test/notification-subject-guard.test.ts` — он обходит ВСЕ места
 * отправки в исходниках, включая те, которые появятся после этого шага.
 */
export function notificationPayload<T extends NotificationType>(
  type: T,
  subjectType: NotificationSubjectOf<T>,
  subjectId: EntityId,
  extra: Record<string, unknown> = {},
): Record<string, unknown> {
  return { subjectType, subjectId, ...extra };
}

/**
 * Прочитать ссылку на предмет из `payload`.
 *
 * Читателей формы двое: уборка публикаций (она ходит в базу запросом и разбирает
 * ту же пару в SQL) и счётчик номеров записей при переносе данных. Разбора
 * прежних форм здесь нет намеренно: строки, написанные до шага 36.51, переведены
 * в одну форму миграцией `20260911120000_notification_subject`, и второй формы
 * в данных не осталось. Разбор «на всякий случай» означал бы, что четвёртая
 * форма живёт дальше — только уже в коде читателя.
 */
export function readNotificationSubject(
  payload: Record<string, unknown>,
): NotificationSubject | null {
  const subjectType = payload.subjectType;
  const subjectId = payload.subjectId;

  if (typeof subjectId !== 'number') return null;

  if (!NOTIFICATION_SUBJECT_TYPES.includes(subjectType as NotificationSubjectType)) return null;

  return { subjectType: subjectType as NotificationSubjectType, subjectId };
}
