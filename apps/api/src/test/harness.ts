// Общая обвязка контроллер-тестов.
//
// Каждый набор поднимает приложение целиком на своей временной директории данных:
// так тест проверяет тот же путь, что и рабочий сервер, а не подменённые слои.
// Пустые файлы создаются для всех коллекций сразу — иначе первый же запрос,
// который читает соседнюю коллекцию, падает на отсутствующем файле.

import { cp, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';

import { AppModule } from '../app.module';
import { configureApp } from '../configure-app';

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

export type HarnessOptions = {
  /**
   * Начать с копии рабочей директории данных вместо пустых файлов.
   * Нужен сверке контрактов: эталон снимался именно так, и справочники
   * (виды спорта и прочие) в нём — рабочие, а не пустые.
   */
  copyProjectData?: boolean;
};

/** Поднять приложение на своей директории данных. */
export async function createTestHarness(
  prefix: string,
  options: HarnessOptions = {},
): Promise<TestHarness> {
  const dataDirectory = await mkdtemp(path.join(tmpdir(), `sporthub-${prefix}-`));
  process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;

  const write = async (name: string, data: unknown): Promise<void> => {
    await writeFile(
      path.join(dataDirectory, `${name}.json`),
      `${JSON.stringify(data, null, 2)}\n`,
      'utf8',
    );
  };

  if (options.copyProjectData) {
    await cp(path.join(process.cwd(), '..', '..', 'data'), dataDirectory, { recursive: true });
  } else {
    for (const name of COLLECTIONS) {
      await write(name, []);
    }
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
