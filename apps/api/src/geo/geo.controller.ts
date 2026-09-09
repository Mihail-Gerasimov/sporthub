// Прокси к картам: поиск координат по адресу и подсказки адресов.
//
// Ключи живут на сервере и наружу не уходят — ради этого прокси и существует.
//
// Шаг 34.54 выровнял оба маршрута по трём вещам:
//
// 1. **Свой тайм-аут.** Раньше поиск координат уходил наружу без ограничения по
//    времени: недоступная служба держала соединение бэкенда столько, сколько ей
//    вздумается, и десяток таких запросов занимал пул соединений целиком. Теперь
//    срок общий для обоих маршрутов и один на файл.
// 2. **Верхняя граница строк.** `min(1)` без `max()` пропускал внутрь мегабайт
//    текста (тело ограничено 256 КБ) — и он уходил в платный внешний запрос.
// 3. **Ограничение частоты.** Маршруты открыты гостю и тратят платную квоту, то
//    есть без предела становятся способом выесть чужой ключ.

import { Body, Controller, HttpCode, HttpStatus, Post } from '@nestjs/common';
import type { SuggestItem, SuggestItemType } from '@sporthub/types';
import { z } from 'zod';

import { Public } from '../auth/access.decorators';
import { ExternalServiceError, NotFoundError, ValidationError } from '../common/domain-error';
import { RateLimit } from '../common/rate-limit';

/**
 * Верхние границы строк. Числа взяты с запасом к живому вводу: самый длинный
 * почтовый адрес России короче сотни знаков, а поле поиска — тем более. Смысл
 * границы не в точности, а в том, чтобы в платный внешний запрос не уходил
 * мусор произвольной длины.
 */
const MAX_CITY_LENGTH = 100;
const MAX_ADDRESS_LENGTH = 300;
const MAX_QUERY_LENGTH = 300;

const geocodeSchema = z.object({
  city: z.string().min(1, 'Город обязателен').max(MAX_CITY_LENGTH, 'Город слишком длинный'),
  address: z.string().min(1, 'Адрес обязателен').max(MAX_ADDRESS_LENGTH, 'Адрес слишком длинный'),
});

const suggestSchema = z.object({
  text: z
    .string()
    .min(1, 'Текст для поиска обязателен')
    .max(MAX_QUERY_LENGTH, 'Текст для поиска слишком длинный'),
  types: z.enum(['locality', 'street', 'house', 'geo']).optional(),
  boundedBy: z
    .tuple([z.tuple([z.number(), z.number()]), z.tuple([z.number(), z.number()])])
    .optional(),
  results: z.number().int().min(1).max(20).optional(),
});

const GEOCODER_BASE_URL = 'https://geocode-maps.yandex.ru/1.x/';
const SUGGEST_BASE_URL = 'https://suggest-maps.yandex.ru/v1/suggest';
const DEFAULT_RESULTS = 7;

/**
 * Сколько ждать внешнюю службу. Пять секунд — больше, чем нужно живому запросу,
 * и меньше, чем терпит человек перед формой.
 *
 * Значение читается из окружения на каждый запрос: срок ожидания — настройка
 * выкатки (за медленным каналом его поднимают), и ради неё не должно быть
 * пересборки. Цена чтения переменной рядом с сетевым запросом неразличима.
 */
const DEFAULT_FETCH_TIMEOUT_MS = 5000;

function fetchTimeoutMs(): number {
  const parsed = Number(process.env.SPORT_HUB_GEO_TIMEOUT_MS);

  // Мусор и ноль трактуются как «не задано»: ноль означал бы обрыв любого запроса.
  if (!Number.isInteger(parsed) || parsed < 1) return DEFAULT_FETCH_TIMEOUT_MS;

  return parsed;
}

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
  // ⚠️ Маршрут остаётся ОТКРЫТЫМ сознательно, и это решение, а не забытая пометка.
  // По координатам рисуется карта на публичных страницах — главной и карточке клуба,
  // а адрес в форме публикации набирают до того, как форма отправлена. Закрыть его
  // сессией значило бы убрать карту у гостя.
  //
  // Плата за открытость — предел частоты: квота внешнего ключа стоит денег, и без
  // предела маршрут был бы способом её выесть. Счёт идёт по адресу обращения
  // (`common/rate-limit.ts`), для каждого маршрута отдельный.
  @Public()
  @RateLimit('geo')
  @Post('geocode')
  @HttpCode(HttpStatus.OK)
  async geocode(
    @Body() rawBody: unknown,
  ): Promise<{ coordinates: { lat: number; lng: number }; formattedAddress: string }> {
    const parsed = geocodeSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Невалидный запрос');
    }

    // ⚠️ Ключ геокодера — СВОЙ, серверный (фаза 34, шаг 34.55). Раньше здесь
    // читалась переменная с префиксом `NEXT_PUBLIC_` — то же имя, что вшивается
    // в браузерный бандл на сборке фронта. Одно имя на два ключа означало, что
    // серверный ключ либо уезжает в браузер, либо ломается при попытке их развести.
    //
    // Прежнее имя остаётся запасным значением, чтобы выкатка не требовала менять
    // окружение в ту же секунду; после переноса ключа его можно убрать.
    const apiKey =
      process.env.YANDEX_GEOCODER_API_KEY ?? process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

    if (!apiKey) {
      throw new ExternalServiceError('API-ключ Яндекс.Карт не настроен', 500);
    }

    const query = `${parsed.data.city}, ${parsed.data.address}`;
    const url = `${GEOCODER_BASE_URL}?apikey=${apiKey}&geocode=${encodeURIComponent(query)}&format=json&results=1`;

    let payload: {
      response?: { GeoObjectCollection?: { featureMember?: unknown[] } };
    };

    // Отмена по времени: без неё недоступная служба держала бы соединение бэкенда
    // до своего собственного тайм-аута, которого может не быть вовсе.
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs());

    try {
      // Заголовок обязателен: ключ ограничен по источнику запроса.
      const response = await fetch(url, {
        signal: controller.signal,
        headers: { Referer: 'http://localhost' },
      });
      payload = (await response.json()) as typeof payload;
    } catch (error) {
      // Обрыв по времени отличается от отказа службы и кодом: 504 говорит
      // «не дождались», 500 — «ответила ошибкой». Мониторинг различает их.
      if (error instanceof DOMException && error.name === 'AbortError') {
        throw new ExternalServiceError('Таймаут запроса к геокодеру', 504);
      }

      throw new ExternalServiceError('Ошибка при геокодировании адреса', 500);
    } finally {
      clearTimeout(timeout);
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

  // Открыт по той же причине и на тех же условиях, что и поиск координат:
  // подсказки нужны в поиске по городу, куда заходят без входа.
  @Public()
  @RateLimit('geo')
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
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs());

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
