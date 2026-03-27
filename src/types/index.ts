// Базовые типы идентификаторов и дат для всех сущностей MVP.
export type EntityId = number;
export type ISODateString = string;
export type ISODateTimeString = string;

export type AuthAccountType = 'provider' | 'athlete';

export type UserRole = 'athlete' | 'trainer' | 'club_owner' | 'admin';

export type CatalogOwnerType = 'club' | 'trainer';

// Источник создания сущности: провайдер (ЛК) или seed-данные
export type EntitySource = 'provider' | 'seed';

// Статус публикации сущности
export type EntityStatus = 'published' | 'draft';

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
  name: string;
  email: string;
  phone: string;
  password: string;
  avatarUrl?: string;
  favoriteClubIds: EntityId[];
}
