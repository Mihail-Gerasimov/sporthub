// Наборы статусов и границы периода, которыми страница сужает запрос записей.
//
// Зачем отдельный модуль. Страница спрашивает у бэкенда не «все записи», а ровно тот
// срез, который потом читает. Срез определяется не вкусом, а правилом из
// `@sporthub/domain`: надёжность атлета смотрит на три статуса, карантин — на два
// и только за последние тридцать дней. Если эти наборы разъедутся с правилами,
// страница молча потеряет часть записей и при этом продолжит выглядеть рабочей —
// счётчик просто станет меньше.
//
// Набора статусов надёжности ПРОВАЙДЕРА здесь больше нет: надёжность клуба и тренера
// считает бэкенд и отдаёт готовым числом в карточке, так что сужать фронту нечего.
// Свой набор был копией объявления из `@sporthub/domain` — и остался бы копией
// без единого потребителя.
//
// Поэтому наборы объявлены здесь ОДИН раз, рядом с пояснением, из какой функции
// каждый выведен, и закреплены тестом `src/test/lib/booking-scopes.test.ts`: он
// прогоняет через сами доменные функции записи всех восьми статусов и проверяет,
// что на результат влияют ровно перечисленные.

import { DISCIPLINE_CONFIG, shiftDateKey } from '@sporthub/domain';
import type { BookingStatus, ISODateString } from '@sporthub/types';

/**
 * Статусы, по которым считается надёжность атлета.
 * Выведены из `computeAthleteReliability`: завершённые, неявки и поздние отмены
 * (поздние — подвид `cancelled_by_athlete`, отдельного статуса у них нет).
 */
export const ATHLETE_RELIABILITY_STATUSES: readonly BookingStatus[] = [
  'completed',
  'no_show',
  'cancelled_by_athlete',
];

/** Статусы, по которым считается карантин атлета. Выведены из `isAthleteInQuarantine`. */
export const QUARANTINE_STATUSES: readonly BookingStatus[] = ['completed', 'no_show'];

/**
 * Насколько далеко назад смотрит карантин, в днях.
 *
 * Окно правила — `quarantine.windowDays`, но отбор на бэкенде идёт по ДНЮ ЗАНЯТИЯ,
 * а правило сортирует по моменту отметки исхода. Отметку провайдер вправе поставить
 * в течение `checkIn.windowHoursAfterEnd` после конца занятия, поэтому нижняя граница
 * отодвигается на это окно: иначе запись, проведённая на границе периода и отмеченная
 * на следующий день, выпала бы из расчёта.
 */
export const QUARANTINE_LOOKBACK_DAYS =
  DISCIPLINE_CONFIG.quarantine.windowDays +
  Math.ceil(DISCIPLINE_CONFIG.checkIn.windowHoursAfterEnd / 24);

/** Нижняя граница периода, за который карантин вообще может сработать. */
export function getQuarantineDateFrom(todayDateKey: ISODateString): ISODateString {
  return shiftDateKey(todayDateKey, -QUARANTINE_LOOKBACK_DAYS);
}
