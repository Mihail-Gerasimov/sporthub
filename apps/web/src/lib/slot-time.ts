/**
 * Phase 30.7: pure-helper для фильтрации прошедших слотов.
 *
 * Сравнение TZ-safe через строки:
 * - дата `slot.date` уже в формате 'YYYY-MM-DD' в DEFAULT_TIME_ZONE (Europe/Samara),
 *   совпадает с `getDateKeyInTimeZone(now)` лексикографически;
 * - время `slot.endTime` в формате 'HH:MM', сравнивается с `getTimeKeyInTimeZone(now)`
 *   тоже лексикографически (`'08:30' < '14:00'`).
 *
 * Никаких `Date.setHours()` — он работает в локальном TZ исполнителя кода
 * (Vitest/Node по умолчанию UTC), что даёт рассинхрон ±4 часа с DEFAULT_TIME_ZONE.
 */
import type { Schedule } from '@sporthub/types';

import { getDateKeyInTimeZone, getTimeKeyInTimeZone } from './utils';

/**
 * Проверяет, что слот ещё не прошёл относительно `now`.
 * - Будущая дата → true.
 * - Прошедшая дата → false.
 * - Сегодня → true только если `endTime > now-time` в DEFAULT_TIME_ZONE.
 */
export function isSlotUpcoming(
  slot: Pick<Schedule, 'date' | 'endTime'>,
  now: Date = new Date(),
): boolean {
  const todayKey = getDateKeyInTimeZone(now);
  if (slot.date > todayKey) return true;
  if (slot.date < todayKey) return false;
  const nowTimeKey = getTimeKeyInTimeZone(now);
  return slot.endTime > nowTimeKey;
}
