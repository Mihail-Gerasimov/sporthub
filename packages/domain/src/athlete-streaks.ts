// Step 25.5: стрики атлета по неделям с хотя бы одной completed-тренировкой.
// Чистые функции без обращения к БД — вход: массив Booking и userId. Неделя
// считается от понедельника (локальное время сервера), как и в AthleteSchedule
// (Step 25.4). Две разные completed в одной неделе считаются как одна неделя.

import type { Booking, EntityId } from '@sporthub/types';

/** Понедельник недели в формате YYYY-MM-DD. Sunday (getDay=0) → -6 дней. */
function getWeekStartKey(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  const day = date.getDay();
  const diff = day === 0 ? -6 : 1 - day;

  date.setDate(date.getDate() + diff);

  return toDateKey(date);
}

function toDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');

  return `${year}-${month}-${d}`;
}

/** Сдвигает понедельник недели на `weeks` (может быть отрицательным). */
function shiftWeekStart(weekStart: string, weeks: number): string {
  const date = new Date(`${weekStart}T00:00:00`);

  date.setDate(date.getDate() + weeks * 7);

  return toDateKey(date);
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

  const currentWeek = getWeekStartKey(toDateKey(now));
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
