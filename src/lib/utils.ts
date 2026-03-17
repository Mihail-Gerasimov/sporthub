import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from '@/lib/constants';

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
