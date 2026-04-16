/**
 * Тесты API route POST /api/suggest — серверный прокси к Yandex Geosuggest.
 * Phase 23 — Step 23.2.
 */
import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST } from '@/app/api/suggest/route';

let fetchSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  fetchSpy = vi.spyOn(globalThis, 'fetch');
  vi.stubEnv('YANDEX_SUGGEST_API_KEY', 'test-suggest-key');
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

// Фабрика ответа Yandex Geosuggest
function makeYandexSuggestResponse(
  results: Array<{
    title: { text: string };
    subtitle?: { text: string };
    tags?: string[];
  }>,
) {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ results }),
  };
}

function makeRequest(body: Record<string, unknown>): NextRequest {
  return new NextRequest('http://localhost:3000/api/suggest', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/suggest', () => {
  it('возвращает подсказки при валидном запросе', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeYandexSuggestResponse([
        {
          title: { text: 'Самара' },
          subtitle: { text: 'Россия' },
          tags: ['locality'],
        },
        {
          title: { text: 'Саратов' },
          subtitle: { text: 'Россия' },
          tags: ['locality'],
        },
      ]) as Response,
    );

    const request = makeRequest({ text: 'Сам' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.suggestions).toHaveLength(2);
    expect(data.data.suggestions[0]).toEqual({
      title: 'Самара',
      subtitle: 'Россия',
      value: 'Самара, Россия',
      type: 'locality',
    });
  });

  it('передаёт types и boundedBy в запрос к Yandex', async () => {
    fetchSpy.mockResolvedValueOnce(makeYandexSuggestResponse([]) as Response);

    const request = makeRequest({
      text: 'Ленина',
      types: 'street',
      boundedBy: [
        [49.0, 53.0],
        [51.0, 54.0],
      ],
    });

    await POST(request);

    expect(fetchSpy).toHaveBeenCalledOnce();
    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('types=street');
    // URLSearchParams кодирует ~ как %7E
    expect(calledUrl).toContain('bbox=49%2C53%7E51%2C54');
  });

  it('маппит типы Yandex корректно', async () => {
    fetchSpy.mockResolvedValueOnce(
      makeYandexSuggestResponse([
        { title: { text: 'ул. Ленина' }, tags: ['street'] },
        { title: { text: 'ул. Ленина, 5' }, tags: ['house'] },
        { title: { text: 'Парк' }, tags: ['toponym'] },
        { title: { text: 'Самара' }, tags: ['locality'] },
      ]) as Response,
    );

    const request = makeRequest({ text: 'Ленина' });
    const response = await POST(request);
    const data = await response.json();

    expect(data.data.suggestions[0].type).toBe('street');
    expect(data.data.suggestions[1].type).toBe('house');
    expect(data.data.suggestions[2].type).toBe('other');
    expect(data.data.suggestions[3].type).toBe('locality');
  });

  it('возвращает 400 при пустом text', async () => {
    const request = makeRequest({ text: '' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('возвращает 400 при отсутствующем text', async () => {
    const request = makeRequest({});
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
  });

  it('возвращает 400 при невалидном JSON', async () => {
    const request = new NextRequest('http://localhost:3000/api/suggest', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: 'not json',
    });

    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.success).toBe(false);
    expect(data.error).toBe('Невалидный JSON');
  });

  it('возвращает 500 при отсутствии API-ключа', async () => {
    vi.stubEnv('YANDEX_SUGGEST_API_KEY', '');

    const request = makeRequest({ text: 'Самара' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.success).toBe(false);
    expect(data.error).toContain('API-ключ');
  });

  it('возвращает 429 при rate limit от Yandex', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: () => Promise.resolve({}),
    } as Response);

    const request = makeRequest({ text: 'Москва' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(429);
    expect(data.success).toBe(false);
    expect(data.error).toContain('лимит');
  });

  it('возвращает 502 при ошибке от Yandex API', async () => {
    fetchSpy.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: () => Promise.resolve({}),
    } as Response);

    const request = makeRequest({ text: 'Москва' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(502);
    expect(data.success).toBe(false);
  });

  it('возвращает пустой массив при пустом ответе Yandex', async () => {
    fetchSpy.mockResolvedValueOnce(makeYandexSuggestResponse([]) as Response);

    const request = makeRequest({ text: 'абвгде' });
    const response = await POST(request);
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.success).toBe(true);
    expect(data.data.suggestions).toEqual([]);
  });

  it('корректно обрабатывает ограничение results', async () => {
    fetchSpy.mockResolvedValueOnce(makeYandexSuggestResponse([]) as Response);

    const request = makeRequest({ text: 'Москва', results: 3 });
    await POST(request);

    const calledUrl = fetchSpy.mock.calls[0][0] as string;
    expect(calledUrl).toContain('results=3');
  });
});
