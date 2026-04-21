// Phase 24 Step 24.5: реальная реализация notify() — fire-and-forget обёртка над
// createNotification() из db.ts. В Step 24.3 функция была noop-stub'ом; теперь
// транзакции FSM booking'а (transitionBooking) и link-переходы (Step 24.8) создают
// записи в notifications.json через этот хелпер.
//
// Архитектура готова к SSE/WebSocket: вызывающий код не знает как именно
// уведомление доставляется; в будущем меняется только внутренняя реализация
// (createNotification + emit в стрим) без правок вызывающей стороны.
//
// Паттерн fire-and-forget повторяет logAction (src/lib/logAction.ts): silent catch
// гарантирует, что ошибка notify никогда не блокирует основной flow.

import 'server-only';

import type { EntityId, NotificationType } from '@/types';

/**
 * Отправка уведомления пользователю. Возвращает Promise<void>, который разрешается
 * после записи в notifications.json (или при silent catch ошибки). Вызывающий код
 * решает сам: await — гарантированная доставка (в тестах, в транзакционных вызовах),
 * .catch(() => {}) — fire-and-forget (в client-mutations, где блокировать не надо).
 *
 * Dynamic import `@/lib/db` защищает от циклической зависимости db.ts ↔ notify.ts.
 * Ошибки поглощаются с логом — отсутствие уведомления не должно ломать основной flow.
 */
export async function notify(
  userId: EntityId,
  type: NotificationType,
  payload: Record<string, unknown> = {},
): Promise<void> {
  try {
    const { createNotification } = await import('@/lib/db');
    await createNotification({ userId, type, payload });
  } catch (error) {
    console.error('[notify] failed:', error);
  }
}
