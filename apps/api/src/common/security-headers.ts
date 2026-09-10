// Заголовки безопасности на ответах API.
//
// ⚠️ Найдено браузерным прогоном чек-листа безопасности 10.09.2026. Фаза 34
// поставила заголовки во фронте (`next.config.ts`), и на страницах они есть.
// Но `/api/*` уходит в `rewrites()` — Next проксирует запрос на бэкенд, и его
// правило `headers()` до переписанного адреса не достаёт. Ответы API шли голыми:
// ни запрета угадывать тип содержимого, ни запрета показывать в рамке.
//
// Отсюда и место починки: заголовки ставит ТОТ, КТО ОТВЕЧАЕТ. Правило во фронте
// выглядело бы работающим и молча ничего не делало — ровно тот вид ложной защиты,
// который фаза 35 ловила весь день.
//
// ⚠️ Набор УЖЕ: у JSON-ответа нет ни разметки, ни стилей, ни шрифтов, поэтому
// политика содержимого страницы здесь была бы декорацией. Оставлено то, что
// осмысленно для ответа с данными.

import type { NextFunction, Request, Response } from 'express';

/**
 * Заголовки ответа API — одно объявление.
 *
 * `nosniff` — главный: без него браузер вправе угадать тип по содержимому,
 * и JSON, начинающийся не с той строки, может быть исполнен как сценарий.
 *
 * `X-Frame-Options` и `frame-ancestors` — ответ API нечего показывать в рамке
 * ни при каких условиях.
 *
 * `Referrer-Policy` — адрес запроса к API несёт номера сущностей; отдавать его
 * стороннему сайту незачем.
 */
export const API_SECURITY_HEADERS: Readonly<Record<string, string>> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
};

/** Поставить заголовки на каждый ответ API. */
export function applySecurityHeaders(_request: Request, response: Response, next: NextFunction) {
  for (const [name, value] of Object.entries(API_SECURITY_HEADERS)) {
    response.setHeader(name, value);
  }

  next();
}
