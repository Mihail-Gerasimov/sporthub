/* Серверный API для геокодирования адреса через Яндекс HTTP Geocoder.
   Принимает город + адрес, возвращает координаты и нормализованный адрес. */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const geocodePayloadSchema = z.object({
  city: z.string().min(1, 'Город обязателен'),
  address: z.string().min(1, 'Адрес обязателен'),
});

const GEOCODER_BASE_URL = 'https://geocode-maps.yandex.ru/1.x/';

export async function POST(request: NextRequest) {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ success: false, error: 'Невалидный JSON' }, { status: 400 });
  }

  try {
    const validationResult = geocodePayloadSchema.safeParse(body);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: validationResult.error.issues[0]?.message ?? 'Невалидный запрос' },
        { status: 400 },
      );
    }

    const { city, address } = validationResult.data;
    const apiKey = process.env.NEXT_PUBLIC_YANDEX_MAPS_API_KEY;

    if (!apiKey) {
      return NextResponse.json(
        { success: false, error: 'API-ключ Яндекс.Карт не настроен' },
        { status: 500 },
      );
    }

    const geocodeQuery = `${city}, ${address}`;
    const url = `${GEOCODER_BASE_URL}?apikey=${apiKey}&geocode=${encodeURIComponent(geocodeQuery)}&format=json&results=1`;

    const geocoderResponse = await fetch(url);
    const geocoderData = await geocoderResponse.json();

    const geoObjects = geocoderData?.response?.GeoObjectCollection?.featureMember ?? [];

    if (geoObjects.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Адрес не найден. Проверьте правильность ввода.' },
        { status: 404 },
      );
    }

    const geoObject = geoObjects[0].GeoObject;
    // Яндекс Geocoder возвращает pos в формате "lng lat" (долгота пробел широта)
    const pos: string = geoObject.Point.pos;
    const [lngStr, latStr] = pos.split(' ');
    const lat = parseFloat(latStr);
    const lng = parseFloat(lngStr);

    const formattedAddress: string =
      geoObject.metaDataProperty?.GeocoderMetaData?.text ?? geocodeQuery;

    return NextResponse.json({
      success: true,
      data: {
        coordinates: { lat, lng },
        formattedAddress,
      },
    });
  } catch {
    return NextResponse.json(
      { success: false, error: 'Ошибка при геокодировании адреса' },
      { status: 500 },
    );
  }
}
