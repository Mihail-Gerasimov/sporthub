// Step 25.7: дедуплицированный dispatch уведомлений о карантине атлета. Phase 24
// только фиксировала карантин через isAthleteInQuarantine; 25.7 добавляет три
// триггера (quarantine_start при первом hit, quarantine_end при выходе из окна
// или после admin-lift, quarantine_lifted_by_admin шлёт отдельный admin-endpoint).
// Дедуп реализован через User.notifiedQuarantineUntil — пока поле равно текущему
// `until`, повторные вызовы notify игнорируются, чтобы не спамить при каждом
// POST /api/bookings или каждом lazy-проходе runLazyBookingTransitions.

import 'server-only';

import { notify } from '@/lib/notify';
import type { QuarantineResult } from '@/lib/reliability';
import type { User } from '@/types';

export interface QuarantineNotifierArgs {
  user: User;
  quarantine: QuarantineResult;
}

/**
 * Отправляет `quarantine_start` атлету, если он впервые попал в карантин или
 * карантин был продлён (новый `until`). Обновляет `User.notifiedQuarantineUntil`,
 * чтобы следующий идентичный вызов был дедуплицирован. No-op, если карантина нет
 * или уведомление с таким `until` уже было отправлено.
 */
export async function maybeNotifyQuarantineStart({
  user,
  quarantine,
}: QuarantineNotifierArgs): Promise<void> {
  if (!quarantine.inQuarantine || !quarantine.until) {
    return;
  }

  if (user.notifiedQuarantineUntil === quarantine.until) {
    return;
  }

  await notify(user.id, 'quarantine_start', {
    until: quarantine.until,
    reason: quarantine.reason ?? null,
  });

  // Dynamic import разрывает потенциальный цикл: db.ts → transitionBooking
  // импортнёт quarantine-notifier после Step 25.7, а notifier пишет в db.
  const { setUserNotifiedQuarantineUntil } = await import('@/lib/db');
  await setUserNotifiedQuarantineUntil(user.id, quarantine.until);
}

/**
 * Отправляет `quarantine_end`, если у атлета ранее было активное уведомление
 * (`notifiedQuarantineUntil` set), а сейчас он из карантина вышел (по admin-lift
 * или по истечению окна). Очищает маркер, чтобы при следующем попадании в
 * карантин заново сработал start.
 */
export async function maybeNotifyQuarantineEnd({
  user,
  quarantine,
}: QuarantineNotifierArgs): Promise<void> {
  if (!user.notifiedQuarantineUntil) {
    return;
  }

  if (quarantine.inQuarantine) {
    return;
  }

  await notify(user.id, 'quarantine_end', {});

  const { setUserNotifiedQuarantineUntil } = await import('@/lib/db');
  await setUserNotifiedQuarantineUntil(user.id, null);
}
