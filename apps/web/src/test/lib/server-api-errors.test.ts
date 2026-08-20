// Поведение серверного клиента при недоступном бэкенде.
//
// До фазы 33 любой сбой превращался в пустой массив: страница отдавала код 200
// и выглядела как каталог, в котором ничего нет. Проверяется ровно эта разница —
// «спросить не удалось» больше не притворяется «данных нет».

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_FETCH = globalThis.fetch;

/**
 * Модуль импортируется по относительному пути НАМЕРЕННО.
 *
 * В настройках тестов путь `@/lib/server-api` подменён заглушкой, повторяющей
 * логику бэкенда поверх файлов. Здесь проверяется сам настоящий клиент, поэтому
 * подмену надо обойти. Заодно это видно в диффе: если однажды подмена уедет,
 * тест продолжит проверять то, что должен.
 */
async function loadServerApi() {
  vi.resetModules();

  return import('../../lib/server-api');
}

beforeEach(() => {
  vi.unstubAllGlobals();
});

afterEach(() => {
  globalThis.fetch = ORIGINAL_FETCH;
  vi.restoreAllMocks();
});

describe('Недоступный бэкенд', () => {
  it('сбой соединения не превращается в пустой список', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const { getSports, BackendUnavailableError } = await loadServerApi();

    await expect(getSports()).rejects.toBeInstanceOf(BackendUnavailableError);
  });

  it('ответ с ошибкой не превращается в пустой список', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('нет базы', { status: 503 })));

    const { getClubs, BackendUnavailableError } = await loadServerApi();

    await expect(getClubs()).rejects.toBeInstanceOf(BackendUnavailableError);
  });

  it('ответ с признаком неуспеха тоже считается сбоем', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: false, error: 'База недоступна' }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { getBookings, BackendUnavailableError } = await loadServerApi();

    await expect(getBookings()).rejects.toBeInstanceOf(BackendUnavailableError);
  });

  it('в сообщении об ошибке видно, какой запрос не прошёл', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('fetch failed')));

    const { getReviews } = await loadServerApi();

    await expect(getReviews()).rejects.toThrow(/\/reviews/);
  });
});

describe('Не найдено — это не сбой', () => {
  it('несуществующая публикация отдаёт пустое значение, а не ошибку', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 404 })));

    const { getClubBySlug } = await loadServerApi();

    await expect(getClubBySlug('нет-такого')).resolves.toBeNull();
  });

  it('а недоступный бэкенд на том же запросе — по-прежнему ошибка', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('', { status: 500 })));

    const { getClubBySlug, BackendUnavailableError } = await loadServerApi();

    await expect(getClubBySlug('клуб')).rejects.toBeInstanceOf(BackendUnavailableError);
  });
});

describe('Успешный ответ', () => {
  it('отдаёт данные как раньше', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ success: true, data: [{ id: 1, name: 'Йога' }] }), {
          status: 200,
          headers: { 'Content-Type': 'application/json' },
        }),
      ),
    );

    const { getSports } = await loadServerApi();

    expect(await getSports()).toEqual([{ id: 1, name: 'Йога' }]);
  });
});
