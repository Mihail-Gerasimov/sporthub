// Тест подключения витринных запросов каталога (фаза 38, шаг 38.32).
//
// Витрина главной спрашивает у бэкенда шесть лучших клубов, четырёх тренеров
// и лидера с `limit=1`. До этого шага всё это считалось в памяти поверх полного
// каталога. Здесь проверяется не отрисовка, а АДРЕС: какие параметры уезжают
// в строку запроса и в каком виде. Четыре числа героя (`/stats/overview`) получат
// своего читателя вместе с первым потребителем — счётчиками витрины (38.69).
//
// ⚠️ Урок фазы 36 (`awaiting-recheck-count.test.ts`): тест компонента зелен и тогда,
// когда число берётся не оттуда. Поэтому смотрим на `fetch`, а не на экран.
//
// Диверсия д-22: `limit: undefined` не должен уезжать в адрес строкой `undefined` —
// бэкенд ответил бы 400, и витрина упала бы целиком. Сравнение — с ЧИСЛОМ,
// а не `toBeDefined()`.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { getPublishedClubs, getPublishedTrainers } = await import('@/lib/server-api');

describe('витринные запросы каталога', () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  const envelope = (body: unknown) =>
    new Response(JSON.stringify(body), {
      status: 200,
      headers: { 'content-type': 'application/json' },
    });

  /** Адрес первого вызова `fetch` — путь и параметры. */
  const askedUrl = (): URL => new URL(String(fetchMock.mock.calls[0][0]));

  it('витринный вызов клубов несёт sort=rating и limit ЧИСЛОМ', async () => {
    fetchMock.mockResolvedValue(envelope({ success: true, data: [] }));

    await getPublishedClubs({ sort: 'rating', limit: 6 });

    const url = askedUrl();

    expect(url.pathname).toBe('/api/clubs');
    expect(url.searchParams.get('sort')).toBe('rating');
    expect(Number(url.searchParams.get('limit'))).toBe(6);
  });

  it('рабочий вызов без параметров остаётся полным списком — адрес не изменился', async () => {
    // Двенадцать потребителей полного списка обязаны получить его как прежде:
    // ни `limit`, ни `sort` в адресе, ничего «по умолчанию».
    fetchMock.mockResolvedValue(envelope({ success: true, data: [] }));

    await getPublishedClubs();

    expect(askedUrl().pathname + askedUrl().search).toBe('/api/clubs');
  });

  it('limit: undefined не уезжает в адрес строкой (д-22)', async () => {
    fetchMock.mockResolvedValue(envelope({ success: true, data: [] }));

    await getPublishedClubs({ sort: 'rating', limit: undefined });

    const url = askedUrl();

    expect(url.searchParams.has('limit')).toBe(false);
    expect(url.search).not.toContain('undefined');
  });

  it('тренеры: те же параметры тем же путём', async () => {
    fetchMock.mockResolvedValue(envelope({ success: true, data: [] }));

    await getPublishedTrainers({ sort: 'rating', limit: 4 });

    const url = askedUrl();

    expect(url.pathname).toBe('/api/trainers');
    expect(url.searchParams.get('sort')).toBe('rating');
    expect(Number(url.searchParams.get('limit'))).toBe(4);
  });
});
