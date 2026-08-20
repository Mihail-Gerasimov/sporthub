// Ожидание готовности базы перед прогоном тестов.
//
// Нужен именно отдельный шаг: `docker compose up -d` возвращает управление,
// когда контейнер запущен, а не когда база принимает запросы. Разница —
// несколько секунд, и всё это время тесты падают на «соединение отклонено»,
// что выглядит как поломка кода, а не как непрогретая база.

import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

const run = promisify(execFile);

const TIMEOUT_MS = 60_000;
const RETRY_DELAY_MS = 1_000;

/** Готовность проверяет сама база: `pg_isready` отвечает за приём запросов. */
async function isReady() {
  try {
    await run('docker', [
      'compose',
      'exec',
      '-T',
      'db',
      'pg_isready',
      '-U',
      'sporthub',
      '-d',
      'sporthub',
    ]);

    return true;
  } catch {
    return false;
  }
}

const startedAt = Date.now();

while (Date.now() - startedAt < TIMEOUT_MS) {
  if (await isReady()) {
    console.log('[db] база принимает запросы');
    process.exit(0);
  }

  await new Promise((resolve) => setTimeout(resolve, RETRY_DELAY_MS));
}

console.error(
  '[db] база не ответила за 60 секунд.\n' +
    'Проверь, что контейнер поднят: npm run db:up\n' +
    'Логи базы: npm run db:logs',
);
process.exit(1);
