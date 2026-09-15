// Базовые типы идентификаторов и дат для всех сущностей MVP.
//
// Часть типов-перечислений выводится из словарей-массивов в ./constants:
// список значений объявлен там ровно один раз, тип — его проекция.
// Импорт type-only, поэтому во время выполнения связи между модулями нет.
import type {
  CATALOG_OWNER_TYPES,
  LOG_ACTIONS,
  LOG_ENTITY_TYPES,
  NOTIFICATION_SUBJECT_TYPES,
  PUBLICATION_SORTS,
} from './constants';

export type EntityId = number;
export type ISODateString = string;
export type ISODateTimeString = string;

// Статус пользователя: active по умолчанию, banned/suspended — для будущей модерации
export type UserStatus = 'active' | 'banned' | 'suspended';

/** Вид владельца публикации. Источник правды — CATALOG_OWNER_TYPES в constants.ts. */
export type CatalogOwnerType = (typeof CATALOG_OWNER_TYPES)[number];

/**
 * Ссылка на лицо услуг — клуб или карточку тренера (фаза 35).
 *
 * Пара «вид + номер», а не два поля-номера: у ссылки всегда ровно одно лицо,
 * и в этой форме забыть заполнить половину нельзя. Третий вид лица добавится
 * значением в `CatalogOwnerType`, а не третьим полем во всех потребителях.
 *
 * ⚠️ В базе та же ссылка лежит ДВУМЯ колонками (`*_club_id` / `*_trainer_id`):
 * иначе у неё не было бы ни внешнего ключа, ни каскада. Перевод между формами —
 * дело репозитория, бизнес-код видит только пару.
 */
export interface ServiceFaceRef {
  type: CatalogOwnerType;
  id: EntityId;
}

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

/**
 * Вид скрытия публикации (шаг 36.12).
 *
 * Объявлен здесь, рядом с прочими плоскими словарями типов, чтобы им могли
 * пользоваться и `Club`, и `Trainer`. Набор значений, подписи и тексты плашек —
 * в `@sporthub/domain`, модуль `hide-kind`: там же живут все словари поведения.
 */
export type HideKindValue = 'owner_archive' | 'moderation';

/**
 * Вид адресата уведомления (фаза 37, шаг 37.4).
 *
 * До фазы 37 вид адресата нигде не был записан — он выводился из пустоты колонок
 * лица. Надзорной очереди колонки лица тоже не полагаются, и вывод перестал
 * различать её с личным ящиком. Список значений и карта формы строки — в
 * `@sporthub/domain/notification-addressee`; здесь только тип, потому что пакет
 * типов ни от чего не зависит по построению.
 */
export type NotificationAddresseeKindValue = 'personal' | 'club' | 'trainer' | 'supervision';

/** Порядок выдачи каталога. Источник правды — PUBLICATION_SORTS в constants.ts. */
export type PublicationSort = (typeof PUBLICATION_SORTS)[number];

/**
 * Четыре числа героя главной — ответ `GET /api/stats/overview` (шаг 38.30).
 *
 * Новый счётчик — поле здесь и ещё один `count` на бэкенде; фронт, ничего о нём
 * не знающий, поле просто не читает.
 */
export interface PlatformOverview {
  /** Люди с видом учётной записи `person`: служебные записи не считаются. */
  athletes: number;
  /** Опубликованные карточки тренеров — ровно те, что видны в каталоге. */
  trainers: number;
  /** Опубликованные клубы. */
  clubs: number;
  /** Все отзывы площадки. */
  reviews: number;
}

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
  /**
   * Кто сделал. Пусто — сделала САМА ПЛОЩАДКА: автоотмена просроченной заявки,
   * блокировка после подбора пароля (фаза 37, шаг 37.27).
   *
   * ⚠️ Пустота допустима только вместе с `actorRole: 'system'`, и это держит
   * база (`logs_actor_or_system`). До фазы 37 колонка была обязательной, и событиям
   * площадки приходилось назначать исполнителем случайного участника — журнал
   * говорил неправду о том, кто действовал, а подбор пароля по несуществующей почте
   * не оставлял следа вовсе.
   *
   * Поле НЕОБЯЗАТЕЛЬНОЕ, а не `EntityId | null`: старый клиент, собранный
   * до фазы 37, переживает выкатку — он просто не увидит нового случая.
   */
  actorId?: EntityId;
  /**
   * Кем был исполнитель в момент действия — исторический снимок.
   *
   * ⚠️ Фаза 35: до неё сюда писалось имя роли, и старые строки его хранят.
   * После — вид учётной записи (`person` / `admin`). Строка, а не объединение:
   * журнал читает оба вида значений, и сузить тип значило бы соврать
   * про уже записанное.
   */
  actorRole: string;
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
   * Вид скрытия: 'owner_archive' | 'moderation'. Словарь — HIDE_KINDS в @sporthub/domain.
   *
   * Шаг 36.12. Без него архив владельца и скрытие модератором отличались только
   * текстом причины, то есть содержимым поля, которое владелец волен написать сам.
   * Поле необязательное: старый клиент, ничего о нём не знающий, переживает выкатку.
   */
  hiddenKind?: HideKindValue;
  /** Владелец исправил скрытую публикацию — она ждёт повторной проверки (шаг 36.20). */
  awaitingRecheck?: boolean;
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
   * Вид скрытия: 'owner_archive' | 'moderation'. Словарь — HIDE_KINDS в @sporthub/domain.
   *
   * Шаг 36.12. Без него архив владельца и скрытие модератором отличались только
   * текстом причины, то есть содержимым поля, которое владелец волен написать сам.
   * Поле необязательное: старый клиент, ничего о нём не знающий, переживает выкатку.
   */
  hiddenKind?: HideKindValue;
  /** Владелец исправил скрытую публикацию — она ждёт повторной проверки (шаг 36.20). */
  awaitingRecheck?: boolean;
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

/**
 * Вид учётной записи. Объявление-близнец словаря `ACCOUNT_KINDS` в `@sporthub/domain`:
 * пакет типов ни от чего не зависит по построению, поэтому значения перечислены здесь,
 * а полнота словаря держится тем, что домен строит свой `Record` по этому же типу.
 */
export type AccountKind = 'person' | 'admin';

export interface User extends BaseEntity {
  /**
   * Вид учётной записи: человек или администратор (словарь `ACCOUNT_KINDS`
   * в `@sporthub/domain`). Единственное различие, которое не выводится
   * из владения. Необязательное поле, чтобы клиент, собранный до фазы 35,
   * пережил выкатку.
   */
  accountKind?: AccountKind;
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
  // Шаг 36.21: владелец исправил публикацию, скрытую модератором, — она ушла
  // на повторную проверку. Адресат — администратор: это служебный сигнал надзора,
  // а не «базовый набор человека», от которого админ отстранён решением 13.
  | 'publication_recheck_requested'
  // Phase 29 Step 29.4: уведомления при создании отзыва — обоим участникам.
  | 'review_received_by_provider' // владельцу клуба/тренера: «получен новый отзыв»
  | 'review_published_for_athlete' // автору отзыва: «ваш отзыв опубликован»
  // --- Фаза 37: надзор -----------------------------------------------------------
  //
  // Адресат у всех восьми — ОБЩАЯ ОЧЕРЕДЬ надзора, а не человек и не лицо услуг.
  // Критерий отбора один и он проверяемый: о событии должен узнать не его участник,
  // а площадка, и сегодня об этом не узнаёт никто.
  //
  // ⚠️ Того, что уже адресовано участнику (записи, связи, отзывы) или уже показано
  // разделом панели (очередь «ждёт повторной проверки»), здесь нет и быть не должно:
  // лента надзора не второй журнал и не копия очереди модерации.
  //
  // Действия администраторов — единственный класс событий, о котором не узнаёт
  // ни пострадавший, ни второй администратор.
  | 'oversight_impersonation_started' // начал работу от чужого лица
  | 'oversight_password_changed_by_admin' // сменил чужой пароль
  | 'oversight_booking_hard_deleted' // необратимо стёр чужую запись
  | 'oversight_link_force_revoked' // принудительно разорвал чужую связь
  // Каталог и модерация.
  | 'oversight_publication_deleted' // публикация стёрта каскадом, необратимо
  | 'oversight_publication_hidden' // публикация скрыта — кем и почему
  | 'oversight_publication_created' // новое лицо встало в каталог: премодерации нет
  // Доступ и вход.
  | 'oversight_login_blocked' // вход закрыт после подбора пароля
  // --- Довесок к фазе 37: владелец узнаёт о решении по своей публикации ----------
  //
  // ⚠️ Адресат — ЛИЦО УСЛУГ, а не очередь надзора и не человек вообще: у владельца
  // трёх клубов письмо приходит в ящик того клуба, чью публикацию тронули.
  //
  // До этого владелец узнавал о скрытии, только если сам заходил на свою карточку
  // и видел плашку. Публикации нет в каталоге, записи не идут — а человек об этом
  // не знает и ждёт.
  | 'publication_hidden_for_owner' // вашу публикацию скрыли, вот причина
  | 'publication_unhidden_for_owner'; // вашу публикацию вернули в каталог

/**
 * Вид предмета, о котором написано уведомление. Проекция словаря
 * `NOTIFICATION_SUBJECT_TYPES` — список значений объявлен там один раз.
 */
export type NotificationSubjectType = (typeof NOTIFICATION_SUBJECT_TYPES)[number];

/**
 * Ссылка на предмет уведомления — ОДНА форма на все типы (шаг 36.51).
 *
 * Пара «вид + номер», а не свой ключ на каждый вид: у ссылки всегда ровно один
 * предмет, и читателю не приходится разбирать, какой из четырёх форм его назвали.
 * Внешнего ключа у неё нет и быть не может — `payload` полиморфен; поэтому
 * уборка публикаций разбирает эту пару явно (решение заказчика 16).
 */
export interface NotificationSubject {
  subjectType: NotificationSubjectType;
  subjectId: EntityId;
}

/**
 * In-app уведомление пользователю. Создаётся хелпером notify() из Step 24.5
 * на каждом FSM-переходе booking'а и link-переходе. Доставка — polling через
 * bell-icon в Header'е (Step 24.7). Архитектурно готово к SSE/WebSocket — payload
 * сериализуем, type строго типизирован.
 */
interface NotificationBase extends BaseEntity {
  /**
   * Вид адресата — НАЗВАННЫЙ (фаза 37). До неё он выводился из пустоты колонок
   * лица, и с появлением очереди надзора выводиться перестал: у очереди колонок
   * лица тоже нет.
   */
  addresseeKind: NotificationAddresseeKindValue;
  type: NotificationType;
  payload: Record<string, unknown>;
  readAt?: ISODateTimeString;
  /**
   * Кто разобрал — только у очереди надзора. В человеческом ящике разбирающий
   * и владелец один человек, и поле пустое: это не пропуск данных, а отсутствие
   * вопроса.
   */
  readByUserId?: EntityId;
}

/**
 * Строка человеческого ящика: личного или ящика лица. Владелец-человек есть всегда —
 * у лица он тоже есть, и объединённый срез «всё моё» читается одним условием
 * по этому полю, без разбора колонок лица.
 *
 * ⚠️ Про «выводимое значение». Прежний комментарий обещал, что `userId`
 * пересчитывается при смене владельца лица. Пути, который это делал бы,
 * в проекте нет: владелец ставится один раз при создании строки. Обещание снято,
 * а не переписано мягче (шаг 37.11).
 */
export interface OwnedNotification extends NotificationBase {
  addresseeKind: 'personal' | CatalogOwnerType;
  userId: EntityId;
  /**
   * Лицо-адресат: вид (`club` / `trainer`) и его номер. Заполнены оба или ни одного.
   * Пусто — уведомление адресовано человеку: своя запись, свой отзыв, свои отмены.
   *
   * Именно адресат решает, в каком ящике строка видна: заявка на занятие клуба
   * приходит КЛУБУ, а не в общую кучу его владельца.
   */
  addresseeType?: CatalogOwnerType;
  addresseeId?: EntityId;
}

/**
 * Строка очереди надзора: владельца-человека у неё НЕТ и быть не может.
 *
 * ⚠️ Почему union, а не `userId?: EntityId`. Необязательное поле перекладывает
 * ответственность на дисциплину читателя: забыл проверить — получил `undefined`
 * в рантайме. Здесь читатель обязан сузить тип НА СБОРКЕ, прежде чем взять владельца.
 */
export interface SupervisionNotification extends NotificationBase {
  addresseeKind: 'supervision';
}

/** In-app уведомление: строка человеческого ящика либо строка очереди надзора. */
export type Notification = OwnedNotification | SupervisionNotification;

/**
 * Уведомление до записи — без номера и времени создания.
 *
 * ⚠️ Объявлено отдельным типом, а не `Omit<Notification, 'id' | 'createdAt'>`.
 * `Omit` по union НЕ распределяется: он схлопывает варианты в один объект,
 * и различение по `addresseeKind` пропадает — вместе с ним пропадает и весь смысл
 * размеченного union'а. Здесь `Omit` применяется к каждому варианту отдельно.
 */
export type NewNotification =
  | Omit<OwnedNotification, 'id' | 'createdAt'>
  | Omit<SupervisionNotification, 'id' | 'createdAt'>;

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
  /**
   * Человек, написавший заметку.
   *
   * ⚠️ Оставлен намеренно, хотя владельцем заметки стало ЛИЦО (шаг 35.27a):
   * это авторство на момент записи и быстрый срез «все мои заметки». Правами
   * он больше не заведует — их решает лицо.
   */
  providerUserId: EntityId;
  clientUserId: EntityId;
  note: string;
  bookingId?: EntityId;
  /**
   * Лицо услуг, при котором живёт заметка (шаг 35.27a, решение заказчика 19).
   * Заполнены оба поля или ни одного.
   *
   * Пусто — заметка старого образца, написанная до переноса: она принадлежит
   * только человеку и в кабинете лица не показывается.
   *
   * ⚠️ Довод, ради которого заметка привязана к лицу, а не к человеку: когда
   * у клуба появится несколько управляющих, заметки должны остаться ПРИ КЛУБЕ,
   * а не уйти вместе с тем, кто их писал.
   */
  faceType?: CatalogOwnerType;
  faceId?: EntityId;
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
