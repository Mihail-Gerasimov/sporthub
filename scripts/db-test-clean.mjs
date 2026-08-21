// Уборка схем, оставшихся от прогонов тестов.
//
// Зачем это нужно. Каждый прогон на базе создаёт схему на исполнителя, а имя
// схемы дополнительно разводится переменной `SPORTHUB_TEST_SCHEMA_SUFFIX` —
// чтобы два параллельных прогона не мешали друг другу. Схемы после себя никто
// не убирает намеренно: набор, упавший на середине, оставляет состояние, по
// которому потом разбираются. Плата за это — они копятся. Замер после суток
// работы: 359 схем и 722 МБ в тестовой базе.
//
// ⚠️ Скрипт работает ТОЛЬКО с базой из `DATABASE_TEST_URL` и ТОЛЬКО со схемами,
// имя которых начинается на `test_` или `probe_`. Рабочая база не тронута
// физически: её адрес сюда не попадает. Схема `public` не удаляется никогда.
//
// Запуск: npm run db:test:clean

import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const run = promisify(execFile);
const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Адрес тестовой базы: из окружения, иначе из `apps/api/.env`. */
function resolveTestUrl() {
  if (process.env.DATABASE_TEST_URL) return process.env.DATABASE_TEST_URL;

  try {
    const env = readFileSync(path.join(projectRoot, 'apps/api/.env'), 'utf8');
    const line = env.split('\n').find((row) => row.startsWith('DATABASE_TEST_URL='));

    if (line) return line.slice('DATABASE_TEST_URL='.length).trim();
  } catch {
    // Файла нет — сообщим ниже одним понятным текстом.
  }

  return undefined;
}

const testUrl = resolveTestUrl();

if (!testUrl) {
  console.error(
    'Не задан адрес тестовой базы (DATABASE_TEST_URL).\n' +
      'Значение по умолчанию есть в apps/api/.env.example.',
  );
  process.exit(1);
}

const databaseName = new URL(testUrl).pathname.replace(/^\//, '');

// Пояс безопасности: имя базы обязано выглядеть как тестовое. Иначе опечатка
// в переменной окружения превратила бы уборку в снос рабочих схем.
if (!databaseName.includes('test')) {
  console.error(
    `Отказ: база «${databaseName}» не выглядит тестовой.\n` +
      'Скрипт работает только с базой, в имени которой есть «test».',
  );
  process.exit(1);
}

/** Выполнить запрос в тестовой базе через контейнер. */
async function psql(sql) {
  const { stdout } = await run('docker', [
    'exec',
    'sporthub_postgres',
    'psql',
    '-U',
    'sporthub',
    '-d',
    databaseName,
    '-tAc',
    sql,
  ]);

  return stdout.trim();
}

const listSql = `
  SELECT schema_name
  FROM information_schema.schemata
  WHERE (schema_name LIKE 'test\\_%' OR schema_name LIKE 'probe\\_%')
    AND schema_name <> 'public'
  ORDER BY schema_name
`;

const before = await psql(`SELECT pg_size_pretty(pg_database_size('${databaseName}'))`);
const schemas = (await psql(listSql)).split('\n').filter(Boolean);

if (schemas.length === 0) {
  console.log(`Убирать нечего: тестовых схем нет, база «${databaseName}» занимает ${before}.`);
  process.exit(0);
}

// ⚠️ Команды подаются на ВХОД psql, а не через `-c`.
//
// Разница принципиальная: `-c "a; b; c"` выполняет всё ОДНОЙ транзакцией, а каждая
// схема несёт три десятка таблиц со своими индексами и ограничениями — удаление
// берёт блокировку на каждый объект. Уже два десятка схем упираются в
// `max_locks_per_transaction` и падают на `out of shared memory` (проверено).
// Поданные на вход команды идут по одной, каждая своей транзакцией, и лимит
// блокировок не накапливается. Одним запуском psql, а не сотней: сотня запусков
// заняла бы минуты.
await new Promise((resolve, reject) => {
  const child = spawn(
    'docker',
    [
      'exec',
      '-i',
      'sporthub_postgres',
      'psql',
      '-U',
      'sporthub',
      '-d',
      databaseName,
      '-q',
      '-v',
      'ON_ERROR_STOP=1',
    ],
    { stdio: ['pipe', 'inherit', 'inherit'] },
  );

  child.on('error', reject);
  child.on('close', (code) =>
    code === 0 ? resolve() : reject(new Error(`psql завершился с кодом ${code}`)),
  );

  // Каскадное удаление печатает по строке на каждую снесённую таблицу — это сотни
  // строк ни о чём. Итог всё равно выводится ниже одной строкой.
  const commands = ['SET client_min_messages = warning;'].concat(
    schemas.map((name) => `DROP SCHEMA "${name}" CASCADE;`),
  );

  child.stdin.end(commands.join('\n'));
});

const after = await psql(`SELECT pg_size_pretty(pg_database_size('${databaseName}'))`);

console.log(`Убрано схем: ${schemas.length}. База «${databaseName}»: ${before} → ${after}.`);
