// Проверка единственного объявления имён cookie сессии и формы её идентификатора.
//
// Здесь проверяется не «функция вернула строку», а два обещания, на которые
// опираются оба приложения:
//
//   1. Имя cookie выбирается ТОЛЬКО признаком `Secure` — пакет чистый и про
//      окружение не знает. Прочитай он `process.env` сам — решение перестало бы
//      быть воспроизводимым, и его нельзя было бы проверить тестом.
//   2. Форма идентификатора задана ДИАПАЗОНОМ длины, а не точным числом.
//      Точное число ломается не в ту сторону: смена `SESSION_TOKEN_BYTES`
//      отбросила бы все НОВЫЕ сессии разом, в момент выкатки.

import { describe, expect, it } from 'vitest';

import {
  SESSION_COOKIE_NAMES,
  SESSION_COOKIE_NAME_HOST,
  SESSION_COOKIE_NAME_PLAIN,
  SESSION_TOKEN_BYTES,
  SESSION_TOKEN_PATTERN,
  isSessionTokenShaped,
  sessionCookieName,
} from './session-cookie';

/** Длина значения `base64url` без набивки для указанного числа байт. */
function base64UrlLengthOf(bytes: number): number {
  return Math.ceil((bytes * 4) / 3);
}

/** Строка нужной длины из указанного алфавита — модель чужого идентификатора. */
function stringOf(length: number, alphabet: string): string {
  return Array.from({ length }, (_, index) => alphabet[index % alphabet.length]).join('');
}

describe('Имена cookie сессии', () => {
  it('выбираются признаком Secure, а не окружением', () => {
    expect(sessionCookieName(true)).toBe(SESSION_COOKIE_NAME_HOST);
    expect(sessionCookieName(false)).toBe(SESSION_COOKIE_NAME_PLAIN);
  });

  it('защищённое имя несёт префикс __Host-, обычное — нет', () => {
    // Префикс не украшение: браузер принимает такую cookie только с `Secure`
    // и `Path=/` и запрещает у неё `Domain` — поддомен её не подменит.
    expect(SESSION_COOKIE_NAME_HOST.startsWith('__Host-')).toBe(true);
    expect(SESSION_COOKIE_NAME_PLAIN.startsWith('__Host-')).toBe(false);
  });

  it('список знает оба имени — проверять надо оба', () => {
    // Знай прокси только имя из разработки — в бою он разворачивал бы всех
    // вошедших, а прогон оставался бы зелёным.
    expect([...SESSION_COOKIE_NAMES].sort()).toEqual(
      [SESSION_COOKIE_NAME_PLAIN, SESSION_COOKIE_NAME_HOST].sort(),
    );
  });
});

describe('Форма идентификатора сессии', () => {
  const BASE64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  const CURRENT_LENGTH = base64UrlLengthOf(SESSION_TOKEN_BYTES);

  it('принимает значение текущей длины из алфавита base64url', () => {
    expect(isSessionTokenShaped(stringOf(CURRENT_LENGTH, BASE64URL))).toBe(true);
  });

  it('принимает и вдвое более короткое, и заметно более длинное значение', () => {
    // Диапазон, а не «ровно столько»: смена числа байт обязана проходить выкаткой,
    // а не разлогиниванием всех, кто войдёт после неё.
    expect(isSessionTokenShaped(stringOf(base64UrlLengthOf(16), BASE64URL))).toBe(true);
    expect(isSessionTokenShaped(stringOf(base64UrlLengthOf(64), BASE64URL))).toBe(true);
  });

  it('отбивает строки чужого алфавита ТОЙ ЖЕ длины', () => {
    // Одной длины мало, и одного алфавита мало: `never-issued` — валидный
    // base64url (дефис в алфавите есть), кусается только длина.
    expect(isSessionTokenShaped(stringOf(CURRENT_LENGTH, 'привет'))).toBe(false);
    expect(isSessionTokenShaped(stringOf(CURRENT_LENGTH, 'ab.+/='))).toBe(false);
    expect(isSessionTokenShaped(stringOf(CURRENT_LENGTH, ' '))).toBe(false);
  });

  it('отбивает мусор, которым мусорная cookie и бывает', () => {
    expect(isSessionTokenShaped('')).toBe(false);
    expect(isSessionTokenShaped('x')).toBe(false);
    expect(isSessionTokenShaped('never-issued')).toBe(false);
    expect(isSessionTokenShaped('session-7')).toBe(false);
  });

  it('отбивает слишком длинное значение — предел сверху задан', () => {
    // Без верхней границы cookie в мегабайт считалась бы «похожей на нашу»
    // и стоила бы полной отрисовки страницы.
    expect(isSessionTokenShaped(stringOf(base64UrlLengthOf(64) + 1, BASE64URL))).toBe(false);
  });

  it('шаблон привязан к концам строки — подстрока не проходит', () => {
    // Без `^` и `$` строка «мусор + годный кусок» считалась бы годной.
    expect(SESSION_TOKEN_PATTERN.source.startsWith('^')).toBe(true);
    expect(SESSION_TOKEN_PATTERN.source.endsWith('$')).toBe(true);
    expect(isSessionTokenShaped(`не наше ${stringOf(CURRENT_LENGTH, BASE64URL)}`)).toBe(false);
  });
});
