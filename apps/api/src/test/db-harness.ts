// Обвязка тестов, работающих с базой.
//
// Два правила, оба выстраданы:
//
// 1. **Отдельная база, а не отдельная схема в рабочей.** Прогон разрушителен — он
//    чистит таблицы между кейсами. В соседнем проекте того же владельца общий адрес
//    базы для тестов и разработки однажды стёр живые данные. Здесь тесты ходят
//    только в `DATABASE_TEST_URL`, и попытка направить их в рабочую базу отбивается.
// 2. **Своя схема на каждого исполнителя.** Vitest гоняет файлы в нескольких процессах;
//    если они чистят одни и те же таблицы, тесты начинают ронять друг друга —
//    и не постоянно, а через раз, что хуже стабильного падения.

import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

import type { PrismaClient } from '../storage/prisma-client/client';
import { PrismaService, readDatabaseSettings } from '../storage/prisma.service';

const run = promisify(execFile);

const API_ROOT = path.join(__dirname, '..', '..');

/** Схема этого исполнителя. Номер даёт сам Vitest. */
export function testSchemaName(): string {
  return `test_${process.env.VITEST_WORKER_ID ?? '1'}`;
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
      DATABASE_POOL_SIZE: '2',
    } as NodeJS.ProcessEnv),
  );
  const prisma = service.client;

  const tableNames = async (): Promise<string[]> => {
    const rows = await prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables
      WHERE schemaname = ${schema} AND tablename <> '_prisma_migrations'
    `;

    return rows.map((row) => row.tablename);
  };

  return {
    prisma,
    service,
    async truncateAll() {
      const tables = await tableNames();

      if (tables.length === 0) return;

      // Одной командой: TRUNCATE ... CASCADE снимает вопрос порядка внешних ключей,
      // RESTART IDENTITY возвращает счётчики, иначе номера поехали бы от теста к тесту.
      const list = tables.map((table) => `"${schema}"."${table}"`).join(', ');

      await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${list} RESTART IDENTITY CASCADE`);
    },
    async close() {
      await service.onModuleDestroy();
    },
  };
}
