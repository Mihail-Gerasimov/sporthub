// Стрики атлета: недели подряд, в каждой из которых была хотя бы одна завершённая
// тренировка. Чистые функции без обращения к хранилищу — вход это записи и номер атлета.
// Неделя считается от понедельника, как и в расписании атлета. Две завершённые
// тренировки в одну неделю считаются за одну неделю.
//
// Прежняя версия строила понедельник через `new Date(\`${date}T00:00:00\`)` и `setDate`,
// то есть в поясе процесса. На границе суток это уводило день на соседний, а стрик —
// на целую неделю. Календарные вычисления переехали в общий помощник времени.

import type { Booking, EntityId } from '@sporthub/types';

import { getDateKeyInTimeZone, getWeekStartKey, shiftDateKey } from './time';

/** Сдвигает понедельник недели на `weeks` (может быть отрицательным). */
function shiftWeekStart(weekStart: string, weeks: number): string {
  return shiftDateKey(weekStart, weeks * 7);
}

/** Уникальные понедельники недель, в которых у атлета была хотя бы одна completed. */
function getCompletedWeekSet(bookings: Booking[], userId: EntityId): Set<string> {
  const weeks = new Set<string>();

  for (const booking of bookings) {
    if (booking.userId !== userId) continue;
    if (booking.status !== 'completed') continue;

    weeks.add(getWeekStartKey(booking.date));
  }

  return weeks;
}

/**
 * Текущий стрик: сколько подряд идущих недель назад атлет имел хотя бы одну completed,
 * считая от текущей недели. Если на текущей неделе записей нет, разрешаем начать
 * отсчёт с предыдущей недели (неделя ещё идёт — «недельный буфер»). Если нет и там —
 * стрик=0.
 */
export function computeCurrentStreak(
  bookings: Booking[],
  userId: EntityId,
  now: Date = new Date(),
): number {
  const weeks = getCompletedWeekSet(bookings, userId);

  if (weeks.size === 0) return 0;

  const currentWeek = getWeekStartKey(getDateKeyInTimeZone(now));
  let startWeek: string | null = null;

  if (weeks.has(currentWeek)) {
    startWeek = currentWeek;
  } else {
    const prevWeek = shiftWeekStart(currentWeek, -1);

    if (weeks.has(prevWeek)) {
      startWeek = prevWeek;
    }
  }

  if (startWeek === null) return 0;

  let count = 0;
  let cursor = startWeek;

  while (weeks.has(cursor)) {
    count += 1;
    cursor = shiftWeekStart(cursor, -1);
  }

  return count;
}

/**
 * Максимальный стрик за всю историю атлета — самая длинная серия подряд идущих
 * недель с хотя бы одной completed. 0, если completed нет вовсе.
 */
export function computeMaxStreak(bookings: Booking[], userId: EntityId): number {
  const weeks = getCompletedWeekSet(bookings, userId);

  if (weeks.size === 0) return 0;

  const sorted = Array.from(weeks).sort();
  let max = 1;
  let current = 1;

  for (let i = 1; i < sorted.length; i += 1) {
    const expected = shiftWeekStart(sorted[i - 1], 1);

    if (sorted[i] === expected) {
      current += 1;

      if (current > max) {
        max = current;
      }
    } else {
      current = 1;
    }
  }

  return max;
}
