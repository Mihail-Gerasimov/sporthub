// Сторож границы базы.
//
// Клиент базы — это деталь хранилища. Если он попадёт в сервис, контроллер или фронт,
// подменить хранилище правкой одного модуля станет нельзя, а обещание фазы держится
// ровно на этом. Нарушение не видно в обычных тестах: код работает, тесты зелёные,
// и обнаруживается всё только при попытке что-то заменить.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const API_ROOT = process.cwd();
const WEB_ROOT = path.join(API_ROOT, '..', 'web', 'src');

/** Слои, которым знать про клиент базы положено. */
const DATABASE_LAYER = ['src/storage/', 'src/repositories/prisma/'];

/** Признаки обращения к клиенту базы. */
const DATABASE_IMPORT = /from\s+'[^']*(@prisma\/client|prisma-client|@prisma\/adapter-pg)'/;

async function collectSources(directory: string, root: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      // Сгенерированный клиент — не наш исходник.
      if (entry.name === 'prisma-client' || entry.name === 'node_modules') continue;

      found.push(...(await collectSources(full, root)));

      continue;
    }

    if (/\.(ts|tsx)$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      found.push(path.relative(root, full));
    }
  }

  return found;
}

describe('Граница базы', () => {
  it('клиент базы известен только слою хранилища и репозиториям', async () => {
    const files = await collectSources(path.join(API_ROOT, 'src'), API_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.split(path.sep).join('/');

      if (DATABASE_LAYER.some((layer) => relative.startsWith(layer))) continue;

      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      if (DATABASE_IMPORT.test(text)) offenders.push(relative);
    }

    expect(offenders).toEqual([]);
  });

  it('во фронт клиент базы не попадает вовсе', async () => {
    const files = await collectSources(WEB_ROOT, WEB_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      if (DATABASE_IMPORT.test(text)) offenders.push(file.split(path.sep).join('/'));
    }

    expect(offenders).toEqual([]);
  });
});
