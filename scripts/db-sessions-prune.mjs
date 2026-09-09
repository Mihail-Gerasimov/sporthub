// Уборка просроченных сессий и ссылок восстановления пароля (шаги 34.13, 34.74).
//
// Запуск из корня репозитория:
//   node scripts/db-sessions-prune.mjs
//
// Отдельной командой, а не на запросе пользователя: см. пояснение в
// `apps/api/src/auth/prune-sessions.ts`.
//
// ⚠️ `interopDefault: false` обязателен по той же причине, что и в сиде: с включённым
// приведением любая ошибка базы падает чужим сообщением вместо своего.

import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { createJiti } from 'jiti';

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MODULE = path.join(REPOSITORY_ROOT, 'apps', 'api', 'src', 'auth', 'prune-sessions.ts');

const jiti = createJiti(import.meta.url, { interopDefault: false });
const { pruneSessions } = await jiti.import(MODULE);

process.exitCode = await pruneSessions();
