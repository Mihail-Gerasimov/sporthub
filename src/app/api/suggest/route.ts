/**
 * Серверный прокси к Yandex Geosuggest API.
 * Ключ YANDEX_SUGGEST_API_KEY — server-only, не попадает в браузер.
 * Возвращает нормализованный массив подсказок SuggestItem[].
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

// --- Типы подсказок ---

export type SuggestItemType = 'locality' | 'street' | 'house' | 'other';

export interface SuggestItem {
  title: string;
  subtitle?: string;
  value: string;
  type: SuggestItemType;
}

// --- Zod-схема входного payload ---

const suggestPayloadSchema = z.object({
  text: z.string().min(1, 'Текст для поиска обязателен'),
  types: z.enum(['locality', 'street', 'house', 'geo']).optional(),
  boundedBy: z
    .tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])])
    .optional(),
  results: z.number().int().min(1).max(20).optional(),
});

// --- Константы ---

const SUGGEST_BASE_URL = 'https://suggest-maps.yandex.ru/v1/suggest';
const DEFAULT_RESULTS = 7;
const FETCH_TIMEOUT_MS = 5000;

// --- Маппинг типов Yandex → SuggestItemType ---

function mapYandexType(tags: string[] | undefined): SuggestItemType {
  if (!tags || tags.length === 0) return 'other';
  if (tags.includes('locality')) return 'locality';
  if (tags.includes('street')) return 'street';
  if (tags.includes('house')) return 'house';
  return 'other';
}

// --- Обработчик ---

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Невалидный JSON' }, { status: 400 });
  }

  const validationResult = suggestPayloadSchema.safeParse(body);

  if (!validationResult.success) {
    return NextResponse.json(
      {
        success: false,
        error: validationResult.error.issues[0]?.message ?? 'Невалидный запрос',
      },
      { status: 400 },
    );
  }

  const { text, types, boundedBy, results } = validationResult.data;

  const apiKey = process.env.YANDEX_SUGGEST_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { success: false, error: 'API-ключ Yandex Geosuggest не настроен' },
      { status: 500 },
    );
  }

  try {
    // Формируем параметры запроса
    const params = new URLSearchParams({
      apikey: apiKey,
      text,
      lang: 'ru',
      results: String(results ?? DEFAULT_RESULTS),
    });

    if (types) {
      params.set('types', types);
    }

    if (boundedBy) {
      // Yandex Geosuggest ожидает bbox в формате "lng1,lat1~lng2,lat2"
      const [[lng1, lat1], [lng2, lat2]] = boundedBy;
      params.set('bbox', `${lng1},${lat1}~${lng2},${lat2}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    const response = await fetch(`${SUGGEST_BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      return NextResponse.json(
        { success: false, error: 'Превышен лимит запросов к Yandex Geosuggest' },
        { status: 429 },
      );
    }

    if (!response.ok) {
      return NextResponse.json(
        { success: false, error: 'Ошибка Yandex Geosuggest API' },
        { status: 502 },
      );
    }

    const data = await response.json();

    // Нормализуем ответ Yandex в массив SuggestItem
    const yandexResults: unknown[] = data?.results ?? [];

    const suggestions: SuggestItem[] = yandexResults.map((item: unknown) => {
      const entry = item as {
        title?: { text?: string };
        subtitle?: { text?: string };
        tags?: string[];
      };

      return {
        title: entry.title?.text ?? '',
        subtitle: entry.subtitle?.text,
        value: [entry.title?.text, entry.subtitle?.text].filter(Boolean).join(', '),
        type: mapYandexType(entry.tags),
      };
    });

    return NextResponse.json({
      success: true,
      data: { suggestions },
    });
  } catch (error) {
    // Таймаут AbortController
    if (error instanceof DOMException && error.name === 'AbortError') {
      return NextResponse.json(
        { success: false, error: 'Таймаут запроса к Yandex Geosuggest' },
        { status: 504 },
      );
    }

    return NextResponse.json(
      { success: false, error: 'Внутренняя ошибка при обращении к Yandex Geosuggest' },
      { status: 500 },
    );
  }
}
