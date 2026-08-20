// Сторож параметров хеширования (Phase 33, шаг 33.9).
//
// Параметры argon2id проверяются не по константе в коде, а разбором готовой
// строки хеша: именно её увидит база и именно по ней потом будет считаться
// сверка. Опечатка в опциях, тихий откат к дефолтам библиотеки (64 МБ, другой
// алгоритм) или подмена argon2id на argon2i красят этот набор.

import { describe, expect, it } from 'vitest';

import {
  PASSWORD_HASH_OPTIONS,
  PASSWORD_HASH_PREFIX,
  hashPassword,
  verifyPassword,
} from './password';

/**
 * Разобрать заголовок строки хеша вида
 * `$argon2id$v=19$m=19456,t=2,p=1$<соль>$<хеш>`.
 */
function parseHashHeader(value: string) {
  const parts = value.split('$');
  const parameters = Object.fromEntries(
    (parts[3] ?? '').split(',').map((pair) => {
      const [name, raw] = pair.split('=');

      return [name, Number(raw)];
    }),
  ) as { m: number; t: number; p: number };

  return {
    algorithm: parts[1],
    version: Number((parts[2] ?? '').replace('v=', '')),
    memoryCost: parameters.m,
    timeCost: parameters.t,
    parallelism: parameters.p,
    salt: parts[4] ?? '',
  };
}

describe('Хеширование паролей', () => {
  it('новый хеш считается ровно выбранными параметрами', async () => {
    const header = parseHashHeader(await hashPassword('какой-то-пароль'));

    expect(header.algorithm).toBe('argon2id');
    expect(header.version).toBe(19);
    expect(header.memoryCost).toBe(PASSWORD_HASH_OPTIONS.memoryCost);
    expect(header.memoryCost).toBe(19456);
    expect(header.timeCost).toBe(PASSWORD_HASH_OPTIONS.timeCost);
    expect(header.timeCost).toBe(2);
    expect(header.parallelism).toBe(PASSWORD_HASH_OPTIONS.parallelism);
    expect(header.parallelism).toBe(1);
  });

  it('строка хеша начинается меткой алгоритма', async () => {
    const hash = await hashPassword('какой-то-пароль');

    expect(hash.startsWith(PASSWORD_HASH_PREFIX)).toBe(true);
  });

  it('соль у каждого хеша своя — одинаковые пароли дают разные строки', async () => {
    const first = await hashPassword('одинаковый');
    const second = await hashPassword('одинаковый');

    expect(first).not.toBe(second);
    expect(parseHashHeader(first).salt).not.toBe(parseHashHeader(second).salt);
  });

  it('сверка принимает верный пароль и отбивает неверный', async () => {
    const hash = await hashPassword('верный-пароль');

    expect(await verifyPassword(hash, 'верный-пароль')).toBe(true);
    expect(await verifyPassword(hash, 'неверный-пароль')).toBe(false);
  });

  it('хеш со старыми параметрами продолжает проверяться', async () => {
    // Смена настроек в будущем не должна обесценить уже записанные хеши:
    // память и проходы библиотека берёт из самой строки, а не из наших опций.
    const legacy =
      '$argon2id$v=19$m=8192,t=3,p=1$vdW10McNTzAjoaDjGxypbQ$zWApwXspF2uiB2NzCT4SF6unAvJQeKF5pRWPJV93LUY';

    expect(await verifyPassword(legacy, 'старый-пароль')).toBe(true);
    expect(await verifyPassword(legacy, 'не-он')).toBe(false);
  });

  it('сверка не бросает на пустом или испорченном хеше', async () => {
    expect(await verifyPassword('', 'что угодно')).toBe(false);
    expect(await verifyPassword('не-хеш-вовсе', 'что угодно')).toBe(false);
    expect(await verifyPassword('$argon2id$сломано', 'что угодно')).toBe(false);
  });
});
