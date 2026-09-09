// Cookie сессии: единственное место, где записано её имя и настройки.
//
// Почему настройки собраны здесь, а не расставлены по маршрутам: у cookie четыре
// признака, и каждый из них по отдельности выглядит необязательным. Разъехавшись
// по трём местам, они разъедутся и по смыслу — где-то забудут `HttpOnly`, и это
// не сломает ни один тест, пока кто-нибудь не прочитает cookie из браузера.

import type { Request, Response } from 'express';

/**
 * Префикс `__Host-` — самая жёсткая привязка к хосту: браузер принимает такую cookie
 * только с `Secure`, только с `Path=/` и запрещает у неё `Domain`. То есть поддомен
 * не сможет её ни поставить, ни подменить.
 *
 * В разработке по http браузер такую cookie отвергнет вовсе, поэтому префикс и
 * `Secure` включаются вместе и только там, где есть TLS.
 */
const SECURE =
  process.env.SESSION_COOKIE_SECURE === undefined
    ? process.env.NODE_ENV === 'production'
    : process.env.SESSION_COOKIE_SECURE === '1';

export const SESSION_COOKIE_NAME = SECURE ? '__Host-sh-session' : 'sh-session';

/**
 * Настройки, общие для выдачи и очистки.
 *
 * `sameSite: 'lax'` — запрос с чужого сайта не принесёт cookie на изменяющий метод.
 * Одного этого мало (переходы по ссылке `Lax` пропускает), поэтому изменяющие методы
 * дополнительно сверяют источник запроса — см. проверку `Origin`.
 */
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: SECURE,
  sameSite: 'lax',
  path: '/',
} as const;

/** Положить идентификатор сессии в ответ. */
export function setSessionCookie(response: Response, token: string, expiresAt: Date): void {
  response.cookie(SESSION_COOKIE_NAME, token, { ...COOKIE_OPTIONS, expires: expiresAt });
}

/**
 * Убрать cookie.
 *
 * Значение затирается и срок ставится в прошлое: браузер удаляет её сам.
 * Настройки обязаны совпадать с выдачей — иначе браузер сочтёт это другой cookie
 * и оставит прежнюю живой.
 */
export function clearSessionCookie(response: Response): void {
  response.clearCookie(SESSION_COOKIE_NAME, COOKIE_OPTIONS);
}

/**
 * Достать идентификатор сессии из запроса.
 *
 * Заголовок разбирается вручную: подключать разбор cookie глобально ради одного
 * имени — лишняя зависимость на каждом запросе. Возвращает `null`, если cookie нет
 * или она пустая.
 */
export function readSessionCookie(request: Request): string | null {
  const header = request.headers.cookie;

  if (!header) return null;

  for (const part of header.split(';')) {
    const separator = part.indexOf('=');

    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();

    if (name !== SESSION_COOKIE_NAME) continue;

    const value = decodeURIComponent(part.slice(separator + 1).trim());

    return value === '' ? null : value;
  }

  return null;
}
