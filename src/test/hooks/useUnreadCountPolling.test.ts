/**
 * Phase 24 Step 24.7: хук useUnreadCountPolling для NotificationBell.
 * Проверяет: первичный fetch, rerun при смене pathname, fallback interval 60s,
 * отсутствие запросов при userId=null, refetch-триггер.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/** Прокручивает планировщик, чтобы сработали микротаски и таймеры без смены текущего времени. */
async function flushMicrotasks() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
}

const { pathnameRef } = vi.hoisted(() => ({
  pathnameRef: { current: '/' },
}));

vi.mock('next/navigation', () => ({
  usePathname: () => pathnameRef.current,
}));

import { useUnreadCountPolling } from '@/hooks/useUnreadCountPolling';

let fetchSpy: ReturnType<typeof vi.spyOn>;

function makeResponse(unreadCount: number) {
  return {
    ok: true,
    json: () => Promise.resolve({ success: true, data: { unreadCount } }),
  } as unknown as Response;
}

beforeEach(() => {
  pathnameRef.current = '/';
  vi.useFakeTimers();
  fetchSpy = vi.spyOn(globalThis, 'fetch');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useUnreadCountPolling', () => {
  it('делает первичный fetch unread-count при userId и возвращает значение', async () => {
    fetchSpy.mockResolvedValueOnce(makeResponse(3));

    const { result } = renderHook(() => useUnreadCountPolling({ userId: 1 }));

    await flushMicrotasks();

    expect(result.current.unreadCount).toBe(3);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    expect(fetchSpy).toHaveBeenCalledWith(
      '/api/notifications/unread-count?userId=1',
      expect.any(Object),
    );
  });

  it('не делает запрос, если userId = null', async () => {
    renderHook(() => useUnreadCountPolling({ userId: null }));

    await flushMicrotasks();

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('повторно fetch-ит при смене pathname', async () => {
    fetchSpy.mockResolvedValue(makeResponse(1));

    const { rerender } = renderHook(() => useUnreadCountPolling({ userId: 1 }));

    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    pathnameRef.current = '/profile/athlete';
    rerender();

    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });

  it('делает fallback-fetch каждые 60 секунд, если pathname не меняется', async () => {
    fetchSpy.mockResolvedValue(makeResponse(2));

    renderHook(() => useUnreadCountPolling({ userId: 1 }));

    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(60_000);
    });

    expect(fetchSpy).toHaveBeenCalledTimes(3);
  });

  it('refetch() принудительно запускает запрос', async () => {
    fetchSpy.mockResolvedValue(makeResponse(5));

    const { result } = renderHook(() => useUnreadCountPolling({ userId: 1 }));

    await flushMicrotasks();
    expect(fetchSpy).toHaveBeenCalledTimes(1);

    await act(async () => {
      await result.current.refetch();
    });

    expect(fetchSpy).toHaveBeenCalledTimes(2);
  });
});
