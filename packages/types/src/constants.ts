import type { BookingStatus, Coordinates, PaymentStatus, UserStatus } from './types';

export const DEFAULT_CITY = 'Самара';

// Координаты центра карты по умолчанию (Самара)
export const DEFAULT_MAP_CENTER: Coordinates = { lat: 53.195878, lng: 50.100202 };

// Зум карты по умолчанию
export const DEFAULT_MAP_ZOOM = 12;

export const DEFAULT_LOCALE = 'ru-RU';
export const DEFAULT_TIME_ZONE = 'Europe/Samara';

// ⚠️ Списка ролей здесь больше нет (шаг 35.24). Роль не принимала решений:
// права считаются по виду учётной записи (ACCOUNT_KINDS в @sporthub/domain),
// а «тренер» и «владелец клуба» — это владение лицами услуг, а не признак
// у человека. Вместе с ней ушёл и «тип учётной записи» регистрации: она
// заводит человека, а кем он станет, решает то, что он заведёт.

export const USER_STATUSES: UserStatus[] = ['active', 'banned', 'suspended'];

// Phase 24 (Step 24.3): полный список FSM-значений BookingStatus.
// Старый 'cancelled' удалён — cancelBooking работает через soft-cancel в FSM
// и ставит cancelled_by_athlete. Для фильтрации по наборам статусов используем
// ACTIVE_/COMPLETED_/CANCELLED_BOOKING_STATUSES из src/lib/booking-status.ts.
export const BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'unmarked',
  'rejected_by_provider',
  'cancelled_by_athlete',
  'cancelled_by_provider',
];

export const PAYMENT_STATUSES: PaymentStatus[] = ['unpaid', 'paid', 'refunded'];

// Единственное объявление словаря действий журнала. Тип LogAction выводится
// из этого массива (см. types.ts), валидация журнала на бэкенде и подписи
// с тонами на фронте опираются на него же — урезанных копий быть не должно.
// Добавить действие = дописать строку сюда: компилятор сам потребует подпись
// и тон в админке, а фильтр журнала примет новое значение без правок.
export const LOG_ACTIONS = [
  // Phase 20 — публикация карточек, записи и админские действия
  'publish_create',
  'publish_update',
  'publish_delete',
  // Phase 35 Step 35.24a — владелец убирает своё лицо из каталога.
  // Отдельное действие, а не `publish_delete`: архив обратим и чужую историю
  // не трогает, а стирание необратимо. Одно слово на оба означало бы, что
  // по журналу нельзя отличить «спрятал» от «снёс вместе с записями людей».
  'publish_archive',
  'booking_create',
  'booking_cancel',
  'admin_login',
  'admin_impersonate_start',
  'admin_impersonate_stop',
  // Phase 22 — модерация
  'moderation_hide',
  'moderation_unhide',
  'moderation_auto_restore',
  // Phase 24 — FSM booking и действия провайдера
  'booking_confirm',
  'booking_reject',
  'booking_check_in_completed',
  'booking_check_in_no_show',
  'booking_auto_expire',
  // Phase 24 — trainer↔club link (двусторонняя привязка)
  'link_request',
  'link_approve',
  'link_reject',
  'link_revoke',
  // Phase 24 — reliability
  'reliability_recompute',
  // Phase 24 — админский hard-delete booking'а
  'admin_hard_delete_booking',
  // Phase 29 Step 29.7 — админский сброс пароля юзеру
  'admin_password_change',
] as const;

// Единственное объявление видов ПРЕДМЕТА уведомления — того, о чём уведомление
// написано (шаг 36.51). До этого шага предмет назывался в `payload` четырьмя
// разными формами, потому что типы уведомлений писались разными фазами: прямой
// номер (`clubId` / `trainerId`), пара `entityType` + `entityId`, пара
// `publicationType` + `publicationId` и косвенная ссылка через `bookingId`,
// `reviewId` или `linkId`. Разбирать четыре формы приходилось каждому читателю,
// и уборка публикаций одну из них пропустила, оставляя сироту после каждого прогона.
//
// Форма теперь одна: пара `subjectType` + `subjectId` внутри `payload`.
// Новый вид предмета добавляется ЗНАЧЕНИЕМ в этот список, а не пятой формой.
export const NOTIFICATION_SUBJECT_TYPES = ['club', 'trainer', 'booking', 'review', 'link'] as const;

// Единственное объявление типов сущностей, которых касаются записи журнала.
// Тип LogEntityType выводится отсюда, бэкенд и админка импортируют этот же
// массив: раньше trainer_club_link писался, но фильтром не принимался.
export const LOG_ENTITY_TYPES = [
  'club',
  'trainer',
  'booking',
  'user',
  'trainer_club_link',
] as const;

export const APP_LIMITS = {
  clubsPerPage: 12,
  featuredClubs: 6,
  upcomingSessions: 6,
  reviewsPreview: 6,
  searchSuggestions: 8,
  maxFavoriteClubs: 12,
  maxActiveBookingsPerUser: 5,
  // Потолок длины текста отзыва. Применяется схемой отзыва на бэкенде
  // и обеими формами отзыва на фронте — число живёт только здесь.
  reviewTextMaxLength: 1000,
  // Потолок длины CRM-заметки провайдера о клиенте. Применяется схемами
  // создания и правки заметки на бэкенде и счётчиком символов в ЛК.
  providerNoteMaxLength: 2000,
} as const;
