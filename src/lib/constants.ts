import type { BookingStatus, PaymentStatus, UserRole } from '@/types';

export const DEFAULT_CITY = 'Самара';
export const DEFAULT_LOCALE = 'ru-RU';
export const DEFAULT_TIME_ZONE = 'Europe/Samara';

export const USER_ROLES: UserRole[] = ['athlete', 'trainer', 'club_owner', 'admin'];

export const BOOKING_STATUSES: BookingStatus[] = ['pending', 'confirmed', 'completed', 'cancelled'];

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
