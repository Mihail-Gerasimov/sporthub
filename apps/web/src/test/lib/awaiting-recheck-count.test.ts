// Счётчик публикаций, ждущих повторной проверки (шаг 36.21).
//
// ⚠️ Набор существует из-за дефекта, который не поймал ни один тест компонента,
// и это его главный урок.
//
// Первая версия читателя брала `total` из `data`: `apiGet` возвращает `data`
// и всё, что лежит РЯДОМ с ним в конверте, теряет. Постраничные маршруты кладут
// `total` вторым полем конверта — `{ success, data: [...], total, offset, limit }`, —
// поэтому `page.total` был `undefined`, а счётчик показывал ВЕЧНЫЙ НОЛЬ.
//
// По коду это выглядело правильным, тест компонента был зелёным (он проверяет
// отрисовку числа, а не то, откуда число взялось), и нашёл дефект браузерный прогон:
// в очереди одна публикация, в панели ноль.
//
// Отсюда проверка: не «есть ли число», а КАКОЕ ПОЛЕ ОТВЕТА оно читает.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('next/headers', () => ({
  cookies: async () => ({ get: () => undefined }),
}));

const { getAwaitingRecheckCount } = await import('@/lib/server-api');

describe('счётчик публикаций, ждущих повторной проверки', () => {
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

  it('берёт `total` из КОНВЕРТА, а не из `data`', async () => {
    // Форма ответа — настоящая, снятая с живого маршрута.
    fetchMock.mockResolvedValue(
      envelope({ success: true, data: [], total: 4, offset: 0, limit: 1 }),
    );

    expect(await getAwaitingRecheckCount()).toBe(4);
  });

  it('спрашивает отбор параметром и берёт одну строку', async () => {
    fetchMock.mockResolvedValue(envelope({ success: true, data: [], total: 0 }));

    await getAwaitingRecheckCount();

    const asked = String(fetchMock.mock.calls[0][0]);

    // Отбор — в адресе: под него заведён частичный индекс, отбирать должна база.
    expect(asked).toContain('awaitingRecheck=true');
    // И берётся число, а не выборка: тянуть все публикации ради счётчика —
    // цена, растущая вместе с каталогом.
    expect(asked).toContain('limit=1');
  });

  it('пустая очередь — ноль, а не «нет ответа»', async () => {
    fetchMock.mockResolvedValue(envelope({ success: true, data: [], total: 0 }));

    expect(await getAwaitingRecheckCount()).toBe(0);
  });

  it('отказ маршрута не выдаётся за пустую очередь', async () => {
    // Ноль означает «проверять нечего». Если так же отвечать на поломку, признак
    // молча исчезнет ровно тогда, когда он нужнее всего.
    fetchMock.mockResolvedValue(new Response('', { status: 500 }));

    await expect(getAwaitingRecheckCount()).rejects.toThrow();
  });
});
