// Сторож границы хранилища.
//
// Обещание фазы 33 — подменить хранилище правкой одного файла `storage.module.ts`.
// Обещание держится ровно до тех пор, пока про конкретную реализацию знают только
// сам слой хранилища и репозитории. Сервис, внедряющий конкретный класс, ломает
// это молча: код работает, тесты зелёные, а подменить хранилище уже нельзя.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const API_ROOT = process.cwd();
const SOURCE_ROOT = path.join(API_ROOT, 'src');

/** Слои, которым знать про конкретное хранилище положено. */
const STORAGE_LAYER = ['src/storage/', 'src/repositories/', 'src/dictionaries/'];

async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));

      continue;
    }

    // Тесты живут по своим правилам: они вправе собирать хранилище руками.
    if (entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts')) {
      found.push(path.relative(API_ROOT, full));
    }
  }

  return found;
}

describe('Граница хранилища', () => {
  it('конкретное хранилище известно только своему слою', async () => {
    const files = await collectSources(SOURCE_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.split(path.sep).join('/');

      if (STORAGE_LAYER.some((layer) => relative.startsWith(layer))) continue;
      // Сам модуль связывания — то самое единственное место, где выбор реализации записан.
      if (relative === 'src/storage/storage.module.ts') continue;

      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      if (/from\s+'[^']*json-storage'/.test(text)) {
        offenders.push(relative);
      }
    }

    expect(offenders).toEqual([]);
  });
});
