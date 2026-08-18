// Чтение коллекции данных напрямую из файла.
//
// Раньше тесты, проверяющие сами данные (справочники, исходный набор
// пользователей), ходили за ними в слой доступа `lib/db`. Слоя больше нет —
// данными владеет бэкенд, — а проверять их содержимое по-прежнему нужно,
// поэтому тесты читают файл сами. Никакой бизнес-логики здесь нет и быть
// не должно: только чтение.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { getProjectDataDirectory } from '@/lib/projectPaths';

/** Директория данных: временная в тестах, проектная по умолчанию. */
function dataDirectory(): string {
  const override = process.env.SPORT_HUB_DATA_DIRECTORY;

  return override && override.trim() !== '' ? override : getProjectDataDirectory();
}

export async function readCollectionFile<T>(fileName: string): Promise<T[]> {
  const raw = await readFile(path.join(dataDirectory(), fileName), 'utf8');

  return JSON.parse(raw) as T[];
}
