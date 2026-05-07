import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from '@/lib/constants';
import type { Booking, Coordinates, EntityId, Schedule, Trainer } from '@/types';

// --- Хелперы для резолвинга EntityId[] → display names (Step 23.10) ---

/** Строит Map<id, T> из массива объектов с полем id — O(1) lookup */
export function buildDictMap<T extends { id: EntityId }>(items: T[]): Map<EntityId, T> {
  return new Map(items.map((item) => [item.id, item]));
}

/** Резолвит массив EntityId в массив имён по справочнику. Неизвестные id пропускаются. */
export function resolveNames(ids: EntityId[], dict: { id: EntityId; name: string }[]): string[] {
  const map = buildDictMap(dict);
  return ids.map((id) => map.get(id)?.name).filter((name): name is string => name !== undefined);
}

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

/**
 * Phase 30.7: возвращает время дня в формате 'HH:MM' в указанной TZ.
 * Используется для TZ-safe сравнения с slot.endTime / slot.startTime —
 * никаких Date.setHours, которые работают в локальном TZ исполнителя кода.
 * 'en-GB' даёт 24-часовой формат с zero-pad.
 */
export function getTimeKeyInTimeZone(date = new Date(), timeZone = DEFAULT_TIME_ZONE): string {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
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

/** Display-формат города: добавляет приписку «г.» (display-only) */
export function formatCityDisplay(city: string): string {
  if (!city.trim()) return '';
  if (city.startsWith('г. ') || city.startsWith('г.')) return city;
  return `г. ${city}`;
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

// Phase 25 Step 25.1b: getTrainerAffiliatedClubId удалён вместе с legacy-полями.
// Клуб тренера теперь резолвится только через confirmed TrainerClubLink.

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

// Phase 25 Step 25.1b: legacy `Schedule.affiliatedClubId` удалён. Клуб слота резолвится
// только через `clubId` (для club-слотов) или через offering.trainerClubLinkId → link.clubId
// (для trainer-слотов) на уровне сервера, где есть доступ к offerings и links.
export function getScheduleClubId(scheduleItem: Pick<Schedule, 'clubId'>): EntityId | null {
  return scheduleItem.clubId ?? null;
}

export function getScheduleTrainerId(scheduleItem: Pick<Schedule, 'trainerId'>): EntityId | null {
  return scheduleItem.trainerId ?? null;
}

// Phase 25 Step 25.1b: legacy `Booking.affiliatedClubId` удалён.
export function getBookingClubId(booking: Pick<Booking, 'clubId'>): EntityId | null {
  return booking.clubId ?? null;
}

export function getBookingTrainerId(booking: Pick<Booking, 'trainerId'>): EntityId | null {
  return booking.trainerId ?? null;
}

/**
 * Нормализует название города: первая буква каждого слова заглавная, остальные строчные.
 * "саМара" → "Самара", "САНКТ-ПЕТЕРБУРГ" → "Санкт-Петербург"
 */
export function normalizeCity(input: string): string {
  const trimmed = input.trim();
  if (!trimmed) return '';

  return trimmed
    .toLowerCase()
    .split('-')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join('-');
}

/** Проверяет, что координаты заданы и не являются заглушкой {0, 0} */
export function isValidCoordinates(coords: Coordinates | undefined): boolean {
  if (!coords) return false;
  return coords.lat !== 0 && coords.lng !== 0;
}

/**
 * Вычисляет bounding box вокруг центра города (~15 км в каждую сторону).
 * Используется для ограничения подсказок Yandex Geosuggest в пределах города.
 * Возвращает [[lng1, lat1], [lng2, lat2]] — юго-западный и северо-восточный углы.
 */
export function getCityBoundingBox(center: Coordinates): [[number, number], [number, number]] {
  // ~15 км в градусах: 1° широты ≈ 111 км, 1° долготы ≈ 111 * cos(lat) км
  const latOffset = 15 / 111;
  const lngOffset = 15 / (111 * Math.cos((center.lat * Math.PI) / 180));

  return [
    [center.lng - lngOffset, center.lat - latOffset],
    [center.lng + lngOffset, center.lat + latOffset],
  ];
}
