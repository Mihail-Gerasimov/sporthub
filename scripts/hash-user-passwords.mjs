// Разовое перехеширование паролей пользователей (Phase 33, шаг 33.9).
//
// До этого шага `data/users.json` хранил пароли открытым текстом в поле
// `password`. Скрипт заменяет его на `passwordHash` с argon2id-хешем — теми
// же параметрами, что использует рабочий код (`apps/api/src/common/password.ts`).
//
// Скрипт идемпотентен: повторный запуск не хеширует хеш повторно и ничего
// не портит. Это не украшение — миграцию данных запускают руками, и второй
// запуск «на всякий случай» неизбежен.
//
// Запуск из корня репозитория:
//   node scripts/hash-user-passwords.mjs
//   node scripts/hash-user-passwords.mjs --dry-run   (только отчёт, без записи)

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { Algorithm, hash } from '@node-rs/argon2';

// Параметры продублировать нельзя — но и импортировать TypeScript-модуль
// бэкенда из .mjs напрямую тоже. Поэтому значения читаются из его исходника:
// разойтись со скриптом они физически не смогут.
const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PASSWORD_MODULE = path.join(REPOSITORY_ROOT, 'apps', 'api', 'src', 'common', 'password.ts');
const USERS_FILE = path.join(REPOSITORY_ROOT, 'data', 'users.json');

/** Вытащить число из строки вида `memoryCost: 19456,`. */
function readNumericOption(source, name) {
  const match = new RegExp(`${name}:\\s*(\\d+)`).exec(source);

  if (!match) {
    throw new Error(`Не нашёл параметр ${name} в ${PASSWORD_MODULE}`);
  }

  return Number(match[1]);
}

/** Параметры хеширования — ровно те, что объявлены в модуле бэкенда. */
async function resolveHashOptions() {
  const source = await readFile(PASSWORD_MODULE, 'utf8');

  return {
    algorithm: Algorithm.Argon2id,
    memoryCost: readNumericOption(source, 'memoryCost'),
    timeCost: readNumericOption(source, 'timeCost'),
    parallelism: readNumericOption(source, 'parallelism'),
  };
}

/**
 * Пересобрать запись пользователя так, чтобы `passwordHash` встал на место
 * прежнего `password`. Порядок ключей сохраняется — файл под контролем версий,
 * и перетасовка полей превратила бы разницу в нечитаемую.
 */
function withHashInPlaceOfPassword(user, passwordHash) {
  const rebuilt = {};

  for (const [key, value] of Object.entries(user)) {
    if (key === 'password') {
      rebuilt.passwordHash = passwordHash;
      continue;
    }

    if (key === 'passwordHash') {
      rebuilt.passwordHash = passwordHash;
      continue;
    }

    rebuilt[key] = value;
  }

  // Записи без обоих полей вовсе: хеш добавляется в конец.
  if (!('passwordHash' in rebuilt)) {
    rebuilt.passwordHash = passwordHash;
  }

  return rebuilt;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const options = await resolveHashOptions();
  const users = JSON.parse(await readFile(USERS_FILE, 'utf8'));

  if (!Array.isArray(users)) {
    throw new Error(`Ожидался массив пользователей в ${USERS_FILE}`);
  }

  let hashed = 0;
  let skipped = 0;
  let cleaned = 0;
  const result = [];

  for (const user of users) {
    const existingHash = typeof user.passwordHash === 'string' ? user.passwordHash : '';
    const plain = typeof user.password === 'string' ? user.password : '';

    // Уже перехеширован — трогать нечего. Остаётся только убрать открытый
    // пароль, если он почему-то уцелел рядом с хешем.
    if (existingHash.startsWith('$argon2')) {
      if ('password' in user) {
        cleaned += 1;
      } else {
        skipped += 1;
      }

      result.push(withHashInPlaceOfPassword(user, existingHash));
      continue;
    }

    // Защита от повторного прогона на записи, где хеш почему-то лежит
    // в старом поле: хешировать хеш нельзя.
    if (plain.startsWith('$argon2')) {
      cleaned += 1;
      result.push(withHashInPlaceOfPassword(user, plain));
      continue;
    }

    if (!plain) {
      throw new Error(
        `Пользователь id=${user.id}: нет ни пароля, ни хеша — руками решать, что с ним делать`,
      );
    }

    result.push(withHashInPlaceOfPassword(user, await hash(plain, options)));
    hashed += 1;
  }

  console.log(
    `Пользователей: ${result.length}. Перехешировано: ${hashed}. ` +
      `Уже с хешем: ${skipped}. Поправлено (убран открытый пароль): ${cleaned}.`,
  );

  if (dryRun) {
    console.log('Сухой прогон: файл не тронут.');
    return;
  }

  // Тот же формат, что пишет хранилище: два пробела отступа и перевод строки
  // в конце. Иначе следующая запись из приложения дала бы ложную разницу.
  await writeFile(USERS_FILE, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  console.log(`Записано: ${USERS_FILE}`);
}

await main();
