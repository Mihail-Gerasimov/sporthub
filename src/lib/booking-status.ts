// Phase 24: централизованные наборы статусов booking для фильтрации в helper'ах.
// Импортируются из athlete-bookings, provider-helpers, athlete-achievements, athlete-favorites
// и будущих reliability-утилит (Step 24.12). Единый источник правды вместо локальных Set'ов
// в каждом компоненте — снижает риск рассинхрона при добавлении новых статусов FSM.

import type { BookingStatus } from '@sporthub/types';

// Активные booking'и — слот физически занят, переходы по FSM ещё возможны.
// Используется для ACTIVE-фильтрации в upcoming-блоках ЛК, capacity-guard'ах и carantine-guard'ах.
export const ACTIVE_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'pending',
  'confirmed',
]);

// Завершённые booking'и — тренировка прошла в любом виде (сам факт пришёл/не пришёл/unmarked).
// completed — с явным check-in провайдера. no_show — провайдер отметил неявку.
// unmarked — check-in не сделан в окне 48 часов, автопереход actor='system'.
// Влияют на рейтинг надёжности (completed/no_show), unmarked не считается ни туда ни сюда.
export const COMPLETED_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'completed',
  'no_show',
  'unmarked',
]);

// Отменённые / отклонённые booking'и — слот освобождён, тренировка не состоялась.
// cancelled_by_athlete имеет подстатус cancelReason='on_time'|'late' по snapshot-policy.
// cancelled_by_provider — провайдер отменил confirmed (или система авто-отменила pending).
// rejected_by_provider — провайдер отклонил pending-заявку до подтверждения.
export const CANCELLED_BOOKING_STATUSES: ReadonlySet<BookingStatus> = new Set<BookingStatus>([
  'cancelled_by_athlete',
  'cancelled_by_provider',
  'rejected_by_provider',
]);
