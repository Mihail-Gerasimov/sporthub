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
  // Запуск через микротаску (queueMicrotask), чтобы setState внутри fetchCount
  // не попал в «синхронный setState в effect» (правило react-hooks).
  useEffect(() => {
    if (userId === null) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      void fetchCount(userId);
    });
    return () => {
      cancelled = true;
    };
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
