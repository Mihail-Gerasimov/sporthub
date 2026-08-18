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
    console.error('[/api/suggest] YANDEX_SUGGEST_API_KEY is not set');
    return NextResponse.json(
      { success: false, error: 'API-ключ Yandex Geosuggest не настроен' },
      { status: 500 },
    );
  }

  try {
    // Формируем параметры запроса. lang в формате BCP-47 (ru_RU) —
    // с просто 'ru' Yandex Geosuggest может вернуть меньше/пустых результатов.
    const params = new URLSearchParams({
      apikey: apiKey,
      text,
      lang: 'ru_RU',
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

    // Referer обязателен — ограничение ключа Яндекса по домену (см. /api/geocode).
    // При server-to-server запросе заголовок не выставляется автоматически.
    const response = await fetch(`${SUGGEST_BASE_URL}?${params.toString()}`, {
      signal: controller.signal,
      headers: { Referer: 'http://localhost' },
    });

    clearTimeout(timeout);

    if (response.status === 429) {
      console.error('[/api/suggest] Yandex rate limit 429 for text:', text);
      return NextResponse.json(
        { success: false, error: 'Превышен лимит запросов к Yandex Geosuggest' },
        { status: 429 },
      );
    }

    if (!response.ok) {
      // Пытаемся достать тело ответа для диагностики, но не падаем если текста нет
      let bodyText = '';
      try {
        bodyText = await response.text();
      } catch {
        // ignore — тело опционально, статуса достаточно для лога
      }
      console.error('[/api/suggest] Yandex non-OK', response.status, bodyText.slice(0, 300));
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

    // MVP только для России. Whitelist "subtitle должен содержать 'Россия'"
    // слишком жёсткий: Яндекс для локальных русских городов часто отдаёт subtitle
    // без страны («Самарская область») или вовсе пустой subtitle у столиц.
    // Поэтому используем blacklist: пропускаем всё, кроме подсказок с явным
    // маркером зарубежной страны в subtitle. Item без subtitle пропускаем.
    const FOREIGN_MARKERS = [
      'сша',
      'usa',
      'украина',
      'беларусь',
      'казахстан',
      'узбекистан',
      'грузия',
      'армения',
      'азербайджан',
      'киргизия',
      'таджикистан',
      'молдова',
      'латвия',
      'литва',
      'эстония',
      'финляндия',
      'польша',
      'китай',
      'монголия',
      'турция',
      'германия',
      'испания',
      'италия',
      'франция',
      'великобритания',
      'япония',
      'индия',
      'канада',
      'мексика',
      'бразилия',
      'аргентина',
      'австралия',
      'израиль',
      'египет',
      'оаэ',
      'таиланд',
      'вьетнам',
      'швеция',
      'норвегия',
      'дания',
      'нидерланды',
      'бельгия',
      'австрия',
      'швейцария',
      'чехия',
      'венгрия',
      'румыния',
      'болгария',
      'греция',
      'португалия',
      'ирландия',
    ];

    const russiaOnly = suggestions.filter((s) => {
      if (!s.subtitle) return true;
      const lower = s.subtitle.toLowerCase();
      return !FOREIGN_MARKERS.some((m) => lower.includes(m));
    });

    return NextResponse.json({
      success: true,
      data: { suggestions: russiaOnly },
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
