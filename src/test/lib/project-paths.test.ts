// Тесты резолвинга корня проекта и каталога данных.
// Заведены в Phase 32 Step 32.3 перед переносом `src/data/` → `data/` в корень
// монорепо: без совместимости с обеими раскладками `getProjectRoot()` начнёт
// бросать исключение на любой вызов, и ~90 тестовых файлов упадут на beforeEach.

import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { getProjectDataDirectory, getProjectRoot } from '@/lib/projectPaths';

/** Временный «корень проекта» с нужной раскладкой каталогов. */
async function createFakeRoot(layout: 'legacy' | 'monorepo' | 'both'): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), 'sporthub-root-'));
  await writeFile(path.join(root, 'package.json'), '{"name":"fake"}', 'utf-8');

  if (layout === 'legacy' || layout === 'both') {
    await mkdir(path.join(root, 'src', 'data'), { recursive: true });
  }
  if (layout === 'monorepo' || layout === 'both') {
    await mkdir(path.join(root, 'data'), { recursive: true });
  }

  return root;
}

describe('projectPaths — резолвинг корня и каталога данных', () => {
  let fakeRoot: string;
  const originalProjectRoot = process.env.SPORT_HUB_PROJECT_ROOT;

  beforeEach(() => {
    delete process.env.SPORT_HUB_PROJECT_ROOT;
  });

  afterEach(async () => {
    if (originalProjectRoot === undefined) {
      delete process.env.SPORT_HUB_PROJECT_ROOT;
    } else {
      process.env.SPORT_HUB_PROJECT_ROOT = originalProjectRoot;
    }
    if (fakeRoot) {
      await rm(fakeRoot, { force: true, recursive: true });
    }
  });

  it('старая раскладка: корень с src/data распознаётся, данные лежат в src/data', async () => {
    fakeRoot = await createFakeRoot('legacy');
    process.env.SPORT_HUB_PROJECT_ROOT = fakeRoot;

    expect(getProjectRoot()).toBe(fakeRoot);
    expect(getProjectDataDirectory()).toBe(path.join(fakeRoot, 'src', 'data'));
  });

  it('монорепо: корень с data/ распознаётся, данные лежат в data/', async () => {
    fakeRoot = await createFakeRoot('monorepo');
    process.env.SPORT_HUB_PROJECT_ROOT = fakeRoot;

    expect(getProjectRoot()).toBe(fakeRoot);
    expect(getProjectDataDirectory()).toBe(path.join(fakeRoot, 'data'));
  });

  it('обе раскладки сразу: приоритет у data/ в корне', async () => {
    fakeRoot = await createFakeRoot('both');
    process.env.SPORT_HUB_PROJECT_ROOT = fakeRoot;

    expect(getProjectDataDirectory()).toBe(path.join(fakeRoot, 'data'));
  });

  it('каталог без данных корнем не считается — резолвинг падает на следующего кандидата', async () => {
    fakeRoot = await mkdtemp(path.join(tmpdir(), 'sporthub-root-'));
    await writeFile(path.join(fakeRoot, 'package.json'), '{"name":"fake"}', 'utf-8');
    process.env.SPORT_HUB_PROJECT_ROOT = fakeRoot;

    // Ни src/data, ни data — подъём по дереву от временного каталога ничего не найдёт,
    // и getProjectRoot перейдёт к следующему кандидату (process.cwd()), то есть к
    // реальному корню репозитория. Молча вернуть подсунутый каталог она не имеет права.
    expect(getProjectRoot()).not.toBe(fakeRoot);
  });
});
