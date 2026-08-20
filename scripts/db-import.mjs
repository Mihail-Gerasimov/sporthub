// Перенос данных из `data/*.json` в базу (шаги 33.16–33.19).
//
// Запуск из корня репозитория:
//   node scripts/db-import.mjs
//
// Скрипт идемпотентен: повторный запуск не удваивает данные и не падает.
// Вся вставка идёт одной транзакцией — база либо перенесена целиком, либо не тронута.
//
// Почему запускающий файл на JavaScript, а сама работа на TypeScript. Сгенерированный
// клиент базы — это TypeScript, и Node его не выполнит: в импортах стоят расширения
// `.js`, которых на диске нет. Поэтому файл-запускалка поднимает jiti — тот самый
// загрузчик, которым пользуется и сам Prisma для своих настроек.
//
// ⚠️ `interopDefault: false` здесь обязателен. С включённым приведением jiti отдаёт
// рантайму Prisma модуль `node:path` без поля `default`, и ЛЮБАЯ ошибка базы падает
// не своим сообщением, а «Cannot read properties of undefined (reading 'sep')» —
// то есть скрипт молчит именно тогда, когда сказать ему есть что.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJiti } from 'jiti';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_MODULE = path.join(REPOSITORY_ROOT, 'apps', 'api', 'src', 'storage', 'seed', 'cli.ts');

const jiti = createJiti(import.meta.url, { interopDefault: false });
const { runSeedCli } = await jiti.import(CLI_MODULE);

process.exitCode = await runSeedCli('import-from-files');
