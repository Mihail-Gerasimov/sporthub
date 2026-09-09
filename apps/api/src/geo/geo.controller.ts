// Прокси к картам: поиск координат по адресу и подсказки адресов.
//
// Ключи живут на сервере и наружу не уходят — ради этого прокси и существует.
//
// ⚠️ Запрос координат идёт без ограничения по времени: недоступность внешней
// службы вешает запрос до её собственного тайм-аута. У подсказок ограничение
// есть — пять секунд. Разница перенесена как есть и записана в долги.

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { SuggestItem, SuggestItemType } from '@sporthub/types';
import { z } from 'zod';

import { Public } from '../auth/access.decorators';
import { ExternalServiceError, NotFoundError, ValidationError } from '../common/domain-error';

const geocodeSchema = z.object({
  city: z.string().min(1, 'Город обязателен'),
  address: z.string().min(1, 'Адрес обязателен'),
});

const suggestSchema = z.object({
  text: z.string().min(1, 'Текст для поиска обязателен'),
  types: z.enum(['locality', 'street', 'house', 'geo']).optional(),
  boundedBy: z
    .tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])])
    .optional(),
  results: z.number().int().min(1).max(20).optional(),
});

const GEOCODER_BASE_URL = 'https://geocode-maps.yandex.ru/1.x/';
const SUGGEST_BASE_URL = 'https://suggest-maps.yandex.ru/v1/suggest';
const DEFAULT_RESULTS = 7;
const FETCH_TIMEOUT_MS = 5000;

/** Страны, которые в выдачу подсказок не попадают: сервис работает по России. */
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

function mapSuggestType(tags: string[] | undefined): SuggestItemType {
  if (!tags || tags.length === 0) return 'other';
  if (tags.includes('locality')) return 'locality';
  if (tags.includes('street')) return 'street';
  if (tags.includes('house')) return 'house';

  return 'other';
}

@Controller()
export class GeoController {
  // Открыто гостю: по координатам рисуется карта на публичных страницах — главной
  // и карточке клуба, — а подсказки адреса нужны в поиске по городу, куда заходят
  // без входа.
  //
  // STUB: временно. Оба маршрута тратят платную внешнюю квоту, и открытыми их
  // держать нельзя: гость может выкачивать чужой ключ запросами. На шаге 34.54 они
  // закрываются и ограничиваются частотой обращений.
  @Public()
  @Post('geocode')
  @HttpCode(HttpStatus.OK)
  async geocode(
    @Body() rawBody: unknown,
  ): Promise<{ coordinates: { lat: number; lng: number }; formattedAddress: string }> {
    const parsed = geocodeSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Невалидный запрос');
    }

    const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError('API-ключ Яндекс.Карт не настроен', 500);
    }

    const query = `${parsed.data.city}, ${parsed.data.address}`;
    const url = `${GEOCODER_BASE_URL}?apikey=${apiKey}&geocode=${encodeURIComponent(query)}&format=json&results=1`;

    let payload: {
      response?: { GeoObjectCollection?: { featureMember?: unknown[] } };
    };

    try {
      // Заголовок обязателен: ключ ограничен по источнику запроса.
      const response = await fetch(url, { headers: { Referer: 'http://localhost' } });
      payload = (await response.json()) as typeof payload;
    } catch {
      throw new ExternalServiceError('Ошибка при геокодировании адреса', 500);
    }

    const found = payload?.response?.GeoObjectCollection?.featureMember ?? [];

    if (found.length === 0) {
      throw new NotFoundError('Адрес не найден. Проверьте правильность ввода.');
    }

    const geoObject = (found[0] as { GeoObject: Record<string, never> }).GeoObject as unknown as {
      Point: { pos: string };
      metaDataProperty?: { GeocoderMetaData?: { text?: string } };
    };
    // Служба отдаёт долготу первой, широту второй — порядок обратный привычному.
    const [rawLng, rawLat] = geoObject.Point.pos.split(' ');

    return {
      coordinates: { lat: parseFloat(rawLat), lng: parseFloat(rawLng) },
      formattedAddress: geoObject.metaDataProperty?.GeocoderMetaData?.text ?? query,
    };
  }

  // Открыто по той же причине и с той же оговоркой.
  // STUB: временно, до шага 34.54 — закрытие и ограничение частоты.
  @Public()
  @Post('suggest')
  @HttpCode(HttpStatus.OK)
  async suggest(@Body() rawBody: unknown): Promise<{ suggestions: SuggestItem[] }> {
    const parsed = suggestSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Невалидный запрос');
    }

    const apiKey = process.env.YANDEX_SUGGEST_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError('API-ключ Yandex Geosuggest не настроен', 500);
    }

    const { text, types, boundedBy, results } = parsed.data;
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
      const [[lng1, lat1], [lng2, lat2]] = boundedBy;
      params.set('bbox', `${lng1},${lat1}~${lng2},${lat2}`);
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);

    let response: Response;

    try {
      response = await fetch(`${SUGGEST_BASE_URL}?${params.toString()}`, {
        signal: controller.signal,
        headers: { Referer: 'http://localhost' },
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ExternalServiceError('Таймаут запроса к Yandex Geosuggest', 504);
      }

      throw new ExternalServiceError('Внутренняя ошибка при обращении к Yandex Geosuggest', 500);
    } finally {
      clearTimeout(timeout);
    }

    if (response.status === 429) {
      throw new ExternalServiceError('Превышен лимит запросов к Yandex Geosuggest', 429);
    }

    if (!response.ok) {
      throw new ExternalServiceError('Ошибка Yandex Geosuggest API', 502);
    }

    const payload = (await response.json()) as { results?: unknown[] };
    const suggestions: SuggestItem[] = (payload?.results ?? []).map((item) => {
      const entry = item as {
        title?: { text?: string };
        subtitle?: { text?: string };
        tags?: string[];
      };

      return {
        title: entry.title?.text ?? '',
        subtitle: entry.subtitle?.text,
        value: [entry.title?.text, entry.subtitle?.text].filter(Boolean).join(', '),
        type: mapSuggestType(entry.tags),
      };
    });

    // Отбрасываются только подсказки с явным признаком другой страны:
    // у российских городов подпись часто пустая или без страны вовсе.
    return {
      suggestions: suggestions.filter((item) => {
        if (!item.subtitle) return true;

        const lower = item.subtitle.toLowerCase();

        return !FOREIGN_MARKERS.some((marker) => lower.includes(marker));
      }),
    };
  }
}

export const GEO_CONTROLLERS = [GeoController];
