/**
 * Phase 24 Step 24.7: хук опроса количества непрочитанных уведомлений.
 * Читает GET /api/notifications/unread-count, обновляется при:
 * - mount (первый fetch),
 * - смене pathname (интенсивная навигация пользователя),
 * - fallback interval 60s (если pathname долго не меняется).
 * При `enabled: false` запросы не делаются (гость либо админ без имперсонизации).
 *
 * Phase 34 Step 34.49: номер пользователя из строки запроса ушёл. Счётчик
 * считается по сессии, и спросить чужой больше нечем — раньше для этого хватало
 * одной цифры в адресе. Здесь остался только выключатель: спрашивать или нет.
 *
 * Phase 29 Step 29.2: помимо локального state хук также пишет полученное
 * значение в `useNotificationsStore` (через `setUnreadCount`) — это
 * единый источник правды для bell-badge и страницы уведомлений. Локальный
 * state хука сохранён для обратной совместимости (старые потребители читают
 * `result.unreadCount` напрямую). Новый код подписывается на стор.
 */
'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { useNotificationsStore } from '@/stores/useNotificationsStore';

const POLL_INTERVAL_MS = 60_000;

export interface UseUnreadCountPollingOptions {
  /** Спрашивать ли счётчик. `false` — гость: спрашивать нечего и не о ком. */
  enabled: boolean;
}

export interface UseUnreadCountPollingResult {
  unreadCount: number;
  /** Принудительный перезапрос (например, после mark-as-read в UI). */
  refetch: () => Promise<void>;
}

export function useUnreadCountPolling({
  enabled,
}: UseUnreadCountPollingOptions): UseUnreadCountPollingResult {
  const [unreadCount, setUnreadCount] = useState(0);
  const pathname = usePathname();

  // AbortController для отмены устаревшего in-flight запроса
  const controllerRef = useRef<AbortController | null>(null);

  const fetchCount = useCallback(async () => {
    controllerRef.current?.abort();
    const controller = new AbortController();
    controllerRef.current = controller;

    try {
      const response = await fetch('/api/notifications/unread-count', {
        signal: controller.signal,
      });
      if (!response.ok) return;

      const body = (await response.json()) as {
        success: boolean;
        data?: { unreadCount: number };
      };

      if (body.success && body.data && !controller.signal.aborted) {
        setUnreadCount(body.data.unreadCount);
        // Phase 29 Step 29.2: пишем в общий стор — bell-badge и страница
        // уведомлений теперь подписаны именно на него.
        useNotificationsStore.getState().setUnreadCount(body.data.unreadCount);
      }
    } catch {
      // Ошибки сети и аборты игнорируем — счётчик остаётся прежним
    }
  }, []);

  const refetch = useCallback(async () => {
    if (!enabled) return;
    await fetchCount();
  }, [enabled, fetchCount]);

  // Триггер: mount и смена pathname → немедленный fetch.
  // setState внутри fetchCount срабатывает после await fetch(...), то есть в
  // следующем микро-шаге event loop'а — не caскадит рендер эффекта. Правило
  // react-hooks/set-state-in-effect этого различить не умеет, поэтому точечный
  // disable. Прежняя обёртка в queueMicrotask делала ровно то же, но добавляла
  // лишний tick задержки, из-за чего badge ~100-500мс показывал 0 после логина.
  useEffect(() => {
    if (!enabled) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void fetchCount();
  }, [enabled, pathname, fetchCount]);

  // Fallback: опрос раз в 60 секунд, пока хук включён
  useEffect(() => {
    if (!enabled) return;

    const intervalId = setInterval(() => {
      void fetchCount();
    }, POLL_INTERVAL_MS);

    return () => {
      clearInterval(intervalId);
    };
  }, [enabled, fetchCount]);

  // Выключенный опрос отдаёт 0 вычислением, а не записью в состояние из эффекта.
  return { unreadCount: enabled ? unreadCount : 0, refetch };
}
