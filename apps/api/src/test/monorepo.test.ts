// Сторожа устройства монорепозитория.
//
// Эти правила не видны ни в одном обычном тесте: рабочее дерево уже собрано,
// и всё работает — до первой сборки на чистой машине. Порядок сборки как раз
// такой случай: приложения зависят от общих пакетов, и если сборка добирается
// до них первой, она падает на «не найден модуль @sporthub/types».

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './repo-root';

// Корень ищется по признаку, а не отсчётом уровней от места запуска.
const ROOT = REPO_ROOT;

async function readRootPackage(): Promise<{ workspaces: string[] }> {
  return JSON.parse(await readFile(path.join(ROOT, 'package.json'), 'utf8')) as {
    workspaces: string[];
  };
}

describe('Устройство монорепозитория', () => {
  it('общие пакеты собираются раньше приложений', async () => {
    const { workspaces } = await readRootPackage();

    // Корневая сборка идёт по рабочим областям в порядке этого списка.
    // Приложения импортируют общие пакеты, значит пакеты обязаны стоять выше.
    expect(workspaces.indexOf('packages/*')).toBeLessThan(workspaces.indexOf('apps/*'));
  });

  it('список рабочих областей описан группами, а не поимённо', async () => {
    const { workspaces } = await readRootPackage();

    // Иначе новый пакет придётся дописывать руками — и он молча не соберётся.
    expect(workspaces).toEqual(['packages/*', 'apps/*']);
  });
});
