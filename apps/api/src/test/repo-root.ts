/**
 * Корень монорепозитория — одно объявление на все текстовые сторожа.
 *
 * ⚠️ Считался как `process.cwd() + '/../..'` в трёх файлах сразу, и это работало
 * ровно при одном способе запуска — из каталога `apps/api`. Запуск теми же
 * тестами из корня репозитория уводил корень на два уровня выше самого
 * репозитория: сторож либо падал с `ENOENT`, либо — что хуже — сканировал
 * не тот каталог и оставался зелёным, ничего не проверив.
 *
 * Корень ищется по признаку, а не по числу уровней: вверх до `package.json`
 * с объявленными рабочими областями. Переезд каталога сторожа больше не задевает.
 */

import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';

function findRepoRoot(start: string): string {
  let current = start;

  for (;;) {
    const manifest = path.join(current, 'package.json');

    if (existsSync(manifest)) {
      const parsed = JSON.parse(readFileSync(manifest, 'utf8')) as { workspaces?: unknown };

      if (parsed.workspaces !== undefined) return current;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error(
        'Корень монорепозитория не найден: ни у одного родительского package.json нет workspaces',
      );
    }

    current = parent;
  }
}

export const REPO_ROOT = findRepoRoot(process.cwd());
