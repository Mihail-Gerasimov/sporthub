// Тон бейджа статуса записи — один на все поверхности личных кабинетов.
//
// До Phase 33 одна и та же карта «статус → тон» лежала в трёх местах: в
// хелперах атлета, в хелперах провайдера (байт в байт, различались только имена
// типов) и инлайном в расписании атлета. Добавление статуса в FSM требовало
// правки трёх файлов, а рассинхрон между ними никак не ловился.
//
// ⚠️ Сюда не переносятся ПОДПИСИ статусов: они ролевые (одна и та же отмена
// для атлета и провайдера называется по-разному) и расходятся намеренно.

import type { BookingStatus } from '@sporthub/types';

/** Допустимые тоны бейджа статуса — подмножество тонов Badge. */
export type BookingStatusTone = 'success' | 'outline' | 'teal' | 'danger';

/**
 * Карта тонов для всех значений `BookingStatus`. `Record` без необязательных
 * ключей: новый статус FSM не соберётся, пока ему не назначен тон.
 */
export const BOOKING_STATUS_TONES: Record<BookingStatus, BookingStatusTone> = {
  pending: 'outline',
  confirmed: 'success',
  completed: 'teal',
  no_show: 'danger',
  unmarked: 'outline',
  rejected_by_provider: 'danger',
  cancelled_by_athlete: 'danger',
  cancelled_by_provider: 'danger',
};
