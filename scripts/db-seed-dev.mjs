// Сид для разработки (шаг 33.19a): справочники плюс минимальный работающий набор.
//
// Запуск из корня репозитория:
//   node scripts/db-seed-dev.mjs
//
// Нужен потому, что каталог `data/` в репозитории не лежит, а после шага 33.58
// его не станет и локально: без сида свежая база пуста, войти некем и ни одна
// страница не работает. Скрипт идемпотентен — повторный запуск ничего не удваивает.
//
// Про запускающий файл на JavaScript и `interopDefault: false` — см. `db-import.mjs`.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJiti } from 'jiti';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CLI_MODULE = path.join(REPOSITORY_ROOT, 'apps', 'api', 'src', 'storage', 'seed', 'cli.ts');

const jiti = createJiti(import.meta.url, { interopDefault: false });
const { runSeedCli } = await jiti.import(CLI_MODULE);

process.exitCode = await runSeedCli('dev');
