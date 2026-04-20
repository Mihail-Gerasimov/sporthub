import type {
  AuthAccountType,
  BookingStatus,
  Coordinates,
  PaymentStatus,
  UserRole,
  UserStatus,
} from '@/types';

export const DEFAULT_CITY = 'Самара';

// Координаты центра карты по умолчанию (Самара)
export const DEFAULT_MAP_CENTER: Coordinates = { lat: 53.195878, lng: 50.100202 };

// Зум карты по умолчанию
export const DEFAULT_MAP_ZOOM = 12;

export const DEFAULT_LOCALE = 'ru-RU';
export const DEFAULT_TIME_ZONE = 'Europe/Samara';

export const USER_ROLES: UserRole[] = ['athlete', 'trainer', 'club_owner', 'admin'];

export const USER_STATUSES: UserStatus[] = ['active', 'banned', 'suspended'];

export const AUTH_ACCOUNT_TYPE_LABELS: Record<AuthAccountType, string> = {
  provider: 'Представитель спортивных услуг',
  athlete: 'Спортсмен',
};

export const AUTH_ACCOUNT_TYPE_OPTIONS = [
  { value: 'provider', label: AUTH_ACCOUNT_TYPE_LABELS.provider },
  { value: 'athlete', label: AUTH_ACCOUNT_TYPE_LABELS.athlete },
] as const;

// Phase 24: полный список значений BookingStatus (включая @deprecated 'cancelled',
// который удалится в Step 24.3 при переходе cancelBooking на soft-cancel через FSM).
export const BOOKING_STATUSES: BookingStatus[] = [
  'pending',
  'confirmed',
  'completed',
  'no_show',
  'unmarked',
  'rejected_by_provider',
  'cancelled_by_athlete',
  'cancelled_by_provider',
  'cancelled',
];

export const PAYMENT_STATUSES: PaymentStatus[] = ['unpaid', 'paid', 'refunded'];

export const APP_LIMITS = {
  clubsPerPage: 12,
  featuredClubs: 6,
  upcomingSessions: 6,
  reviewsPreview: 6,
  searchSuggestions: 8,
  maxFavoriteClubs: 12,
  maxActiveBookingsPerUser: 5,
  reviewTextMaxLength: 1000,
} as const;
