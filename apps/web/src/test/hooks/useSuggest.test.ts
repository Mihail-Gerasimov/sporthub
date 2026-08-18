/**
 * Тесты хука useSuggest — debounce, кэш, cancel, gating.
 * Phase 23 — Step 23.2.
 */
import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { useSuggest } from '@/hooks/useSuggest';

let fetchSpy: ReturnType<typeof vi.spyOn>;

function makeApiResponse(
  suggestions: Array<{ title: string; subtitle?: string; value: string; type: string }>,
) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: true,
        data: { suggestions },
      }),
  };
}

function makeErrorResponse(error: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        success: false,
        error,
      }),
  };
}

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.useFakeTimers();
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('useSuggest', () => {
  it('не делает запрос при text.length < 2', async () => {
    renderHook(() => useSuggest({ text: 'С' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('не делает запрос при enabled: false', async () => {
    renderHook(() => useSuggest({ text: 'Самара', enabled: false }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(500);
    });

    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('делает запрос после debounce при text.length >= 2', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([
        { title: 'Самара', subtitle: 'Россия', value: 'Самара, Россия', type: 'locality' },
      ]) as Response,
    );

    const { result } = renderHook(() => useSuggest({ text: 'Сам' }));

    // До debounce — запрос не отправлен
    expect(fetchSpy).not.toHaveBeenCalled();

    // Продвигаем таймер на 300ms (debounce) + flush microtasks
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].title).toBe('Самара');
    expect(result.current.loading).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('возвращает подсказки из кэша при повторном запросе с тем же текстом', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([{ title: 'Самара', value: 'Самара', type: 'locality' }]) as Response,
    );

    const { result, rerender } = renderHook(({ text }) => useSuggest({ text }), {
      initialProps: { text: 'Сам' },
    });

    // Первый запрос
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions).toHaveLength(1);

    // Меняем текст и возвращаем обратно — должен использовать кэш
    rerender({ text: 'Самар' });
    rerender({ text: 'Сам' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Fetch вызван только один раз (кэш сработал для 'Сам')
    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.current.suggestions).toHaveLength(1);
  });

  it('отменяет предыдущий запрос при изменении текста', async () => {
    let abortedFirst = false;

    // Первый запрос — перехватываем abort
    fetchSpy.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => {
            abortedFirst = true;
            reject(new DOMException('Aborted', 'AbortError'));
          });
        }),
    );
    // Второй запрос — успешный
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([{ title: 'Москва', value: 'Москва', type: 'locality' }]) as Response,
    );

    const { result, rerender } = renderHook(({ text }) => useSuggest({ text }), {
      initialProps: { text: 'Сам' },
    });

    // Продвигаем debounce — первый запрос уходит
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchSpy).toHaveBeenCalledOnce();

    // Меняем текст — первый запрос должен быть отменён
    rerender({ text: 'Мос' });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(abortedFirst).toBe(true);
    expect(result.current.suggestions).toHaveLength(1);
    expect(result.current.suggestions[0].title).toBe('Москва');
  });

  it('обрабатывает ошибку API', async () => {
    fetchSpy.mockResolvedValueOnce(makeErrorResponse('Ошибка сервера') as Response);

    const { result } = renderHook(() => useSuggest({ text: 'Самара' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.error).toBe('Ошибка сервера');
    expect(result.current.suggestions).toEqual([]);
    expect(result.current.loading).toBe(false);
  });

  it('очищает подсказки при переходе text в пустую строку', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([{ title: 'Самара', value: 'Самара', type: 'locality' }]) as Response,
    );

    const { result, rerender } = renderHook(({ text }) => useSuggest({ text }), {
      initialProps: { text: 'Сам' },
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.suggestions).toHaveLength(1);

    // Очищаем текст
    rerender({ text: '' });

    expect(result.current.suggestions).toEqual([]);
  });

  it('передаёт types в запрос', async () => {
    fetchSpy.mockResolvedValueOnce(makeApiResponse([]) as Response);

    renderHook(() => useSuggest({ text: 'Самара', types: 'locality' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    const callBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
    expect(callBody.types).toBe('locality');
  });

  it('выставляет hasSearched=true после успешного ответа', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeApiResponse([{ title: 'Самара', value: 'Самара', type: 'locality' }]) as Response,
    );

    const { result } = renderHook(() => useSuggest({ text: 'Самара' }));

    expect(result.current.hasSearched).toBe(false);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.hasSearched).toBe(true);
  });

  it('hasSearched=true даже при пустом результате (для UI "Ничего не найдено")', async () => {
    fetchSpy.mockResolvedValueOnce(makeApiResponse([]) as Response);

    const { result } = renderHook(() => useSuggest({ text: 'zzzz' }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(result.current.hasSearched).toBe(true);
    expect(result.current.suggestions).toEqual([]);
  });

  it('не делает повторный fetch при нестабильном boundedBy на том же text', async () => {
    // Regression: boundedBy передавался как новый массив на каждый рендер родителя,
    // из-за чего useCallback пересоздавался, effect перезапускался и abort отменял запрос.
    fetchSpy.mockResolvedValue(
      makeApiResponse([{ title: 'ул. Ленина', value: 'ул. Ленина', type: 'street' }]) as Response,
    );

    const { result, rerender } = renderHook(
      ({ boundedBy }: { boundedBy: [[number, number], [number, number]] }) =>
        useSuggest({ text: 'Ленина', boundedBy }),
      {
        initialProps: {
          boundedBy: [
            [1, 2],
            [3, 4],
          ] as [[number, number], [number, number]],
        },
      },
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    expect(fetchSpy).toHaveBeenCalledOnce();
    expect(result.current.suggestions).toHaveLength(1);

    // Перерендерим с новым ref на boundedBy — effect не должен перезапуститься
    rerender({
      boundedBy: [
        [1, 2],
        [3, 4],
      ] as [[number, number], [number, number]],
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(300);
    });

    // Fetch по-прежнему вызван один раз (кэш не затронут, effect не перезапущен на том же text)
    expect(fetchSpy).toHaveBeenCalledOnce();
  });
});
