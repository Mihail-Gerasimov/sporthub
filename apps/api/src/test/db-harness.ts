// Обвязка тестов, работающих с базой.
//
// Два правила, оба выстраданы:
//
// 1. **Отдельная база, а не отдельная схема в рабочей.** Прогон разрушителен — он
//    чистит таблицы между кейсами. В соседнем проекте того же владельца общий адрес
//    базы для тестов и разработки однажды стёр живые данные. Здесь тесты ходят
//    только в `DATABASE_TEST_URL`, и попытка направить их в рабочую базу отбивается.
// 2. **Своя схема на каждый ФАЙЛ.** Vitest гоняет файлы в нескольких процессах;
//    если они чистят одни и те же таблицы, тесты начинают ронять друг друга —
//    и не постоянно, а через раз, что хуже стабильного падения.
//
//    ⚠️ Шаг 36.28. Прежде здесь было написано «на каждого исполнителя» — описание
//    поведения Vitest 3. В Vitest 4 `VITEST_WORKER_ID` — сквозной счётчик по спекам,
//    а не номер процесса, и схема выходит своя на ФАЙЛ (замерено: полный прогон
//    создаёт 48 схем по числу файлов, трогающих базу). Расхождение прожило переезд
//    версии незамеченным, и на нём был построен неверный диагноз мигающих тестов.
// 3. **Явный бюджет соединений.** См. `TEST_CONNECTION_BUDGET` ниже: пул задаётся
//    здесь, а не наследуется из `.env` разработчика, и обвязка не заводит своего
//    второго пула к той же базе.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { PrismaClient } from '../storage/prisma-client/client';
import { PrismaService, readDatabaseSettings } from '../storage/prisma.service';

const run = promisify(execFile);

const API_ROOT = path.join(__dirname, '..', '..');

/**
 * Бюджет соединений тестового прогона (шаг 36.28).
 *
 * Числа не подобраны, а посчитаны, и посчитаны в одном месте: пока бюджет жил
 * комментарием, он разъезжался с кодом молча. Сторож — `connection-budget.test.ts`.
 *
 * `maxConnections` — потолок базы из `docker-compose.yml`; `workers` — `maxWorkers`
 * из `vitest.config.ts`; `requiredHeadroom` — запас на всё, что ходит в ту же базу
 * помимо прогона: поднятый `npm run dev`, открытый psql, второй прогон.
 */
export const TEST_CONNECTION_BUDGET = {
  poolSize: 4,
  workers: 2,
  poolsPerFile: 1,
  /** Потолок ЛОКАЛЬНОГО стенда: `.env` → `POSTGRES_MAX_CONNECTIONS`. Боевой — 30. */
  maxConnections: 60,
  /**
   * Запас на всё, что ходит в ту же базу помимо прогона: контейнеры приложения
   * (около семи), локальный `npm run dev` (до десяти), ручные psql и инструменты.
   *
   * ⚠️ Число не с потолка. Замер 10.09.2026: при 22 занятых извне соединениях прогон
   * падал и после сужения пула до четырёх — потому что одного сужения мало,
   * контейнеры держат своё. Сужение пула и потолок базы считаются вместе.
   */
  requiredHeadroom: 30,
} as const;

/**
 * Размер пула в тестах.
 *
 * ⚠️ Задаётся ЗДЕСЬ, а не берётся из `apps/api/.env`. Там стоит боевое значение 10,
 * которое никто не выбирал для тестов: два исполнителя по два пула давали пик 24
 * при потолке 30, и прогон падал «случайным тестом», стоило кому-то занять
 * ещё несколько соединений.
 */
export function testPoolSize(): number {
  return TEST_CONNECTION_BUDGET.poolSize;
}

/**
 * Схема этого исполнителя. Номер даёт сам Vitest.
 *
 * Необязательный суффикс нужен, когда прогонов идёт несколько ОДНОВРЕМЕННО — например,
 * два человека или две задачи на одной машине. Номера исполнителей у них совпадут,
 * и они начнут чистить таблицы друг друга: тесты станут падать через раз, а причина
 * будет выглядеть как случайность.
 */
export function testSchemaName(): string {
  const worker = process.env.VITEST_WORKER_ID ?? '1';
  const suffix = process.env.SPORTHUB_TEST_SCHEMA_SUFFIX;

  return suffix ? `test_${suffix}_${worker}` : `test_${worker}`;
}

/**
 * Адрес тестовой базы со своей схемой.
 *
 * Отсутствие переменной — не повод молча пропустить проверки: пропущенный тест
 * выглядит как зелёный, и переезд на базу оказался бы «проверенным» вслепую.
 */
export function testDatabaseUrl(schema = testSchemaName()): string {
  const base = process.env.DATABASE_TEST_URL;

  if (!base) {
    throw new Error(
      'Не задан адрес тестовой базы (DATABASE_TEST_URL).\n' +
        'Подними базу и повтори: npm run db:up\n' +
        'Значение по умолчанию есть в apps/api/.env.example.',
    );
  }

  const url = new URL(base);

  if (!url.pathname.endsWith('_test')) {
    throw new Error(
      `Тесты отказываются работать с базой «${url.pathname.slice(1)}»: ` +
        'прогон чистит таблицы, и рабочие данные исчезли бы молча. ' +
        'Имя тестовой базы обязано оканчиваться на _test.',
    );
  }

  url.searchParams.set('schema', schema);

  return url.toString();
}

/** Схема исполнителя, приведённая к состоянию миграций. Вызывается один раз за прогон. */
export async function migrateTestSchema(): Promise<void> {
  try {
    await run('npx', ['prisma', 'migrate', 'deploy'], {
      cwd: API_ROOT,
      env: { ...process.env, DATABASE_URL: testDatabaseUrl() },
    });
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);

    throw new Error(
      `Не удалось накатить миграции на тестовую базу.\n${details}\n` +
        'Скорее всего база не поднята: npm run db:up',
    );
  }
}

export type TestDatabase = {
  prisma: PrismaClient;
  service: PrismaService;
  /** Очистка всех таблиц схемы. Порядок не важен: чистится одной командой. */
  truncateAll: () => Promise<void>;
  close: () => Promise<void>;
};

/** Клиент, привязанный к схеме этого исполнителя. */
export async function createTestDatabase(): Promise<TestDatabase> {
  const schema = testSchemaName();
  // Соединение собирает тот же класс, что и в бою: иначе тесты проверяли бы
  // не то подключение, которое работает на самом деле.
  const service = new PrismaService(
    readDatabaseSettings({
      DATABASE_URL: testDatabaseUrl(schema),
      DATABASE_POOL_SIZE: String(testPoolSize()),
    } as NodeJS.ProcessEnv),
  );
  const prisma = service.client;

  return {
    prisma,
    service,
    truncateAll: () => truncateSchema(prisma, schema),
    async close() {
      await service.onModuleDestroy();
    },
  };
}

/**
 * Очистка всех таблиц схемы ЛЮБЫМ клиентом (шаг 36.27).
 *
 * Вынесена из `createTestDatabase`, чтобы обвязка приложения могла чистить схему
 * клиентом самого приложения — и не заводить ради `TRUNCATE` второй пул к той же базе.
 * Второй пул стоил двух соединений на каждый файл прогона и был половиной причины,
 * по которой прогон упирался в `max_connections`.
 */
export async function truncateSchema(prisma: PrismaClient, schema: string): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = ${schema} AND tablename <> '_prisma_migrations'
  `;

  if (rows.length === 0) return;

  // Одной командой: TRUNCATE ... CASCADE снимает вопрос порядка внешних ключей,
  // RESTART IDENTITY возвращает счётчики, иначе номера поехали бы от теста к тесту.
  const list = rows.map((row) => `"${schema}"."${row.tablename}"`).join(', ');

  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
}
