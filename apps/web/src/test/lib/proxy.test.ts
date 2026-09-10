// Разворот гостя на входе в закрытые разделы (шаг 34.47).
//
// Проверяется две вещи и обе по отдельности: ГДЕ функция запускается (совпадение
// путей — через штатный помощник Next) и ЧТО она решает на запущенном пути.
// Разделение не формальность: правильное решение на пути, куда proxy не заходит,
// не работает вовсе, а запуск на статике стоит времени на каждом ресурсе.
//
// ⚠️ Помощник называется `unstable_doesMiddlewareMatch` даже в Next 16, где сам
// файл уже переименован в `proxy`: имя помощника за переименованием не пошло.
import { randomBytes } from 'node:crypto';

import {
  SESSION_COOKIE_NAME_HOST,
  SESSION_COOKIE_NAME_PLAIN,
  SESSION_TOKEN_BYTES,
  sessionCookieAttributes,
  sessionCookieName,
} from '@sporthub/domain/session-cookie';
import { unstable_doesMiddlewareMatch } from 'next/experimental/testing/server';
import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { config, proxy } from '@/proxy';

/** Запрос по адресу с необязательным набором cookie. */
function requestFor(pathname: string, cookies: Record<string, string> = {}): NextRequest {
  const request = new NextRequest(new URL(pathname, 'https://sporthub.local'));

  for (const [name, value] of Object.entries(cookies)) {
    request.cookies.set(name, value);
  }

  return request;
}

function matches(url: string): boolean {
  return unstable_doesMiddlewareMatch({ config, url });
}

/**
 * Значение, какое бэкенд и правда выдаёт: 32 случайных байта в `base64url`.
 * Число байт берётся из доменного объявления, а не переписывается сюда числом.
 */
const ISSUED = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

describe('proxy: где запускается', () => {
  it('совпадает с закрытыми разделами и их подстраницами', () => {
    expect(matches('/profile/athlete')).toBe(true);
    expect(matches('/profile/provider/publications')).toBe(true);
    expect(matches('/service-portal')).toBe(true);
    expect(matches('/service-portal/dashboard')).toBe(true);
  });

  it('не совпадает с открытой частью площадки', () => {
    expect(matches('/')).toBe(false);
    expect(matches('/clubs')).toBe(false);
    expect(matches('/trainers/ivan-petrov')).toBe(false);
    expect(matches('/booking/12')).toBe(false);
  });

  it('не совпадает со статикой, картинками и обращениями к данным', () => {
    // Иначе функция запускалась бы на каждом куске сборки и каждой картинке —
    // на страницу это десятки лишних запусков.
    expect(matches('/_next/static/chunks/main.js')).toBe(false);
    expect(matches('/_next/image?url=%2Flogo.png')).toBe(false);
    expect(matches('/favicon.ico')).toBe(false);
    expect(matches('/api/auth/me')).toBe(false);
  });
});

describe('proxy: что решает', () => {
  it('уводит гостя из кабинета на главную', () => {
    const response = proxy(requestFor('/profile/athlete'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/');
  });

  it('уводит гостя из сервисной панели на главную', () => {
    const response = proxy(requestFor('/service-portal/dashboard'));

    expect(response.status).toBe(307);
    expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/');
  });

  it('пускает гостя на саму страницу входа в панель', () => {
    // Иначе войти в панель было бы неоткуда: вход уводил бы сам себя на главную.
    expect(proxy(requestFor('/service-portal')).headers.get('location')).toBeNull();
    expect(proxy(requestFor('/service-portal/')).headers.get('location')).toBeNull();
  });

  it('пропускает запрос с cookie сессии', () => {
    expect(
      proxy(requestFor('/profile/athlete', { [SESSION_COOKIE_NAME_PLAIN]: ISSUED })).headers.get(
        'location',
      ),
    ).toBeNull();
  });

  it('знает и защищённое имя cookie, которым сессия ставится по HTTPS', () => {
    // В бою имя несёт префикс `__Host-`. Знай proxy только имя из разработки —
    // в бою он разворачивал бы всех вошедших, а прогон был бы зелёным.
    expect(
      proxy(requestFor('/profile/athlete', { [SESSION_COOKIE_NAME_HOST]: ISSUED })).headers.get(
        'location',
      ),
    ).toBeNull();
  });

  it('не проверяет ГОДНОСТЬ cookie — это работа лейаутов и бэкенда', () => {
    // Сознательная граница, и шаг 36.24 её НЕ сдвинул. Живая ли сессия, чья она
    // и не отозвана ли — здесь неизвестно и непроверяемо: в базе лежит sha256,
    // а сходить за ответом «кто я» отсюда нельзя. Строка нашей формы, никогда
    // никому не выдававшаяся, проходит — и это правильно.
    // Пропуск ≠ доступ; тест стоит здесь, чтобы никто не принял proxy за авторизацию.
    const neverIssued = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');
    const response = proxy(
      requestFor('/profile/provider', { [SESSION_COOKIE_NAME_PLAIN]: neverIssued }),
    );

    expect(response.headers.get('location')).toBeNull();
  });

  it('но отбивает заведомо не наш ФОРМАТ — веткой гостя, а не отказом', () => {
    // Шаг 36.24. Мусорная строка стоила полной отрисовки страницы: прокси её
    // пропускал, Next поднимал маршрут, лейаут шёл на бэкенд за «кто я»,
    // получал 401 и уводил — отдав перед этим 12–18 КБ каркаса.
    //
    // ⚠️ Реакция — увод, а не отказ. Если проверка однажды ошибётся, цена —
    // «всех разлогинило»: редирект лечится входом, 400 не лечится ничем.
    for (const junk of ['x', 'never-issued', 'session-7', 'привет', 'a'.repeat(200)]) {
      const response = proxy(requestFor('/profile/athlete', { [SESSION_COOKIE_NAME_PLAIN]: junk }));

      expect(response.status, `мусор «${junk}» прошёл прокси`).toBe(307);
      expect(new URL(response.headers.get('location') ?? '').pathname).toBe('/');
    }
  });

  it('мусорная cookie не запирает человека вне страницы входа в панель', () => {
    // ⚠️ Мусор обязан идти ТОЙ ЖЕ веткой гостя, включая исключение
    // `/service-portal`. Иначе испорченная cookie заперла бы человека снаружи,
    // и починить это из браузера он бы не смог: страница входа уводила бы сама себя.
    expect(
      proxy(requestFor('/service-portal', { [SESSION_COOKIE_NAME_PLAIN]: 'x' })).headers.get(
        'location',
      ),
    ).toBeNull();
    expect(
      proxy(
        requestFor('/service-portal/', { [SESSION_COOKIE_NAME_HOST]: 'never-issued' }),
      ).headers.get('location'),
    ).toBeNull();
  });

  it('форма проверяется ДИАПАЗОНОМ длины, а не точным числом', () => {
    // ⚠️ «Ровно столько, сколько сейчас» ломается не в ту сторону: смена числа
    // байт в выдаче заставила бы прокси отбрасывать НОВЫЕ сессии — все и сразу,
    // в момент выкатки, — тогда как старые продолжали бы работать.
    for (const bytes of [16, SESSION_TOKEN_BYTES, 64]) {
      const token = randomBytes(bytes).toString('base64url');

      expect(
        proxy(requestFor('/profile/athlete', { [SESSION_COOKIE_NAME_PLAIN]: token })).headers.get(
          'location',
        ),
        `идентификатор из ${bytes} байт отбит`,
      ).toBeNull();
    }
  });
});

describe('proxy: гашение мусорной cookie (шаг 36.25)', () => {
  /** Заголовки `Set-Cookie` ответа — так их видит браузер. */
  const setCookies = (response: ReturnType<typeof proxy>): string[] =>
    response.headers.getSetCookie();

  /** Заголовок гашения для указанного имени. */
  function clearingOf(response: ReturnType<typeof proxy>, name: string): string {
    const header = setCookies(response).find((value) => value.startsWith(`${name}=`));

    expect(
      header,
      `cookie «${name}» не гасится: ${setCookies(response).join(' | ')}`,
    ).toBeDefined();

    return header as string;
  }

  it('мусорная cookie гасится тем же набором признаков, каким её ставили', () => {
    // ⚠️ Иначе браузер сочтёт это ДРУГОЙ cookie и оставит прежнюю живой:
    // `Set-Cookie` уйдёт, ответ будет выглядеть правильным, а мусор останется
    // и продолжит стоить увода на каждой странице.
    const response = proxy(requestFor('/profile/me', { [SESSION_COOKIE_NAME_PLAIN]: 'x' }));
    const header = clearingOf(response, SESSION_COOKIE_NAME_PLAIN);
    const expected = sessionCookieAttributes(false);

    expect(header).toMatch(/Path=\//i);
    expect(header).toMatch(/HttpOnly/i);
    expect(header).toMatch(new RegExp(`SameSite=${expected.sameSite}`, 'i'));
    // Признак `Secure` на имени без префикса не ставится: по HTTP браузер такую
    // cookie игнорирует целиком, и гашение молча не сработало бы в разработке.
    expect(expected.secure).toBe(false);
    expect(header).not.toMatch(/Secure/i);
    // Значение затирается и срок уходит в прошлое — так cookie и удаляют.
    expect(header).toMatch(/Max-Age=0|Expires=Thu, 01 Jan 1970/i);
  });

  it('защищённое имя гасится с Secure и Path=/ — без них браузер отвергнет заголовок', () => {
    const response = proxy(
      requestFor('/profile/me', { [SESSION_COOKIE_NAME_HOST]: 'never-issued' }),
    );
    const header = clearingOf(response, SESSION_COOKIE_NAME_HOST);

    expect(sessionCookieAttributes(true).secure).toBe(true);
    expect(header).toMatch(/Secure/i);
    expect(header).toMatch(/Path=\//i);
  });

  it('мусор гасится и на странице входа в панель, куда мусорную cookie пускают', () => {
    // Исключение `/service-portal` сохраняется, но мусор оттуда тоже уходит:
    // иначе он остался бы жить и стоил бы увода на каждой другой странице.
    const response = proxy(requestFor('/service-portal', { [SESSION_COOKIE_NAME_PLAIN]: 'x' }));

    expect(response.headers.get('location')).toBeNull();
    expect(clearingOf(response, SESSION_COOKIE_NAME_PLAIN)).toMatch(/Max-Age=0|Expires=/i);
  });

  it('гостю без cookie гасить нечего — увод остаётся пустым', () => {
    // Ответ гостю — 307 в один байт, и он обязан таким остаться: лишний
    // `Set-Cookie` на каждом заходе гостя это та же самая лишняя работа.
    expect(setCookies(proxy(requestFor('/profile/me')))).toEqual([]);
  });

  it('годная по форме cookie не гасится — увольнять вошедших прокси не вправе', () => {
    const issued = randomBytes(SESSION_TOKEN_BYTES).toString('base64url');

    for (const secure of [true, false]) {
      const response = proxy(requestFor('/profile/me', { [sessionCookieName(secure)]: issued }));

      expect(setCookies(response)).toEqual([]);
    }
  });
});
