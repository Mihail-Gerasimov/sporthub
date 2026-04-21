// Phase 24: хелпер для отправки in-app уведомлений. Вызывается из FSM-переходов
// booking'а (Step 24.3) и link-переходов (Step 24.8). Архитектурно готов к SSE/WebSocket
// — в будущем меняется только внутренняя реализация доставки, сигнатура стабильна.
//
// STUB в Step 24.3: noop. Реальная реализация в Step 24.5 — fire-and-forget обёртка над
// createNotification() из db.ts с silent catch (по паттерну logAction).

import 'server-only';

import type { EntityId, NotificationType } from '@/types';

/**
 * Отправка уведомления пользователю. Fire-and-forget — не блокирует вызывающий flow.
 * В Step 24.3 функция ничего не делает (stub) — позволяет transitionBooking
 * уже содержать вызовы notify() по всем переходам без зависимости от db.ts.
 */
export function notify(
  userId: EntityId,
  type: NotificationType,
  payload: Record<string, unknown> = {},
): void {
  // STUB: Step 24.5 заменит на реальный createNotification({userId, type, payload}).catch(...).
  // void-использование защищает от eslint/unused-vars предупреждений без семантики.
  void userId;
  void type;
  void payload;
}
