/**
 * Phase 24 Step 24.7: хук опроса количества непрочитанных уведомлений.
 * Читает GET /api/notifications/unread-count, обновляется при:
 * - mount (первый fetch),
 * - смене pathname (интенсивная навигация пользователя),
 * - fallback interval 60s (если pathname долго не меняется).
 * При userId=null запросы не делаются (guest/admin без impersonation).
 */
'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

const POLL_INTERVAL_MS = 60_000;

export interface UseUnreadCountPollingOptions {
  /** Id пользователя, для которого читаем счётчик. null → запросы не делаются. */
  userId: number | null;
}

export interface UseUnreadCountPollingResult {
  unreadCount: number;
  /** Принудительный перезапрос (например, после mark-as-read в UI). */
  refetch: () => Promise<void>;
}

export function useUnreadCountPolling({
  userId,
}: UseUnreadCountPollingOptions): UseUnreadCountPollingResult {
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();

  // AbortController для отмены устаревшего in-flight запроса
  const controllerRef = useRef<AbortController | null>(null);

  const fetchCount = useCallback(async (targetUserId: number) => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch(`/api/notifications/unread-count?userId=${targetUserId}`, {
        signal: controller.signal,
      });
      if (!response.ok) return;

      const body = (await response.json()) as {
        success: boolean;
        data?: { unreadCount: number };
      };

      if (body.success && body.data && !controller.signal.aborted) {
        setUnreadCount(body.data.unreadCount);
      }
    } catch {
      // Ошибки сети и аборты игнорируем — счётчик остаётся прежним
    }
  }, []);

  const refetch = useCallback(async () => {
    if (userId === null) return;
    await fetchCount(userId);
  }, [userId, fetchCount]);

  // Триггер: mount и смена pathname → немедленный fetch.
  // setState внутри fetchCount срабатывает после await fetch(...), то есть в
  // следующем микро-шаге event loop'а — не caскадит рендер эффекта. Правило
  // react-hooks/set-state-in-effect этого различить не умеет, поэтому точечный
  // disable. Прежняя обёртка в queueMicrotask делала ровно то же, но добавляла
  // лишний tick задержки, из-за чего badge ~100-500мс показывал 0 после логина.
  useEffect(() => {
    if (userId === null) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCount(userId);
  }, [userId, pathname, fetchCount]);

  // Fallback: interval 60s пока userId активен
  useEffect(() => {
    if (userId === null) return;

    const intervalId = setInterval(() => {
      void fetchCount(userId);
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [userId, fetchCount]);

  // Когда userId становится null — счётчик отдаётся как 0 (derived value),
  // без setState в effect. Так избегаем react-hooks/set-state-in-effect.
  return { unreadCount: userId === null ? 0 : unreadCount, refetch };
}
