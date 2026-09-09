// Базовые типы идентификаторов и дат для всех сущностей MVP.
//
// Часть типов-перечислений выводится из словарей-массивов в ./constants:
// список значений объявлен там ровно один раз, тип — его проекция.
// Импорт type-only, поэтому во время выполнения связи между модулями нет.
import type { LOG_ACTIONS, LOG_ENTITY_TYPES, USER_ROLES } from './constants';

export type EntityId = number;
export type ISODateString = string;
export type ISODateTimeString = string;

export type AuthAccountType = 'provider' | 'athlete';

// Роль пользователя. Источник правды — USER_ROLES в constants.ts.
export type UserRole = (typeof USER_ROLES)[number];

// Статус пользователя: active по умолчанию, banned/suspended — для будущей модерации
export type UserStatus = 'active' | 'banned' | 'suspended';

export type CatalogOwnerType = 'club' | 'trainer';

export type AthleteAchievementId =
  | 'on-time'
  | 'week-without-skips'
  | 'first-booking'
  | 'first-review'
  | 'community-voice'
  | 'explorer'
  | 'back-to-the-gym'
  | 'serious-about-sport';

// Источник создания сущности: провайдер (ЛК) или seed-данные
export type EntitySource = 'provider' | 'seed';

// Статус публикации сущности
export type EntityStatus = 'published' | 'draft' | 'hidden';

// Типы действий для системы логирования активности платформы.
// Источник правды — LOG_ACTIONS в constants.ts: там же лежат пояснения,
// какая фаза какие действия завела. Здесь только проекция списка в тип.
export type LogAction = (typeof LOG_ACTIONS)[number];

// Тип сущности, затронутой действием.
// Источник правды — LOG_ENTITY_TYPES в constants.ts.
export type LogEntityType = (typeof LOG_ENTITY_TYPES)[number];

// Запись лога активности платформы
export interface LogEntry extends BaseEntity {
  action: LogAction;
  actorId: EntityId;
  actorRole: UserRole;
  entityType: LogEntityType;
  entityId: EntityId;
  meta?: Record<string, unknown>;
}

// Статусы FSM booking'а (Phase 24, Step 24.3).
// Старое значение 'cancelled' удалено: cancelBooking() переведён на soft-cancel
// через transitionBooking(), маппится в 'cancelled_by_athlete'. Полный набор FSM:
// pending / confirmed — активные (ACTIVE_BOOKING_STATUSES).
// completed / no_show / unmarked — финалы проведения (COMPLETED_BOOKING_STATUSES).
// rejected_by_provider / cancelled_by_athlete / cancelled_by_provider — отмены
// и отказы (CANCELLED_BOOKING_STATUSES).
export type BookingStatus =
  | 'pending'
  | 'confirmed'
  | 'completed'
  | 'no_show'
  | 'unmarked'
  | 'rejected_by_provider'
  | 'cancelled_by_athlete'
  | 'cancelled_by_provider';

// Инициатор перехода в FSM. 'system' — ленивые автопереходы runLazyBookingTransitions.
export type BookingActor = 'athlete' | 'provider' | 'admin' | 'system';

// Preset политики отмены, сохраняется как snapshot в Booking.cancellationPolicySnapshot.
// Окна бесплатной отмены задаются в DISCIPLINE_CONFIG.lateCancel.freeUntil.
export type CancellationPolicy = 'free_anytime' | 'free_until_24h' | 'free_until_2h' | 'no_refund';

// Подстатус отмены атлетом: вычисляется по snapshot-policy в момент отмены.
// on_time — в пределах окна бесплатной отмены. late — за окном, влияет на рейтинг.
export type CancelReason = 'on_time' | 'late';

// Запись одного перехода FSM booking'а, хранится в Booking.statusHistory.
// from=null для самой первой записи (создание booking'а в pending).
export interface BookingStatusTransition {
  from: BookingStatus | null;
  to: BookingStatus;
  actor: BookingActor;
  actorUserId?: EntityId;
  at: ISODateTimeString;
  reason?: string;
}

export type PaymentStatus = 'unpaid' | 'paid' | 'refunded';

export type SessionLevel = 'beginner' | 'intermediate' | 'advanced' | 'all_levels';

export type OfferingFormat = 'group' | 'personal' | 'mini_group';

export interface BaseEntity {
  id: EntityId;
  createdAt: ISODateTimeString;
}

export interface Coordinates {
  lat: number;
  lng: number;
}

// --- Справочники (Phase 23) ---

// Город с координатами центра для карты и геосервисов
export interface City extends BaseEntity {
  name: string;
  coordinates: Coordinates;
}

// Тег публикации (клуба)
export interface Tag extends BaseEntity {
  name: string;
}

// Удобство клуба (amenity)
export interface Amenity extends BaseEntity {
  name: string;
}

// Формат работы тренера
export interface WorkFormat extends BaseEntity {
  name: string;
}

// Специализация тренера
export interface Specialty extends BaseEntity {
  name: string;
}

export interface Sport extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  icon: string;
  imageUrl: string;
  isPopular: boolean;
}

/**
 * Рейтинг надёжности одной публикации или атлета.
 *
 * Объявление живёт ЗДЕСЬ, а не рядом с расчётом в `@sporthub/domain`, потому что
 * это уже не внутренний результат функции, а поле контракта: надёжность приходит
 * вместе с карточкой клуба и тренера (`reliability` ниже). Расчёт переехать сюда
 * не может — пакет типов не содержит логики, — а объявление обязано быть одно
 * на всех, иначе бэкенд и фронт описывали бы одно поле двумя разными типами.
 *
 * `badge = null` означает «рейтинг выше порога предупреждения, бейджа нет».
 * `isNewUser = true` — завершённых занятий слишком мало, чтобы судить.
 */
export interface ReliabilityResult {
  totalRelevant: number;
  completedCount: number;
  noShowCount: number;
  lateCancelCount: number;
  rejectedByProviderCount: number;
  completionRate: number;
  badge: null | 'warning' | 'danger';
  isNewUser: boolean;
}

export interface Club extends BaseEntity {
  name: string;
  slug: string;
  description: string;
  shortDescription: string;
  city: string;
  address: string;
  phone: string;
  email?: string;
  website?: string;
  coordinates: Coordinates;
  sportIds: EntityId[];
  imageUrls: string[];
  amenityIds: EntityId[];
  tagIds: EntityId[];
  // Контакты — соцсети (phone и email уже есть)
  vk?: string;
  telegram?: string;
  facebook?: string;
  rating: number;
  reviewCount: number;
  priceFrom: number;
  distanceKm: number;
  // Привязка к провайдеру (userId), управляющему этим клубом
  managedByUserId?: EntityId;
  // Источник создания: provider (из ЛК) или seed (старые данные)
  source?: EntitySource;
  // Статус публикации
  status?: EntityStatus;
  // Поля модерации (заполняются при скрытии админом)
  hideReason?: string;
  hiddenByUserId?: EntityId;
  hiddenAt?: ISODateTimeString;
  /**
   * Надёжность публикации: считается бэкендом при чтении и НИКОГДА не хранится.
   *
   * Поле необязательное сознательно. Во-первых, его собирают не все ответы —
   * создание и правка публикации отдают прежнюю форму. Во-вторых, старый клиент,
   * ничего про него не знающий, обязан пережить выкатку. Раньше числа здесь
   * не было вовсе: ради двух чисел на карточку фронт забирал ВСЕ записи площадки,
   * а после закрытия полного среза публичные страницы перестали открываться.
   */
  reliability?: ReliabilityResult;
}

export interface Trainer extends BaseEntity {
  name: string;
  slug: string;
  bio: string;
  avatarUrl: string;
  experienceYears: number;
  specialtyIds: EntityId[];
  // Форматы работы тренера (новое поле, ранее только form-state)
  workFormatIds: EntityId[];
  rating: number;
  reviewCount: number;
  priceFrom: number;
  sportIds: EntityId[];
  city?: string;
  address?: string;
  coordinates?: Coordinates;
  // Контакты тренера (phone опционален для обратной совместимости seed)
  phone?: string;
  vk?: string;
  telegram?: string;
  facebook?: string;
  // Phase 25 Step 25.1b: legacy `affiliatedClubId` и `clubId` удалены. Источник правды
  // связи тренер↔клуб — коллекция trainer-club-links.json. Чтение через
  // getTrainerClubLinks({ trainerId, status: 'confirmed' }).
  // STUB: сохранить переходную совместимость до появления primarySportId и новой выдачи.
  sportId?: EntityId;
  // Привязка к провайдеру (userId), управляющему этим тренером
  managedByUserId?: EntityId;
  // Источник создания: provider (из ЛК) или seed (старые данные)
  source?: EntitySource;
  // Статус публикации
  status?: EntityStatus;
  // Поля модерации (заполняются при скрытии админом)
  hideReason?: string;
  hiddenByUserId?: EntityId;
  hiddenAt?: ISODateTimeString;
  /**
   * Надёжность публикации: считается бэкендом при чтении и НИКОГДА не хранится.
   *
   * Поле необязательное сознательно. Во-первых, его собирают не все ответы —
   * создание и правка публикации отдают прежнюю форму. Во-вторых, старый клиент,
   * ничего про него не знающий, обязан пережить выкатку. Раньше числа здесь
   * не было вовсе: ради двух чисел на карточку фронт забирал ВСЕ записи площадки,
   * а после закрытия полного среза публичные страницы перестали открываться.
   */
  reliability?: ReliabilityResult;
}

export interface Offering extends BaseEntity {
  ownerType: CatalogOwnerType;
  ownerId: EntityId;
  // Phase 25 Step 25.1b: legacy `affiliatedClubId` удалён. Для услуг тренера «в клубе»
  // используется `trainerClubLinkId` (ссылка на confirmed TrainerClubLink). Для club-услуг
  // клуб резолвится через `ownerType='club' && ownerId=clubId`.
  /**
   * Phase 24: Ссылка на confirmed TrainerClubLink для услуг тренера "в клубе".
   * Если undefined — услуга частная, оказывается тренером независимо. Если указано
   * — offering привязан к подтверждённой связи; при revoke-link связанные offerings
   * помечаются как частные (auto-detach, см. Step 24.10).
   */
  trainerClubLinkId?: EntityId;
  /**
   * Phase 24: Политика отмены, выбирается провайдером при публикации.
   * При создании booking'а значение клонируется в Booking.cancellationPolicySnapshot —
   * условия нельзя ужесточить задним числом. Опционально в TS для совместимости
   * с существующим seed (read-fallback 'free_until_24h'), обязательно в Zod-схеме.
   */
  cancellationPolicy?: CancellationPolicy;
  sportId: EntityId;
  title: string;
  description: string;
  format: OfferingFormat;
  price: number;
  durationMinutes: number;
  capacity: number;
  address: string;
  coordinates: Coordinates;
}

export interface Schedule extends BaseEntity {
  offeringId?: EntityId;
  ownerType?: CatalogOwnerType;
  ownerId?: EntityId;
  // Phase 25 Step 25.1b: legacy `affiliatedClubId` удалён. Клуб, в котором проходит слот,
  // резолвится через `offeringId → offering.trainerClubLinkId → link.clubId` (для услуг
  // тренера) или через `ownerType='club' && ownerId=clubId` / поле `clubId` (для клубных слотов).
  clubId?: EntityId;
  trainerId?: EntityId;
  sportId: EntityId;
  title: string;
  description?: string;
  date: ISODateString;
  startTime: string;
  endTime: string;
  durationMinutes: number;
  level: SessionLevel;
  capacity: number;
  bookedCount: number;
  price: number;
  room?: string;
}

export interface Booking extends BaseEntity {
  /**
   * Слот занятия. Пусто, если провайдер убрал занятие из расписания: сама запись
   * при этом сохраняется — дата, цена и вид спорта лежат в ней снимком.
   */
  scheduleId: EntityId | null;
  offeringId?: EntityId;
  ownerType?: CatalogOwnerType;
  ownerId?: EntityId;
  // Phase 25 Step 25.1b: legacy `affiliatedClubId` удалён. Клуб booking'а резолвится через
  // `clubId` (для club-услуг) или через цепочку offering → trainerClubLinkId → link.clubId.
  userId: EntityId;
  clubId?: EntityId;
  trainerId?: EntityId;
  sportId: EntityId;
  date: ISODateString;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalPrice: number;
  /**
   * Phase 24: Полная история переходов FSM. Первая запись (from=null, to='pending')
   * пишется при создании booking'а в createBookingAtomic. Далее каждый вызов
   * transitionBooking() добавляет новый элемент с actor/actorUserId/timestamp/reason.
   * Optional для совместимости с seed до Step 24.3; после Step 24.3 при чтении всегда есть.
   */
  statusHistory?: BookingStatusTransition[];
  /**
   * Phase 24: Snapshot cancellation-policy offering'а на момент создания booking'а.
   * Используется для расчёта cancelReason (on_time/late) через DISCIPLINE_CONFIG.lateCancel.
   * Защищает атлета от задним числом ужесточённых условий.
   * Optional для совместимости с seed (read-fallback 'free_until_24h').
   */
  cancellationPolicySnapshot?: CancellationPolicy;
  /**
   * Phase 24: Инициатор финального перехода в cancelled_by_athlete,
   * cancelled_by_provider или rejected_by_provider. Заполняется при
   * soft-cancel (Step 24.3/24.4).
   */
  cancelledBy?: BookingActor;
  /**
   * Phase 24: Подстатус отмены атлетом (on_time/late). Определяется через
   * computeCancelReason() по snapshot-policy и времени отмены относительно startAt.
   */
  cancelReason?: CancelReason;
  /**
   * Phase 24: Время check-in completed от провайдера. Фиксируется в transitionBooking
   * при переходе confirmed → completed.
   */
  completedAt?: ISODateTimeString;
}

export interface Review extends BaseEntity {
  userId: EntityId;
  clubId?: EntityId;
  trainerId?: EntityId;
  rating: number;
  text: string;
  /**
   * Имя автора (фаза 34).
   *
   * ⚠️ Поле появилось не для удобства. Публичные страницы клуба, тренера и записи
   * подписывали автора отзыва, поднимая ради этого СПИСОК ВСЕХ пользователей
   * площадки через `GET /api/users` — с почтами и телефонами, и без всякой
   * проверки. Закрыть тот маршрут, не отдав имя здесь, значило бы оставить
   * отзывы без подписи.
   *
   * Необязательное: старый клиент, который ещё сводит имя сам, переживает выкатку.
   */
  authorName?: string;
}

export interface User extends BaseEntity {
  role: UserRole;
  status?: UserStatus;
  name: string;
  email: string;
  phone: string;
  /**
   * Phase 33 Step 33.9: argon2id-хеш пароля. Открытого пароля в хранилище
   * не остаётся нигде. Соль и параметры (память, число проходов, дорожки)
   * лежат внутри самой строки хеша, поэтому отдельных колонок под них не
   * нужно, а смена настроек в будущем не обесценит уже записанные хеши.
   */
  passwordHash: string;
  avatarUrl?: string;
  favoriteClubIds: EntityId[];
  // Город пользователя (MVP: display-only, без редактирования из ЛК)
  city?: string;
  /**
   * Phase 24: Ручное снятие карантина админом. Если указано и дата позже последнего
   * no_show, атлет не считается в карантине, даже при 3+ no_show подряд.
   * Заполняется через POST /api/admin/users/[id]/lift-quarantine (Step 24.15).
   */
  quarantineLiftedAt?: ISODateTimeString;
  /**
   * Phase 25 Step 25.7: дедуп quarantine_start уведомлений. Хранит `until` последнего
   * уведомления о карантине. При попытке повторного notify с тем же `until` — skip.
   * Сбрасывается в undefined при quarantine_end (когда карантин снят по lift или
   * по истечении окна).
   */
  notifiedQuarantineUntil?: ISODateTimeString;
  /**
   * Phase 25 Step 25.14: per-тип preferences для уведомлений. Key — NotificationType,
   * value — включён ли. Если запись отсутствует или тип не в map — тип считается
   * включённым по умолчанию. REQUIRED_NOTIFICATION_TYPES нельзя отключить; такие
   * ключи игнорируются при записи.
   */
  notificationPreferences?: Partial<Record<NotificationType, boolean>>;
}

// --- Phase 34: Сессии ---

/**
 * Серверная сессия входа. До фазы 34 личность пользователя жила в cookie на стороне
 * браузера, поэтому «кто я» решал клиент. Здесь источник правды переезжает в базу:
 * браузер носит только случайный идентификатор, а всё остальное сервер берёт по нему.
 *
 * Метки времени — строки, как и во всех остальных типах проекта: `Date` живёт внутри
 * репозитория, а на границе приводится к строке. Иначе один и тот же тип означал бы
 * разное на бэкенде и на фронте, куда объект приезжает уже разобранным из JSON.
 */
export interface Session extends BaseEntity {
  /**
   * sha256 идентификатора сессии, а не сам идентификатор: утёкший дамп базы не должен
   * давать вход. Тот же принцип, что и у пароля, — хранится проверяемый след, не секрет.
   */
  tokenHash: string;
  /** Настоящий владелец сессии — тот, кто ввёл пароль. По нему пишется журнал действий. */
  userId: EntityId;
  /**
   * Заполнено только под имперсонизацией: админ работает от лица этого пользователя.
   * Права проверяются по нему, ответственность остаётся за `userId`.
   */
  impersonatedUserId?: EntityId;
  /**
   * Отметка последнего обращения — от неё считается срок бездействия. Продлевается
   * не чаще, чем раз в окно `SESSION_TOUCH_INTERVAL_MS` (см. `@sporthub/domain`).
   */
  lastSeenAt: ISODateTimeString;
  /** Предельный срок жизни: он не сдвигается активностью, в отличие от срока бездействия. */
  expiresAt: ISODateTimeString;
  /**
   * Отзыв: выход, смена пароля, бан. Строка не удаляется вместе с отзывом — по ней
   * потом разбирают инциденты, а уборка протухших идёт отдельной командой.
   */
  revokedAt?: ISODateTimeString;
  /** Чем и откуда зашли — чтобы пользователь узнал свою сессию в списке активных. */
  userAgent?: string;
  ip?: string;
}

/**
 * Одноразовая ссылка восстановления пароля (фаза 34, шаг 34.69).
 *
 * Само значение из письма нигде не хранится — ни здесь, ни в базе. В строке лежит
 * его хеш: перебрать по нему исходное значение нельзя, а сверить предъявленное —
 * можно. Тот же приём, что у сессий и паролей.
 */
export interface PasswordResetToken extends BaseEntity {
  /** sha256 значения из письма. Само значение существует ровно один раз — в письме. */
  tokenHash: string;
  /** Чью учётку восстанавливают. */
  userId: EntityId;
  /** Предельный срок: после него ссылка не работает, даже будучи неиспользованной. */
  expiresAt: ISODateTimeString;
  /**
   * Когда по ссылке сбросили пароль. Пока пусто — ссылка пригодна. Строка не
   * удаляется вместе с использованием: повторный переход обязан получить отказ,
   * а по удалённой строке разбирать инцидент было бы нечем.
   */
  usedAt?: ISODateTimeString;
}

// --- Phase 24: Уведомления ---

// Типы in-app уведомлений. Расширяется при добавлении новых триггерных событий.
// Payload каждой type-ветки типизируется consumer-ом (notify() и UI-маппингом).
export type NotificationType =
  // booking FSM — уведомления атлету
  | 'booking_confirmed'
  | 'booking_rejected'
  | 'booking_cancelled_by_athlete'
  | 'booking_cancelled_by_provider'
  | 'booking_completed'
  | 'booking_no_show'
  | 'booking_auto_expired'
  // booking FSM — уведомления провайдеру (Phase 26 hotfix: закрытие хвоста Phase 24).
  // Симметричные каналы, чтобы провайдер получал сигнал, когда атлет записался,
  // отменил pending/confirmed или когда ленивый автопереход снял его pending-заявку.
  | 'booking_requested'
  | 'booking_cancelled_by_athlete_to_provider'
  | 'booking_auto_expired_to_provider'
  // trainer↔club link
  | 'link_requested'
  | 'link_approved'
  | 'link_rejected'
  | 'link_revoked'
  // карантин атлета
  | 'quarantine_start'
  | 'quarantine_end'
  | 'quarantine_lifted_by_admin'
  // Phase 29 Step 29.4: уведомления при создании отзыва — обоим участникам.
  | 'review_received_by_provider' // владельцу клуба/тренера: «получен новый отзыв»
  | 'review_published_for_athlete'; // автору отзыва: «ваш отзыв опубликован»

/**
 * In-app уведомление пользователю. Создаётся хелпером notify() из Step 24.5
 * на каждом FSM-переходе booking'а и link-переходе. Доставка — polling через
 * bell-icon в Header'е (Step 24.7). Архитектурно готово к SSE/WebSocket — payload
 * сериализуем, type строго типизирован.
 */
export interface Notification extends BaseEntity {
  userId: EntityId;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt?: ISODateTimeString;
}

// --- Phase 24: Двусторонняя привязка тренер↔клуб ---

// Состояния жизненного цикла TrainerClubLink.
// pending — тренер отправил запрос, клуб ещё не ответил.
// confirmed — клуб подтвердил (публичная связь активна).
// rejected — клуб отказал (публично не отображается).
// revoked — активная связь разорвана любой стороной (или админом принудительно).
export type TrainerClubLinkStatus = 'pending' | 'confirmed' | 'rejected' | 'revoked';

/**
 * Двусторонняя привязка тренер↔клуб. Единственный источник правды связи
 * (поля Trainer.affiliatedClubId и Offering.affiliatedClubId удаляются в Step 24.8).
 * Создаётся тренером при публикации/редактировании, переводится в confirmed клубом
 * через approve. Публичные поверхности читают только записи со status='confirmed'.
 */
export interface TrainerClubLink extends BaseEntity {
  trainerId: EntityId;
  clubId: EntityId;
  status: TrainerClubLinkStatus;
  initiatedBy: 'trainer' | 'club';
  // Заполняется при approve (pending → confirmed) — actor и timestamp клуба.
  approvedAt?: ISODateTimeString;
  approvedByUserId?: EntityId;
  // Заполняется при reject (pending → rejected).
  rejectedAt?: ISODateTimeString;
  rejectedByUserId?: EntityId;
  rejectionReason?: string;
  // Заполняется при revoke (confirmed → revoked). revokedBy фиксирует сторону.
  revokedAt?: ISODateTimeString;
  revokedByUserId?: EntityId;
  revokedBy?: 'trainer' | 'club' | 'admin';
}

// --- Phase 25 Step 25.10: CRM-заметки провайдера ---

/**
 * Заметка провайдера про своего клиента. Привязка — к паре (providerUserId, clientUserId).
 * Опциональный `bookingId` позволяет пометить заметку как относящуюся к конкретной записи.
 * Ownership: только владелец-provider (или админ) может редактировать/удалять.
 * Guard при создании: clientUserId должен быть клиентом провайдера — т.е. иметь хоть один
 * booking, чей ownerId принадлежит managed-клубам или тренерам провайдера (`isClientOfProvider`).
 */
export interface ProviderClientNote extends BaseEntity {
  providerUserId: EntityId;
  clientUserId: EntityId;
  note: string;
  bookingId?: EntityId;
  updatedAt: ISODateTimeString;
}

/* ========================================
   Подсказки адресов
   ======================================== */

/** Вид объекта в подсказке адреса. */
export type SuggestItemType = 'locality' | 'street' | 'house' | 'other';

/**
 * Одна подсказка адреса. Тип общий для бэкенда и фронта: бэкенд приводит к нему
 * ответ внешней службы, фронт по нему рисует список. Раньше объявление лежало
 * внутри маршрута, из-за чего фронт зависел от файла бэкенда.
 */
export interface SuggestItem {
  title: string;
  subtitle?: string;
  value: string;
  type: SuggestItemType;
}
