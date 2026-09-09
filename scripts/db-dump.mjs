// Снимок базы перед разрушающей миграцией (шаг 35.3-0).
//
// Запуск из корня репозитория:
//   node scripts/db-dump.mjs [каталог]
//
// Зачем отдельной командой. Фаза 34 клала дамп руками, и это сработало ровно потому,
// что человек об этом вспомнил. Команда снимает вопрос «а сделал ли кто-то копию»:
// её видно в списке скриптов, её можно позвать из инструкции выкатки, и она сама
// печатает, что именно легло в файл.
//
// Дамп снимается ИЗ КОНТЕЙНЕРА базы, а не локальным `pg_dump`: версия клиента на машине
// разработчика может отставать от сервера, и тогда дамп либо не снимется, либо снимется
// в формате, который сервер не примет обратно.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

/** Имя контейнера базы. Оно же в `docker-compose.yml`. */
const CONTAINER = 'sporthub_postgres';
const DATABASE = 'sporthub';
const USER = 'sporthub';

/**
 * Таблицы, число строк в которых печатается после снятия дампа.
 *
 * Смысл не в полноте, а в проверяемости: если в дампе ноль пользователей, а в базе
 * их двадцать шесть, это видно сразу, а не через сутки при попытке восстановиться.
 */
const COUNTED_TABLES = ['users', 'clubs', 'trainers', 'bookings', 'reviews', 'sessions'];

function psql(query) {
  return execFileSync(
    'docker',
    ['exec', CONTAINER, 'psql', '-U', USER, '-d', DATABASE, '-t', '-A', '-c', query],
    { encoding: 'utf8' },
  ).trim();
}

function main() {
  const targetDirectory = process.argv[2] ?? path.join(process.cwd(), 'backups');
  fs.mkdirSync(targetDirectory, { recursive: true });

  // Метка времени берётся у базы, а не у машины: дамп датируется тем же временем,
  // что и данные внутри него.
  const stamp = psql("select to_char(now(), 'YYYY-MM-DD-HH24MI');");
  const file = path.join(targetDirectory, `sporthub-${stamp}.sql`);

  const dump = execFileSync('docker', ['exec', CONTAINER, 'pg_dump', '-U', USER, '-d', DATABASE], {
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });

  fs.writeFileSync(file, dump);

  const counts = COUNTED_TABLES.map(
    (table) => `${table}: ${psql(`select count(*) from ${table};`)}`,
  );

  console.log(
    [
      'СНИМОК БАЗЫ',
      `Файл: ${file}`,
      `Размер: ${(fs.statSync(file).size / 1024).toFixed(1)} КБ`,
      '',
      'Строк в живой базе на момент снимка:',
      ...counts.map((line) => `  ${line}`),
      '',
      'Восстановление:',
      `  docker exec -i ${CONTAINER} psql -U ${USER} -d ${DATABASE} < ${file}`,
    ].join('\n'),
  );

  // Пустой дамп — это не успех. Такое бывает, когда контейнер поднят, а база ещё
  // не создана: команда обязана сказать об этом кодом возврата, а не тишиной.
  if (dump.length < 1024) {
    console.error('\nДамп подозрительно мал — проверьте, что база не пуста.');

    return 1;
  }

  return 0;
}

process.exitCode = main();
