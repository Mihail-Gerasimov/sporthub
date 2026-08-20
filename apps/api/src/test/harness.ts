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

/** Имя коллекции. */
export type CollectionName = (typeof COLLECTIONS)[number];

export type TestHarness = {
  app: INestApplication;
  /**
   * На чём поднято приложение.
   *
   * Нужно ровно одному месту — там, где состояние, которое проверяет набор,
   * ОДНО ХРАНИЛИЩЕ ДОПУСКАЕТ, А ДРУГОЕ ЗАПРЕЩАЕТ. Такие места обязаны быть видны
   * в коде набора и объяснены рядом, а не спрятаны за молчаливым пропуском.
   */
  storage: 'files' | 'database';
  dataDirectory: string;
  /** Перезаписать коллекцию целиком — тем же форматом, что пишет хранилище. */
  write(name: string, data: unknown): Promise<void>;
  /**
   * Перезаписать сразу несколько коллекций.
   *
   * Нужно не для краткости: на базе каждая запись переносит срез целиком, потому что
   * таблицу нельзя записать в отрыве от тех, на которые она ссылается. Набор,
   * разложенный на десяток вызовов `write`, дал бы десяток переносов — и каждый
   * промежуточный обязан был бы быть целостным, чего у половины наборов нет.
   */
  writeMany(collections: Partial<Record<CollectionName, unknown>>): Promise<void>;
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
 * Две вещи здесь сделаны иначе, чем у файлов, и обе — вынужденно:
 *
 * 1. **Одну таблицу в отрыве от других не записать.** У базы есть внешние ключи, и
 *    запись на несуществующий слот она не примет. Поэтому правка идёт срезом целиком:
 *    таблицы чистятся и переносятся заново одним переносом.
 * 2. **Правка обязана менять ТОЛЬКО названные коллекции.** Файловая обвязка пишет один
 *    файл и остальных не касается, и наборы на это опираются: половина из них создаёт
 *    сущность запросом, а потом дописывает соседнюю коллекцию. Поэтому текущее состояние
 *    базы выгружается целиком, и правка накладывается НА НЕГО — иначе всё, что успело
 *    создать приложение, исчезало бы при первой же дозаписи.
 */
async function createDatabaseHarness(): Promise<TestHarness> {
  const db = await createTestDatabase();

  // Стартовый срез пуст: наборы засеивают себя сами. Чистка обязательна: схема
  // переживает прогон, и без неё набор начинался бы на остатках предыдущего —
  // причём молча, потому что остатки выглядят как обычные данные.
  await db.truncateAll();
  await importSourceData({ client: db.prisma, source: emptySource(), recalculate: false });

  const applyWrite = async (patch: Partial<Record<CollectionName, unknown>>): Promise<void> => {
    const current = await exportSourceShape(db.prisma);

    for (const [name, data] of Object.entries(patch)) {
      current[SOURCE_FIELD[name as CollectionName]] = data as never;
    }

    await db.truncateAll();
    // ⚠️ Пересчёт счётчиков выключен намеренно: обвязка обязана положить в базу ровно
    // тот срез, который объявил набор. Иначе «слот занят целиком» превратился бы
    // в «свободен», и одна и та же проверка на файлах и на базе проверяла бы разное.
    await importSourceData({ client: db.prisma, source: current, recalculate: false });
  };

  const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
  const app = configureApp(moduleRef.createNestApplication());
  await app.init();

  return {
    app,
    storage: 'database',
    // Каталога данных у этой обвязки нет: путь оставлен пустым намеренно, чтобы
    // обращение к нему было видно сразу, а не молча читало чужие файлы.
    dataDirectory: '',
    write(name, data) {
      return applyWrite({ [name as CollectionName]: data });
    },
    writeMany(collections) {
      return applyWrite(collections);
    },
    async read<T>(name: string): Promise<T> {
      const exported = await exportSourceShape(db.prisma);

      return exported[SOURCE_FIELD[name as CollectionName]] as T;
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
    storage: 'files',
    dataDirectory,
    write,
    async writeMany(collections) {
      for (const [name, data] of Object.entries(collections)) {
        await write(name, data);
      }
    },
    read,
    async close() {
      await app.close();
      delete process.env.SPORT_HUB_DATA_DIRECTORY;
      await rm(dataDirectory, { force: true, recursive: true });
    },
  };
}
