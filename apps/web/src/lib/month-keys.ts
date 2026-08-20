// Ключ месяца `YYYY-MM`: одно объявление на обе страницы статистики.
//
// Помесячные графики атлета и провайдера считались по одной и той же формуле,
// объявленной дважды, и обе копии считали месяц по календарю БРАУЗЕРА:
// `new Date(\`${key}-01T00:00:00\`)` — это полночь в поясе зрителя, а окно
// «последние 12 месяцев» вообще собиралось из `now.getFullYear()` и
// `now.getMonth()`. Для пояса западнее зала первое число месяца в полночь
// попадает в предыдущий месяц: подпись оси показывала «мар. 2026» там, где
// данные апрельские, а окно на границе месяца сдвигалось на месяц целиком.
//
// Здесь ключ месяца — календарная величина, а не момент: сдвиг и диапазон
// считаются арифметикой над числами года и месяца, без участия часового пояса.
// Момент нужен только один раз, ради человекочитаемой подписи, и его строит
// общий помощник времени.

import { getDateKeyInTimeZone, zonedDateTime } from '@sporthub/domain';
import { DEFAULT_LOCALE, DEFAULT_TIME_ZONE } from '@sporthub/types';

/** Месяц в виде `YYYY-MM`. */
export type MonthKey = string;

// Пояс задан явно: без него формат берёт пояс зрителя и на первое число месяца
// в полночь отдаёт предыдущий месяц.
const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat(DEFAULT_LOCALE, {
  timeZone: DEFAULT_TIME_ZONE,
  month: 'short',
  year: 'numeric',
});

/** Ключ месяца по дню `YYYY-MM-DD`. */
export function getMonthKey(dateKey: string): MonthKey {
  return dateKey.slice(0, 7);
}

/** Разбор ключа месяца в число «месяцев от нулевого года» — база для арифметики. */
function toMonthIndex(monthKey: MonthKey): number {
  const [year, month] = monthKey.split('-').map(Number);

  if (!Number.isFinite(year) || !Number.isFinite(month)) {
    throw new Error(`Не удалось разобрать ключ месяца: ${monthKey}`);
  }

  return year * 12 + (month - 1);
}

/** Обратное преобразование: номер месяца → ключ `YYYY-MM`. */
function fromMonthIndex(index: number): MonthKey {
  const year = Math.floor(index / 12);
  const month = index - year * 12 + 1;

  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}`;
}

/** Сдвиг месяца на N месяцев (отрицательное значение — назад). */
export function shiftMonthKey(monthKey: MonthKey, months: number): MonthKey {
  return fromMonthIndex(toMonthIndex(monthKey) + months);
}

/** Текущий месяц по календарю зала, а не по календарю зрителя. */
export function getCurrentMonthKey(now: Date = new Date()): MonthKey {
  return getMonthKey(getDateKeyInTimeZone(now));
}

/** Человекочитаемая подпись месяца для оси графика (например, «апр. 2026»). */
export function formatMonthLabel(monthKey: MonthKey): string {
  return MONTH_LABEL_FORMATTER.format(zonedDateTime(`${monthKey}-01`, '00:00'));
}

/**
 * Последовательность ключей месяцев от начала до конца включительно.
 * Нужна помесячным графикам, чтобы линия не рвалась на месяцах без записей.
 */
export function generateMonthRange(startKey: MonthKey, endKey: MonthKey): MonthKey[] {
  if (startKey > endKey) {
    return [];
  }

  const start = toMonthIndex(startKey);
  const end = toMonthIndex(endKey);
  const result: MonthKey[] = [];

  for (let index = start; index <= end; index += 1) {
    result.push(fromMonthIndex(index));
  }

  return result;
}
