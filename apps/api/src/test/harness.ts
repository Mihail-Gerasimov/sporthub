// Общая обвязка контроллер-тестов.
//
// Каждый набор поднимает приложение целиком на своей временной директории данных:
// так тест проверяет тот же путь, что и рабочий сервер, а не подменённые слои.
// Пустые файлы создаются для всех коллекций сразу — иначе первый же запрос,
// который читает соседнюю коллекцию, падает на отсутствующем файле.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';

import { exportSourceShape } from '../storage/seed/export-source-shape';
import { importSourceData } from '../storage/seed/import-from-files';
import type { SourceData } from '../storage/seed/source-data';
import { createTestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

// Phase 33 Step 33.9: пароля открытым текстом в хранилище больше нет — тесты
// кладут в пользователей готовый argon2id-хеш. Пара «пароль + его хеш»
// объявлена здесь один раз: копия в каждом наборе разъехалась бы при первой же
// смене параметров хеширования.
/** Пароль тестовых пользователей — в открытом виде нужен только запросам. */
export const DEMO_PASSWORD = 'demo123';

/** Его argon2id-хеш теми же параметрами, что и в рабочем коде. */
export const DEMO_PASSWORD_HASH =
  '$argon2id$v=19$m=19456,t=2,p=1$S3YSJKRRJ61/o2IZha4RnQ$gKfspZaaqYNv4W41Lx/WoX8Q/fPn1WZKjQLIGbz3YDQ';

/** Все коллекции проекта. Отсутствие файла — ошибка чтения, поэтому создаются все. */
export const COLLECTIONS = [
  'clubs',
  'trainers',
  'offerings',
  'schedule',
  'bookings',
  'reviews',
  'users',
  'notifications',
  'logs',
  'trainer-club-links',
  'provider-client-notes',
  'sports',
  'cities',
  'tags',
  'amenities',
  'specialties',
  'work-formats',
] as const;

export type TestHarness = {
  app: INestApplication;
  dataDirectory: string;
  /** Перезаписать коллекцию целиком — тем же форматом, что пишет хранилище. */
  write(name: string, data: unknown): Promise<void>;
  /** Прочитать коллекцию с диска: проверка состояния после запроса. */
  read<T = unknown>(name: string): Promise<T>;
  close(): Promise<void>;
};

/** Имя коллекции → поле среза данных. Отличаются только те, где дефис или два слова. */
const SOURCE_FIELD: Record<(typeof COLLECTIONS)[number], keyof SourceData> = {
  clubs: 'clubs',
  trainers: 'trainers',
  offerings: 'offerings',
  schedule: 'schedule',
  bookings: 'bookings',
  reviews: 'reviews',
  users: 'users',
  notifications: 'notifications',
  logs: 'logs',
  'trainer-club-links': 'trainerClubLinks',
  'provider-client-notes': 'providerClientNotes',
  sports: 'sports',
  cities: 'cities',
  tags: 'tags',
  amenities: 'amenities',
  specialties: 'specialties',
  'work-formats': 'workFormats',
};

/** Пустой срез: с него начинается каждый набор. */
function emptySource(): SourceData {
  return Object.fromEntries(
    Object.values(SOURCE_FIELD).map((field) => [field, []]),
  ) as unknown as SourceData;
}

/**
 * Обвязка на БАЗЕ: тот же набор проверок, другое хранилище.
 *
 * `write` не пишет одну таблицу в отрыве от других — так нельзя: у базы есть внешние
 * ключи, и запись на несуществующий слот она не примет. Поэтому обвязка держит срез
 * целиком и переносит его заново после каждой правки. Для наборов в десяток строк это
 * дешевле, чем разбираться в порядке вставки на каждом вызове.
 */
async function createDatabaseHarness(): Promise<TestHarness> {
  const db = await createTestDatabase();
  const source = emptySource();

  const reimport = async (): Promise<void> => {
    await db.truncateAll();
    await importSourceData({ client: db.prisma, source });
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    // Каталога данных у этой обвязки нет: путь оставлен пустым намеренно, чтобы
    // обращение к нему было видно сразу, а не молча читало чужие файлы.
    dataDirectory: '',
    async write(name, data) {
      source[SOURCE_FIELD[name as (typeof COLLECTIONS)[number]]] = data as never;
      await reimport();
    },
    async read<T>(name: string): Promise<T> {
      const exported = await exportSourceShape(db.prisma);

      return exported[SOURCE_FIELD[name as (typeof COLLECTIONS)[number]]] as T;
    },
    async close() {
      await app.close();
      await db.close();
    },
  };
}

/**
 * Поднять приложение на своей директории данных.
 *
 * ⚠️ Хранилище выбирается переменной `SPORTHUB_TEST_ON_DATABASE`. По умолчанию это
 * файлы: пока файловая реализация жива как путь отката, её поведение обязано быть
 * проверено. Тот же набор на базе — тот же набор, и совпадение результатов и есть
 * доказательство, что переезд ничего не изменил.
 */
export async function createTestHarness(prefix: string): Promise<TestHarness> {
  if (process.env.SPORTHUB_TEST_ON_DATABASE === '1') {
    process.env.SPORT_HUB_STORAGE = 'database';
    await ensureTestSchema();

    return createDatabaseHarness();
  }

  const dataDirectory = await mkdtemp(path.join(tmpdir(), `sporthub-${prefix}-`));
  process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  // ⚠️ Обвязка поднимает приложение на ФАЙЛАХ. Это временно и снимается шагом 33.43:
  // до тех пор эти прогоны доказывают, что путь отката жив, а проверки на базе
  // живут отдельными файлами (`schema.test.ts`, `concurrency.test.ts`, контрактные
  // наборы репозиториев).
  process.env.SPORT_HUB_STORAGE = 'files';

  const write = async (name: string, data: unknown): Promise<void> => {
    await writeFile(
      path.join(dataDirectory, `${name}.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      'utf8',
    );
  };

  // Пустые коллекции: наборы данных тесты засеивают сами через пакет фикстур.
  // Копии рабочего каталога `data/` здесь больше нет — она держала тесты
  // на живых данных, которых после переезда на базу не станет.
  for (const name of COLLECTIONS) {
    await write(name, []);
  }

  const moduleRef = await Test.createTestingModule({
    imports: [AppModule],
  }).compile();
  // Та же настройка, что и у рабочего сервера, включая общий префикс адресов.
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  const read = async <T>(name: string): Promise<T> => {
    const { readFile } = await import('node:fs/promises');
    const raw = await readFile(path.join(dataDirectory, `${name}.json`), 'utf8');

    return JSON.parse(raw) as T;
  };

  return {
    app,
    dataDirectory,
    write,
    read,
    async close() {
      await app.close();
      delete process.env.SPORT_HUB_DATA_DIRECTORY;
      await rm(dataDirectory, { force: true, recursive: true });
    },
  };
}
