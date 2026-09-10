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

  it('не проверяет годность cookie — это работа лейаутов и бэкенда', () => {
    // Сознательная граница: подпись значения здесь не проверяется и проверена
    // быть не может. Пропуск ≠ доступ, и тест это фиксирует, чтобы никто
    // не принял proxy за авторизацию.
    const response = proxy(
      requestFor('/profile/provider', { [SESSION_COOKIE_NAME_PLAIN]: ISSUED }),
    );

    expect(response.headers.get('location')).toBeNull();
  });
});
