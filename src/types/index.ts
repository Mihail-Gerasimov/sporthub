// Базовые типы идентификаторов и дат для всех сущностей MVP.
export type EntityId = number;
export type ISODateString = string;
export type ISODateTimeString = string;

export type AuthAccountType = 'provider' | 'athlete';

export type UserRole = 'athlete' | 'trainer' | 'club_owner' | 'admin';

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

// Типы действий для системы логирования активности платформы
// Phase 20 — publish, booking, admin
export type LogAction =
  | 'publish_create'
  | 'publish_update'
  | 'publish_delete'
  | 'booking_create'
  | 'booking_cancel'
  | 'admin_login'
  | 'admin_impersonate_start'
  | 'admin_impersonate_stop'
  // Phase 22 — moderation (зарезервировано)
  | 'moderation_hide'
  | 'moderation_unhide'
  | 'moderation_auto_restore';

// Тип сущности, затронутой действием
export type LogEntityType = 'club' | 'trainer' | 'booking' | 'user';

// Запись лога активности платформы
export interface LogEntry extends BaseEntity {
  action: LogAction;
  actorId: EntityId;
  actorRole: UserRole;
  entityType: LogEntityType;
  entityId: EntityId;
  meta?: Record<string, unknown>;
}

export type BookingStatus = 'pending' | 'confirmed' | 'completed' | 'cancelled';

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
  amenities: string[];
  tags: string[];
  rating: number;
  reviewCount: number;
  priceFrom: number;
  distanceKm: number;
  isFeatured: boolean;
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
}

export interface Trainer extends BaseEntity {
  name: string;
  slug: string;
  bio: string;
  avatarUrl: string;
  experienceYears: number;
  specialties: string[];
  rating: number;
  reviewCount: number;
  priceFrom: number;
  sportIds: EntityId[];
  city?: string;
  address?: string;
  coordinates?: Coordinates;
  affiliatedClubId?: EntityId;
  // STUB: сохранить переходную совместимость до миграции JSON и API на offerings.
  clubId?: EntityId;
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
}

export interface Offering extends BaseEntity {
  ownerType: CatalogOwnerType;
  ownerId: EntityId;
  affiliatedClubId?: EntityId;
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
  affiliatedClubId?: EntityId;
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
  scheduleId: EntityId;
  offeringId?: EntityId;
  ownerType?: CatalogOwnerType;
  ownerId?: EntityId;
  affiliatedClubId?: EntityId;
  userId: EntityId;
  clubId?: EntityId;
  trainerId?: EntityId;
  sportId: EntityId;
  date: ISODateString;
  status: BookingStatus;
  paymentStatus: PaymentStatus;
  totalPrice: number;
}

export interface Review extends BaseEntity {
  userId: EntityId;
  clubId?: EntityId;
  trainerId?: EntityId;
  rating: number;
  text: string;
}

export interface User extends BaseEntity {
  role: UserRole;
  status?: UserStatus;
  name: string;
  email: string;
  phone: string;
  password: string;
  avatarUrl?: string;
  favoriteClubIds: EntityId[];
  // Город пользователя (MVP: display-only, без редактирования из ЛК)
  city?: string;
}
