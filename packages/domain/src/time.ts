// Время занятий: единственное место, где дата и время слота превращаются в момент.
//
// Расписание хранит день (`2026-08-20`) и время (`10:00`) раздельно, и это правильно:
// занятие в 10:00 идёт в 10:00 там, где зал, независимо от того, где стоит сервер.
// Но собирать из этих двух строк момент времени через `new Date(\`${date}T${time}:00\`)`
// нельзя: такая запись даёт момент в поясе ТОГО ПРОЦЕССА, где выполняется код.
// Пояс проекта — Самара (UTC+4), пояс сервера обычно UTC: разница четыре часа.
//
// Чем это оборачивалось. Окно автоотмены заявки — один час до начала; окно бесплатной
// отмены по строгой политике — два часа. Сдвиг на четыре часа больше обоих окон,
// то есть условие переворачивалось целиком: отменялись ещё живые заявки, а просроченные
// доживали. Отметка исхода занятия первые четыре часа после его конца отклонялась
// сообщением «доступно только после окончания».
//
// Фронт эту задачу уже решал сравнением строк (`apps/web/src/lib/slot-time.ts`),
// но его решение бэкенду видно не было — отсюда четыре копии одной неверной формулы
// и одна верная в стороне. Здесь они сходятся в одну, общую для фронта и бэкенда.

import { DEFAULT_TIME_ZONE } from '@sporthub/types';

/** День в виде `YYYY-MM-DD`. */
export type DateKey = string;

/** Время в виде `HH:MM`. */
export type TimeKey = string;

/** Минимум, который нужен для вычисления момента: день и время. */
export type SlotTimes = { date: DateKey; startTime: TimeKey; endTime: TimeKey };

/**
 * Смещение пояса относительно UTC в указанный момент, в миллисекундах.
 *
 * Считается через показания часов: тот же момент форматируется в нужном поясе,
 * и разница между «что показали часы» и самим моментом и есть смещение.
 * Так работает и с переходом на летнее время, если пояс его имеет.
 */
function timeZoneOffsetMs(instant: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(instant);

  const value = (type: Intl.DateTimeFormatPartTypes): number =>
    Number(parts.find((part) => part.type === type)?.value ?? '0');

  // Полночь в этом форматировании выглядит как 24, а не 0.
  const hour = value('hour') % 24;

  const asIfUtc = Date.UTC(
    value('year'),
    value('month') - 1,
    value('day'),
    hour,
    value('minute'),
    value('second'),
  );

  return asIfUtc - instant.getTime();
}

/**
 * Момент времени по дню, времени и поясу зала.
 *
 * Смещение уточняется дважды: первое приближение берётся на предполагаемый момент,
 * второе — на уже вычисленный. Для Самары, где перехода на летнее время нет,
 * достаточно и одного, но лишний проход стоит доли микросекунды и снимает
 * целый класс ошибок на случай, если пояс когда-нибудь сменится на другой.
 */
export function zonedDateTime(
  date: DateKey,
  time: TimeKey,
  timeZone: string = DEFAULT_TIME_ZONE,
): Date {
  const naive = Date.parse(`${date}T${time}:00Z`);

  if (Number.isNaN(naive)) {
    throw new Error(`Не удалось разобрать дату и время занятия: ${date}T${time}`);
  }

  const firstGuess = new Date(naive - timeZoneOffsetMs(new Date(naive), timeZone));

  return new Date(naive - timeZoneOffsetMs(firstGuess, timeZone));
}

/** Момент начала занятия. */
export function getSlotStartAt(
  slot: Pick<SlotTimes, 'date' | 'startTime'>,
  timeZone?: string,
): Date {
  return zonedDateTime(slot.date, slot.startTime, timeZone);
}

/** Момент конца занятия. */
export function getSlotEndAt(slot: Pick<SlotTimes, 'date' | 'endTime'>, timeZone?: string): Date {
  return zonedDateTime(slot.date, slot.endTime, timeZone);
}

/** Часов до начала занятия. Отрицательное значение означает, что занятие уже началось. */
export function hoursUntilSlotStart(
  slot: Pick<SlotTimes, 'date' | 'startTime'>,
  now: Date,
  timeZone?: string,
): number {
  return (getSlotStartAt(slot, timeZone).getTime() - now.getTime()) / 3_600_000;
}

/** День указанного момента в нужном поясе. Локаль `sv-SE` даёт формат `YYYY-MM-DD`. */
export function getDateKeyInTimeZone(date: Date, timeZone: string = DEFAULT_TIME_ZONE): DateKey {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/** Время указанного момента в нужном поясе, в виде `HH:MM`. */
export function getTimeKeyInTimeZone(date: Date, timeZone: string = DEFAULT_TIME_ZONE): TimeKey {
  return new Intl.DateTimeFormat('en-GB', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

/**
 * Сдвиг дня на указанное число суток.
 *
 * Считается в UTC-представлении календарной даты, а не через `setDate` на локальном
 * времени: `setDate` работает в поясе процесса и на границе суток даёт соседний день.
 * Здесь дата — это календарь, а не момент, поэтому пояс к делу не относится вовсе.
 */
export function shiftDateKey(date: DateKey, days: number): DateKey {
  const parsed = Date.parse(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed)) {
    throw new Error(`Не удалось разобрать дату: ${date}`);
  }

  return new Date(parsed + days * 86_400_000).toISOString().slice(0, 10);
}

/** Понедельник недели, в которую попадает день. Неделя начинается с понедельника. */
export function getWeekStartKey(date: DateKey): DateKey {
  const parsed = Date.parse(`${date}T00:00:00Z`);

  if (Number.isNaN(parsed)) {
    throw new Error(`Не удалось разобрать дату: ${date}`);
  }

  const weekday = new Date(parsed).getUTCDay();
  // Воскресенье в нумерации движка — ноль, а для недели с понедельника это шестой день.
  const shift = weekday === 0 ? -6 : 1 - weekday;

  return shiftDateKey(date, shift);
}

/**
 * Не началось ли ещё занятие (шаг 38.81): слоты витрины — только те, куда ещё
 * можно прийти к началу; идущее занятие ещё «не прошло» (`isSlotUpcoming`),
 * но записываться на него поздно.
 *
 * Сравнение строковое, как у `isSlotUpcoming`: обе стороны приведены к календарю
 * и часам зала, пояс процесса и летнее время ни при чём.
 */
export function isSlotAhead(
  slot: Pick<SlotTimes, 'date' | 'startTime'>,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  const today = getDateKeyInTimeZone(now, timeZone);

  if (slot.date !== today) return slot.date > today;

  return slot.startTime > getTimeKeyInTimeZone(now, timeZone);
}

/**
 * Не закончилось ли занятие.
 *
 * Сравнение строковое и потому не зависит ни от пояса процесса, ни от перехода
 * на летнее время: обе стороны приведены к календарю и часам зала.
 */
export function isSlotUpcoming(
  slot: Pick<SlotTimes, 'date' | 'endTime'>,
  now: Date = new Date(),
  timeZone: string = DEFAULT_TIME_ZONE,
): boolean {
  const today = getDateKeyInTimeZone(now, timeZone);

  if (slot.date !== today) return slot.date > today;

  return slot.endTime > getTimeKeyInTimeZone(now, timeZone);
}
