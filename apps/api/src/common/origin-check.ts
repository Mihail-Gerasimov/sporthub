// Проверка источника запроса — вторая линия против подделки межсайтовых запросов.
//
// Первая линия — `SameSite=Lax` у cookie сессии: браузер не пришлёт её на POST
// с чужого сайта. Одного этого мало по двум причинам. `Lax` пропускает переходы
// по ссылке верхнего уровня, то есть изменяющий `GET` был бы уязвим (у нас таких
// нет, и это стережёт отдельный тест). А главное — защита, стоящая в одном месте,
// однажды отключается «на время отладки» и не возвращается.
//
// Здесь проверяется, что изменяющий запрос пришёл С НАШЕГО ЖЕ сайта. Проверка
// дешёвая: два заголовка, никакого состояния и никаких токенов в формах.
//
// Токены (CSRF-token) намеренно НЕ вводятся: они требуют хранить состояние,
// трогают каждую форму, а выигрыш при первопартийной cookie, одном домене
// и отсутствии поддоменов близок к нулю.

import type { NextFunction, Request, Response } from 'express';

/** Методы, меняющие состояние. Чтение проверять незачем. */
const UNSAFE_METHODS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Разрешённые источники.
 *
 * Пусто по умолчанию: в разработке и в тестах запросы приходят без заголовка
 * источника (curl, supertest), и такие пропускаются — заголовка нет, значит
 * это и не межсайтовый запрос браузера. Опасен именно ЧУЖОЙ источник, а не его
 * отсутствие.
 */
function allowedOrigins(): string[] {
  const raw = process.env.SPORT_HUB_ALLOWED_ORIGINS ?? '';

  return raw
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value !== '');
}

/**
 * Отклонить изменяющий запрос с чужого сайта.
 *
 * `Sec-Fetch-Site` — современный и точный признак: браузер сам сообщает, откуда
 * пришёл запрос, и подделать его со страницы нельзя. `Origin` — запасной вариант
 * для браузеров постарше.
 */
export function checkRequestOrigin(request: Request, response: Response, next: NextFunction): void {
  if (!UNSAFE_METHODS.has(request.method)) {
    next();

    return;
  }

  const site = request.headers['sec-fetch-site'];

  // `same-origin` и `none` (запрос набран в адресной строке) — свои.
  if (site === 'same-origin' || site === 'same-site' || site === 'none') {
    next();

    return;
  }

  if (typeof site === 'string' && site === 'cross-site') {
    response.status(403).json({ success: false, error: 'Запрос с чужого источника' });

    return;
  }

  const origin = request.headers.origin;

  // Заголовка нет вовсе — это не браузерный межсайтовый запрос: пропускаем.
  if (typeof origin !== 'string' || origin === '') {
    next();

    return;
  }

  const allowed = allowedOrigins();

  // Список не задан — значит развёртывание одиночное и проверять не с чем.
  // Заголовок при этом уже отфильтрован признаком `Sec-Fetch-Site` выше.
  if (allowed.length === 0 || allowed.includes(origin)) {
    next();

    return;
  }

  response.status(403).json({ success: false, error: 'Запрос с чужого источника' });
}
