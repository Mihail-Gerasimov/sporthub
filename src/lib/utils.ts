import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from '@/lib/constants';
import type { Booking, EntityId, Schedule, Trainer } from '@/types';

type ClassNameValue = string | false | null | undefined;

export function cn(...values: ClassNameValue[]): string {
  return values.filter(Boolean).join(' ');
}

export function formatDate(
  value: string | Date,
  options: Intl.DateTimeFormatOptions = {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  },
): string {
  const date = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return '';
  }

  return new Intl.DateTimeFormat(DEFAULT_LOCALE, {
    timeZone: DEFAULT_TIME_ZONE,
    ...options,
  }).format(date);
}

export function getDateKeyInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function formatPrice(value: number, currency = 'RUB'): string {
  return new Intl.NumberFormat(DEFAULT_LOCALE, {
    style: 'currency',
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

export function formatPhone(value: string): string {
  const digits = value.replace(/\D/g, '');

  if (digits.length === 0) {
    return '';
  }

  const normalized =
    digits.length === 11 && (digits.startsWith('7') || digits.startsWith('8'))
      ? `7${digits.slice(1)}`
      : digits.length === 10
        ? `7${digits}`
        : null;

  if (!normalized) {
    return value.trim();
  }

  const countryCode = normalized.slice(0, 1);
  const areaCode = normalized.slice(1, 4);
  const firstPart = normalized.slice(4, 7);
  const secondPart = normalized.slice(7, 9);
  const thirdPart = normalized.slice(9, 11);

  return `+${countryCode} (${areaCode}) ${firstPart}-${secondPart}-${thirdPart}`;
}

export function getTimeUntil(value: string | Date, now = new Date()): string {
  const targetDate = value instanceof Date ? value : new Date(value);

  if (Number.isNaN(targetDate.getTime())) {
    return '';
  }

  const diffInMs = targetDate.getTime() - now.getTime();

  if (diffInMs <= 0) {
    return 'уже началось';
  }

  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const days = Math.floor(diffInMinutes / (60 * 24));
  const hours = Math.floor((diffInMinutes % (60 * 24)) / 60);
  const minutes = diffInMinutes % 60;

  if (days > 0) {
    return hours > 0 ? `через ${days} д. ${hours} ч.` : `через ${days} д.`;
  }

  if (hours > 0) {
    return minutes > 0 ? `через ${hours} ч. ${minutes} мин.` : `через ${hours} ч.`;
  }

  if (minutes > 0) {
    return `через ${minutes} мин.`;
  }

  return 'меньше минуты';
}

export function getTrainerAffiliatedClubId(
  trainer: Pick<Trainer, 'affiliatedClubId' | 'clubId'>,
): EntityId | null {
  return trainer.affiliatedClubId ?? trainer.clubId ?? null;
}

export function getTrainerSportIds(trainer: Pick<Trainer, 'sportIds' | 'sportId'>): EntityId[] {
  if (Array.isArray(trainer.sportIds) && trainer.sportIds.length > 0) {
    return trainer.sportIds;
  }

  return trainer.sportId !== undefined ? [trainer.sportId] : [];
}

export function getTrainerPrimarySportId(
  trainer: Pick<Trainer, 'sportIds' | 'sportId'>,
): EntityId | null {
  return getTrainerSportIds(trainer)[0] ?? null;
}

export function getScheduleClubId(
  scheduleItem: Pick<Schedule, 'affiliatedClubId' | 'clubId'>,
): EntityId | null {
  return scheduleItem.affiliatedClubId ?? scheduleItem.clubId ?? null;
}

export function getScheduleTrainerId(scheduleItem: Pick<Schedule, 'trainerId'>): EntityId | null {
  return scheduleItem.trainerId ?? null;
}

export function getBookingClubId(
  booking: Pick<Booking, 'affiliatedClubId' | 'clubId'>,
): EntityId | null {
  return booking.affiliatedClubId ?? booking.clubId ?? null;
}

export function getBookingTrainerId(booking: Pick<Booking, 'trainerId'>): EntityId | null {
  return booking.trainerId ?? null;
}

/** Нормализация строки для поиска: trim + нижний регистр (ru-RU). */
export function normalizeSearchText(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}
