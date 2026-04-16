/**
 * Клиентский хук для работы с Yandex Geosuggest через /api/suggest.
 * Debounce 300ms, кэш последнего запроса, AbortController, gating по длине.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import type { SuggestItem, SuggestItemType } from '@/app/api/suggest/route';

// Минимальная длина текста для запроса
const MIN_TEXT_LENGTH = 2;

// Задержка debounce в миллисекундах
const DEBOUNCE_MS = 300;

export interface UseSuggestOptions {
  /** Текст для поиска подсказок */
  text: string;
  /** Тип подсказок (locality, street, house, geo) */
  types?: SuggestItemType | 'geo';
  /** Ограничивающий прямоугольник [[lng1, lat1], [lng2, lat2]] */
  boundedBy?: [[number, number], [number, number]];
  /** Включён ли хук (по умолчанию true) */
  enabled?: boolean;
}

export interface UseSuggestResult {
  suggestions: SuggestItem[];
  loading: boolean;
  error: string | null;
}

export function useSuggest({
  text,
  types,
  boundedBy,
  enabled = true,
}: UseSuggestOptions): UseSuggestResult {
  const [suggestions, setSuggestions] = useState<SuggestItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Кэш последнего успешного запроса
  const cacheRef = useRef<{ text: string; suggestions: SuggestItem[] } | null>(null);

  // AbortController для отмены in-flight запросов
  const controllerRef = useRef<AbortController | null>(null);

  const fetchSuggestions = useCallback(
    async (query: string, signal: AbortSignal) => {
      setLoading(true);
      setError(null);

      try {
        const payload: Record<string, unknown> = { text: query };
        if (types) payload.types = types;
        if (boundedBy) payload.boundedBy = boundedBy;

        const response = await fetch('/api/suggest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal,
        });

        if (signal.aborted) return;

        const data = await response.json();

        if (signal.aborted) return;

        if (data.success) {
          const items: SuggestItem[] = data.data.suggestions;
          setSuggestions(items);
          cacheRef.current = { text: query, suggestions: items };
        } else {
          setError(data.error ?? 'Ошибка при получении подсказок');
          setSuggestions([]);
        }
      } catch {
        if (signal.aborted) return;
        setError('Ошибка сети');
        setSuggestions([]);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    },
    [types, boundedBy],
  );

  useEffect(() => {
    // Отмена предыдущего in-flight запроса
    controllerRef.current?.abort();
    controllerRef.current = null;

    // Gating: хук выключен или текст слишком короткий
    if (!enabled || text.trim().length < MIN_TEXT_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      return;
    }

    const trimmed = text.trim();

    // Кэш: если текст совпадает с последним запросом — отдаём из кэша
    if (cacheRef.current && cacheRef.current.text === trimmed) {
      setSuggestions(cacheRef.current.suggestions);
      setLoading(false);
      return;
    }

    // Debounce
    const timer = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      fetchSuggestions(trimmed, controller.signal);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };
  }, [text, enabled, fetchSuggestions]);

  // Очистка AbortController при размонтировании
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { suggestions, loading, error };
}
