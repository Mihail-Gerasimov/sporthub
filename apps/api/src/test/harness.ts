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

/** Поднять приложение на своей директории данных. */
export async function createTestHarness(prefix: string): Promise<TestHarness> {
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
