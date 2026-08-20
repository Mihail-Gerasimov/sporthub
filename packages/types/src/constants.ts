import type {
  AuthAccountType,
  BookingStatus,
  Coordinates,
  PaymentStatus,
  UserStatus,
} from './types';

export const DEFAULT_CITY = 'Самара';

// Координаты центра карты по умолчанию (Самара)
export const DEFAULT_MAP_CENTER: Coordinates = { lat: 53.195878, lng: 50.100202 };

// Зум карты по умолчанию
export const DEFAULT_MAP_ZOOM = 12;

export const DEFAULT_LOCALE = 'ru-RU';
export const DEFAULT_TIME_ZONE = 'Europe/Samara';

// Единственное объявление списка ролей в проекте: тип UserRole выводится
// из этого массива (см. types.ts), а валидация ролей на бэкенде импортирует
// его же. Добавить роль = дописать строку сюда, ничего больше править не надо.
export const USER_ROLES = ['athlete', 'trainer', 'club_owner', 'admin'] as const;

export const USER_STATUSES: UserStatus[] = ['active', 'banned', 'suspended'];

export const AUTH_ACCOUNT_TYPE_LABELS: Record<AuthAccountType, string> = {
  provider: 'Представитель спортивных услуг',
  athlete: 'Спортсмен',
};

export const AUTH_ACCOUNT_TYPE_OPTIONS = [
  { value: 'provider', label: AUTH_ACCOUNT_TYPE_LABELS.provider },
  { value: 'athlete', label: AUTH_ACCOUNT_TYPE_LABELS.athlete },
] as const;

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
  // Phase 24 — карантин и reliability
  'quarantine_start',
  'quarantine_end',
  'quarantine_admin_lift',
  'reliability_recompute',
  // Phase 24 — админский hard-delete booking'а
  'admin_hard_delete_booking',
  // Phase 29 Step 29.7 — админский сброс пароля юзеру
  'admin_password_change',
] as const;

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
