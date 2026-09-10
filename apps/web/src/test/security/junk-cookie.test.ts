// Мусорная cookie: сколько работы она стоит серверу (шаг 36.24).
//
// ⚠️ ЗАЧЕМ ОТДЕЛЬНЫЙ НАБОР, ЕСЛИ ЕСТЬ `proxy.test.ts`. Тот проверяет РЕШЕНИЕ
// прокси — «увёл или пропустил». Обещание шага другое и им не проверяется:
// мусорная cookie не должна ДОХОДИТЬ до отрисовки. Ровно этот класс дефектов
// дал фазе 35 семь из одиннадцати находок: сделано на сервере, покрыто тестами,
// до страницы не дошло.
//
// Что было. Прокси пропускал ЛЮБУЮ строку: Next поднимал маршрут, лейаут звал
// «кто я» по сети, `SessionGuard` считал sha256 и делал SELECT по таблице сессий,
// отвечал 401 — и Next отдавал полный HTML-каркас (12–18 КБ в контейнерной
// сборке), в котором уже стоял увод. Гость без cookie получал 307 в один байт.
// То есть строка мусора стоила дороже, чем настоящий вход.
//
// Здесь конвейер собран как в бою: сначала прокси, и только если он пропустил —
// отрисовка лейаута. Утверждение «данных не запрашивали» имеет смысл лишь
// в такой сборке: сам по себе прокси за данными не ходит никогда, и проверять
// это у него было бы пустой формальностью.

import { randomBytes } from 'node:crypto';

import { SESSION_COOKIE_NAME_PLAIN, SESSION_TOKEN_BYTES } from '@sporthub/domain/session-cookie';
import { NextRequest, NextResponse } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { installApiStub, type ApiStub } from '@/test/helpers/api-stub';
import { createFixtureRoutes } from '@/test/helpers/fixture-routes';
import { config, proxy } from '@/proxy';

/** Значение cookie текущего посетителя. `null` — cookie нет вовсе. */
let cookieValue: string | null = null;

vi.mock('next/headers', () => ({
  cookies: async () => ({
    toString: () => (cookieValue === null ? '' : `${SESSION_COOKIE_NAME_PLAIN}=${cookieValue}`),
  }),
}));

vi.mock('next/navigation', async (importOriginal) => ({
  ...(await importOriginal<typeof import('next/navigation')>()),
  redirect: (url: string) => {
    // Бросок обязателен: настоящий `redirect` прерывает отрисовку именно так.
    // Без него лейаут после проверки спокойно пошёл бы за данными дальше.
    throw new Error(`NEXT_REDIRECT ${url}`);
  },
}));

/** Строка нашей формы, которую никто никогда не выдавал. */
const SHAPED_BUT_DEAD = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

/** Итог прохода по конвейеру: дошло ли дело до отрисовки и что спросили у бэкенда. */
type Visit = {
  /** Увёл ли прокси, не дав странице подняться. */
  turnedAwayByProxy: boolean;
  /** Дошло ли дело до отрисовки лейаута. */
  rendered: boolean;
  /** Адреса бэкенда, которые спросила страница. */
  calls: string[];
};

describe('Мусорная cookie не доходит до отрисовки', () => {
  let stub: ApiStub;

  beforeEach(() => {
    vi.resetModules();
    // Стенд отвечает «гость» на «кто я»: если страница всё-таки поднимется,
    // она честно сходит на бэкенд — и это обращение будет видно в списке.
    stub = installApiStub({ ...createFixtureRoutes(), '/auth/me': null });
  });

  afterEach(() => {
    stub.restore();
    cookieValue = null;
  });

  /**
   * Пройти путь запроса так, как он идёт в бою: сначала прокси, и лейаут —
   * только если прокси пропустил.
   */
  async function visit(pathname: string, cookie: string | null): Promise<Visit> {
    cookieValue = cookie;

    const request = new NextRequest(new URL(pathname, 'https://sporthub.local'));

    if (cookie !== null) request.cookies.set(SESSION_COOKIE_NAME_PLAIN, cookie);

    const decision = proxy(request);

    if (decision.headers.get('location') !== null) {
      return { turnedAwayByProxy: true, rendered: false, calls: stub.calls };
    }

    const { default: Layout } = await import('@/app/profile/me/layout');

    try {
      await (Layout as (props: unknown) => Promise<unknown>)({ children: null });
    } catch {
      // Увод из лейаута — тоже исход, и он нас здесь не интересует: важно,
      // что до него дело дошло, то есть страница уже поднялась.
    }

    return { turnedAwayByProxy: false, rendered: true, calls: stub.calls };
  }

  it('мусорная строка уводит прокси и данных не запрашивает вовсе', async () => {
    const visited = await visit('/profile/me', 'x');

    expect(visited.turnedAwayByProxy).toBe(true);
    expect(visited.rendered).toBe(false);
    // Ни одного обращения к бэкенду — включая «кто я». Именно оно стоило
    // расчёта sha256 и запроса к таблице сессий на каждую мусорную cookie.
    expect(visited.calls).toEqual([]);
  });

  it('гость без cookie ведёт себя ровно так же — ветка одна', async () => {
    // Не «похоже», а буквально та же ветка: мусор обязан идти путём гостя,
    // иначе исключения этой ветки (страница входа в панель) на него не действуют.
    const visited = await visit('/profile/me', null);

    expect(visited.turnedAwayByProxy).toBe(true);
    expect(visited.calls).toEqual([]);
  });

  it('строка НАШЕЙ формы доходит до страницы — годность проверяет бэкенд', async () => {
    // Обратная сторона: прокси не стал авторизацией. Никогда не выдававшийся
    // идентификатор правильной формы проходит, страница поднимается и спрашивает
    // «кто я» — и уже бэкенд отвечает отказом.
    const visited = await visit('/profile/me', SHAPED_BUT_DEAD);

    expect(visited.turnedAwayByProxy).toBe(false);
    expect(visited.rendered).toBe(true);
    expect(visited.calls).toContain('/auth/me');
  });

  it('прокси вообще запускается на этом адресе', async () => {
    // Без этого весь набор доказывал бы что-то про функцию, которую на пути
    // `/profile/me` никто не зовёт.
    expect(config.matcher.some((pattern) => pattern.startsWith('/profile'))).toBe(true);
    expect(proxy(new NextRequest(new URL('https://sporthub.local/profile/me')))).toBeInstanceOf(
      NextResponse,
    );
  });
});
