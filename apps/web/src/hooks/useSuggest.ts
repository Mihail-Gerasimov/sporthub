/**
 * Клиентский хук для работы с Yandex Geosuggest через /api/suggest.
 * Debounce 300ms, кэш последнего запроса, AbortController, gating по длине.
 * types и boundedBy читаются через refs, чтобы нестабильные ref-ы в родителе
 * не запускали главный effect на каждом рендере (иначе in-flight запрос отменяется).
 */
'use client';

import { useEffect, useRef, useState } from 'react';

import type { SuggestItem, SuggestItemType } from '@sporthub/types';

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
  /** true после первого успешного (или пустого) ответа от сервера — нужен UI для показа «Ничего не найдено» */
  hasSearched: boolean;
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
  const [hasSearched, setHasSearched] = useState(false);

  // Кэш последнего успешного запроса
  const cacheRef = useRef<{ text: string; suggestions: SuggestItem[] } | null>(null);

  // AbortController для отмены in-flight запросов
  const controllerRef = useRef<AbortController | null>(null);

  // Рефы на types и boundedBy — читаются внутри fetch, не участвуют в dep-ах effect
  const typesRef = useRef(types);
  const boundedByRef = useRef(boundedBy);

  // Обновляем рефы при каждом рендере — их новое значение подхватится в следующем запросе
  typesRef.current = types;
  boundedByRef.current = boundedBy;

  useEffect(() => {
    // Отмена предыдущего in-flight запроса
    controllerRef.current?.abort();
    controllerRef.current = null;

    // Gating: хук выключен или текст слишком короткий
    if (!enabled || text.trim().length < MIN_TEXT_LENGTH) {
      setSuggestions([]);
      setLoading(false);
      setError(null);
      setHasSearched(false);
      return;
    }

    const trimmed = text.trim();

    // Кэш: если текст совпадает с последним запросом — отдаём из кэша
    if (cacheRef.current && cacheRef.current.text === trimmed) {
      setSuggestions(cacheRef.current.suggestions);
      setLoading(false);
      setError(null);
      setHasSearched(true);
      return;
    }

    // Debounce
    const timer = setTimeout(() => {
      const controller = new AbortController();
      controllerRef.current = controller;
      void fetchSuggestions(trimmed, controller.signal);
    }, DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
    };

    // Внутренний fetch — замыкается на актуальные рефы types/boundedBy,
    // поэтому в deps effect не нужно их включать.
    async function fetchSuggestions(query: string, signal: AbortSignal) {
      setLoading(true);
      setError(null);

      try {
        const payload: Record<string, unknown> = { text: query };
        if (typesRef.current) payload.types = typesRef.current;
        if (boundedByRef.current) payload.boundedBy = boundedByRef.current;

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
          setHasSearched(true);
        } else {
          setError(data.error ?? 'Ошибка при получении подсказок');
          setSuggestions([]);
          setHasSearched(true);
        }
      } catch (err) {
        if (signal.aborted) return;
        // AbortError не считаем ошибкой пользователю
        if (err instanceof DOMException && err.name === 'AbortError') return;
        setError('Ошибка сети');
        setSuggestions([]);
        setHasSearched(true);
      } finally {
        if (!signal.aborted) {
          setLoading(false);
        }
      }
    }
  }, [text, enabled]);

  // Очистка AbortController при размонтировании
  useEffect(() => {
    return () => {
      controllerRef.current?.abort();
    };
  }, []);

  return { suggestions, loading, error, hasSearched };
}
