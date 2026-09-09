// Сессия в запросах серверного клиента.
//
// ⚠️ Что утечёт (точнее — отвалится) в бою, если этой проверки нет.
// Серверные страницы ходят на бэкенд НЕ через проксирование Next, а напрямую по
// внутреннему адресу, и заголовков сами не несут: `cookies()` в браузерном запросе
// и `fetch` со стороны сервера — две разные вещи. Cookie сессии в такой запрос
// кладёт `sessionHeaders()` из `lib/server-api`. Убери её — и бэкенд ответит 401
// на всё закрытое, а поломка будет невидимой при ручной проверке: в браузере
// сценарии останутся рабочими (там запросы идут через проксирование, cookie
// доходит сама), пустыми станут только серверные страницы кабинетов.
//
// Диверсия d-24 фазы 34 (`headers: await sessionHeaders()` → `headers: {}`)
// не покраснела: единственный набор, ходящий серверными страницами
// (`test/profile/profile-page-requests.test.ts`), сверяет только адреса и мокает
// `@/lib/session` целиком — до настоящих заголовков дело там не доходит.
//
// Здесь проверяются ОБЕ обёртки клиента (`apiGet` и `apiGetOptional`): проброс
// в них написан по отдельности, и сломать можно любую из двух.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * Что отдаст `cookies()` на этот раз:
 * строка заголовка — вошедший, `''` — гость, `null` — отрисовка вне запроса
 * (сборка, прогрев), когда хранилища cookie нет вовсе и обращение к нему бросает.
 */
let cookieHeader: string | null = '';

vi.mock('next/headers', () => ({
  cookies: async () => {
    const header = cookieHeader;

    if (header === null) throw new Error('cookies() вызван вне запроса');

    return { toString: () => header };
  },
}));

/** Ответ бэкенда: клиенту важна только оболочка `{ success, data }`. */
function okResponse(data: unknown): Response {
  return new Response(JSON.stringify({ success: true, data }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}

let fetchMock: ReturnType<typeof vi.fn>;

/** Заголовки, с которыми клиент сходил на бэкенд в вызове под номером `index`. */
function headersOfCall(index = 0): Record<string, string> {
  const init = fetchMock.mock.calls[index]?.[1] as RequestInit | undefined;

  return (init?.headers ?? {}) as Record<string, string>;
}

/**
 * Настоящий клиент, а не подмена.
 *
 * `vi.resetModules()` обязателен: модуль читает адрес бэкенда и захватывает
 * `cookies()` на верхнем уровне, и без сброса второй тест работал бы с телом,
 * собранным в первом.
 */
async function loadServerApi() {
  vi.resetModules();

  return import('@/lib/server-api');
}

beforeEach(() => {
  // Не `mockResolvedValue`: тело `Response` читается один раз, и один и тот же
  // экземпляр на несколько запросов упал бы «Body has already been read».
  fetchMock = vi.fn().mockImplementation(() => Promise.resolve(okResponse([])));
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  cookieHeader = '';
});

describe('Серверный клиент: проброс сессии на бэкенд', () => {
  describe('обычный запрос (apiGet)', () => {
    it('несёт cookie вошедшего', async () => {
      cookieHeader = 'sh-session=session-2';

      const { getBookings } = await loadServerApi();

      await getBookings();

      // Именно заголовок, а не «какой-то непустой объект»: бэкенд узнаёт сессию
      // по имени cookie, и урезанный до пустоты набор — это и есть 401 на проде.
      expect(headersOfCall()).toEqual({ cookie: 'sh-session=session-2' });
    });

    it('у гостя cookie не подставляет', async () => {
      cookieHeader = '';

      const { getBookings } = await loadServerApi();

      await getBookings();

      // Пустой заголовок отправлять нельзя: он не «ничей», а «вот моя сессия,
      // и она пустая» — часть прокси и бэкендов разбирают это иначе, чем его
      // отсутствие. Гость обязан выглядеть гостем.
      expect(headersOfCall()).toEqual({});
    });

    it('отрисовка вне запроса не роняет клиент и идёт без cookie', async () => {
      cookieHeader = null;

      const { getSports } = await loadServerApi();

      await expect(getSports()).resolves.toEqual([]);
      expect(headersOfCall()).toEqual({});
    });
  });

  describe('запрос, где «не найдено» — обычный ответ (apiGetOptional)', () => {
    it('несёт cookie вошедшего', async () => {
      cookieHeader = 'sh-session=session-7';
      fetchMock.mockImplementation(() => Promise.resolve(okResponse({ club: { id: 1 } })));

      const { getClubBySlug } = await loadServerApi();

      await getClubBySlug('yoga-loft');

      // Вторая обёртка клиента: скрытая публикация в кабинете провайдера
      // читается через неё, и без сессии бэкенд отдаст 404 вместо карточки.
      expect(headersOfCall()).toEqual({ cookie: 'sh-session=session-7' });
    });

    it('у гостя cookie не подставляет', async () => {
      cookieHeader = '';
      fetchMock.mockImplementation(() => Promise.resolve(okResponse({ trainer: { id: 1 } })));

      const { getTrainerBySlug } = await loadServerApi();

      await getTrainerBySlug('ivanov');

      expect(headersOfCall()).toEqual({});
    });
  });

  it('сессия уезжает в КАЖДЫЙ запрос, а не только в первый', async () => {
    cookieHeader = 'sh-session=session-2';

    const { getClubs, getTrainers, getUsers } = await loadServerApi();

    await getClubs();
    await getTrainers();
    await getUsers();

    // Страница кабинета делает не один поход, а пять-шесть. Проброс, работающий
    // только на первом, дал бы наполовину пустую страницу — самое неприятное
    // из состояний: похоже на «данных нет», а не на поломку.
    expect(fetchMock.mock.calls).toHaveLength(3);
    expect([headersOfCall(0), headersOfCall(1), headersOfCall(2)]).toEqual([
      { cookie: 'sh-session=session-2' },
      { cookie: 'sh-session=session-2' },
      { cookie: 'sh-session=session-2' },
    ]);
  });
});
