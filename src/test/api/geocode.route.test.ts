// Тесты API геокодирования (Step 19.2)
// POST /api/geocode — принимает город+адрес, возвращает координаты через Яндекс Geocoder
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/geocode/route';

// Перехватываем вызовы к Яндекс Geocoder через spyOn (не ломает NextRequest.json())
let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', 'test-api-key');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Фабрика ответа Яндекс Geocoder
function makeGeocoderResponse(pos: string, formattedAddress: string) {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        response: {
          GeoObjectCollection: {
            featureMember: [
              {
                GeoObject: {
                  Point: { pos },
                  metaDataProperty: {
                    GeocoderMetaData: { text: formattedAddress },
                  },
                },
              },
            ],
          },
        },
      }),
  };
}

function makeEmptyGeocoderResponse() {
  return {
    ok: true,
    json: () =>
      Promise.resolve({
        response: {
          GeoObjectCollection: {
            featureMember: [],
          },
        },
      }),
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/geocode', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/geocode', () => {
  it('возвращает координаты для валидного адреса', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeGeocoderResponse('50.100202 53.195878', 'Россия, Самара, ул. Ленина, 1'),
    );

    const response = await POST(makeRequest({ city: 'Самара', address: 'ул. Ленина, 1' }));
    const result = await response.json();

    expect(response.status).toBe(200);
    expect(result.success).toBe(true);
    expect(result.data.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
    expect(result.data.formattedAddress).toBe('Россия, Самара, ул. Ленина, 1');
  });

  it('корректно парсит pos: порядок lng lat → { lat, lng }', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeGeocoderResponse('37.6173 55.7558', 'Россия, Москва, Красная площадь'),
    );

    const response = await POST(makeRequest({ city: 'Москва', address: 'Красная площадь' }));
    const result = await response.json();

    expect(result.data.coordinates.lat).toBeCloseTo(55.7558, 4);
    expect(result.data.coordinates.lng).toBeCloseTo(37.6173, 4);
  });

  it('возвращает ошибку для пустого city', async () => {
    const response = await POST(makeRequest({ city: '', address: 'ул. Ленина, 1' }));
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('возвращает ошибку для пустого address', async () => {
    const response = await POST(makeRequest({ city: 'Самара', address: '' }));
    const result = await response.json();

    expect(response.status).toBe(400);
    expect(result.success).toBe(false);
  });

  it('возвращает ошибку если Geocoder не нашёл адрес', async () => {
    fetchSpy.mockResolvedValueOnce(makeEmptyGeocoderResponse());

    const response = await POST(
      makeRequest({ city: 'Самара', address: 'несуществующая улица 99999' }),
    );
    const result = await response.json();

    expect(response.status).toBe(404);
    expect(result.success).toBe(false);
    expect(result.error).toContain('не найден');
  });

  it('возвращает ошибку при отсутствии API-ключа', async () => {
    vi.stubEnv('NEXT_PUBLIC_YANDEX_MAPS_API_KEY', '');

    const response = await POST(makeRequest({ city: 'Самара', address: 'ул. Ленина, 1' }));
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it('возвращает ошибку при сбое fetch к Geocoder', async () => {
    fetchSpy.mockRejectedValueOnce(new Error('Network error'));

    const response = await POST(makeRequest({ city: 'Самара', address: 'ул. Ленина, 1' }));
    const result = await response.json();

    expect(response.status).toBe(500);
    expect(result.success).toBe(false);
  });

  it('передаёт корректный запрос в Яндекс Geocoder', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeGeocoderResponse('50.1 53.2', 'Россия, Самара, ул. Ленина, 1'),
    );

    await POST(makeRequest({ city: 'Самара', address: 'ул. Ленина, 1' }));

    expect(fetchSpy).toHaveBeenCalledOnce();
    const callUrl = fetchSpy.mock.calls[0]?.[0] as string;
    expect(callUrl).toContain('geocode-maps.yandex.ru');
    expect(callUrl).toContain('apikey=test-api-key');
    expect(callUrl).toContain(encodeURIComponent('Самара, ул. Ленина, 1'));
  });
});
