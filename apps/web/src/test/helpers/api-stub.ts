// Подмена ОТВЕТОВ бэкенда для тестов страниц.
//
// Раньше на время прогона подменялся целый модуль `@/lib/server-api`: вместо клиента
// подставлялась файловая реализация на триста строк, которая повторяла отбор, приведение
// и сортировки бэкенда поверх чтения `data/`. Это был второй источник правды, и он
// расходился с первым молча: тест оставался зелёным, а страница на сервере вела себя
// иначе. Плюс фронт через него знал, где на диске лежат данные.
//
// Здесь подменяется не модуль, а транспорт. Страница ходит на бэкенд настоящим клиентом
// и настоящим `fetch`, а стенд отвечает заготовленными телами. Логики внутри нет вовсе —
// только таблица «адрес → тело ответа», поэтому расходиться нечему.
//
// Побочная польза: стенд ЗАПОМИНАЕТ адреса, которые страница спросила. На этом
// проверяется сужение выдачи — что страница просит свой срез, а не всё подряд.

import { vi } from 'vitest';

/**
 * Тело ответа для одного адреса.
 *
 * `null` означает «не найдено» — код 404. Именно так страница отличает
 * несуществующую публикацию от недоступного бэкенда.
 */
export type ApiRouteBody = unknown;

/**
 * Таблица ответов.
 *
 * Ключ — путь без префикса `/api`. Совпадение ищется сначала ТОЧНОЕ (вместе со строкой
 * запроса), потом по одному пути. Точный ключ закрепляет, каким именно запросом страница
 * забирает данные; ключ без запроса удобен там, где параметры для проверки неважны.
 */
export type ApiRoutes = Record<string, ApiRouteBody>;

export type ApiStub = {
  /** Адреса, которые страница спросила, в порядке обращения. */
  calls: string[];
  /** Первый адрес, начинающийся с указанного пути. Нужен для проверки строки запроса. */
  callTo(pathname: string): string | undefined;
  restore(): void;
};

/** Адрес запроса → путь с запросом без префикса `/api`. */
function toRoutePath(input: string): string {
  const url = new URL(input, 'http://stub.local');
  const marker = '/api';
  const pathname = url.pathname.startsWith(marker)
    ? url.pathname.slice(marker.length)
    : url.pathname;

  return `${pathname}${url.search}`;
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Поднять стенд ответов на время теста.
 *
 * Неизвестный адрес — не пустой ответ, а падение с его именем. Пустой ответ выглядел бы
 * как «данных нет»: страница отрисовалась бы, тест позеленел бы, а забытый запрос остался
 * бы незамеченным.
 */
export function installApiStub(routes: ApiRoutes): ApiStub {
  const calls: string[] = [];

  vi.stubGlobal('fetch', async (input: RequestInfo | URL) => {
    const requested = typeof input === 'string' ? input : input.toString();
    const routePath = toRoutePath(requested);
    calls.push(routePath);

    const pathnameOnly = routePath.split('?')[0];
    const key = routePath in routes ? routePath : pathnameOnly in routes ? pathnameOnly : null;

    if (key === null) {
      throw new Error(
        `Стенд ответов не знает адрес ${routePath}. Добавь его в таблицу теста.\n` +
          `Известные адреса: ${Object.keys(routes).join(', ')}`,
      );
    }

    const body = routes[key];

    if (body === null) {
      return jsonResponse(404, { success: false, error: 'Не найдено' });
    }

    return jsonResponse(200, { success: true, data: body });
  });

  return {
    calls,
    callTo: (pathname) => calls.find((call) => call.split('?')[0] === pathname),
    restore: () => vi.unstubAllGlobals(),
  };
}
