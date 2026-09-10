/**
 * Корень приложения `apps/web` — одно объявление на все текстовые сторожа фронта.
 *
 * ⚠️ Считался как `process.cwd()` в четырёх файлах сразу, и это верно ровно при
 * одном способе запуска — из каталога `apps/web`. Тот же тест, запущенный из корня
 * репозитория, искал исходники в несуществующем `<репозиторий>/src`: сторож либо
 * падал с `ENOENT`, либо — что хуже — обходил пустоту и оставался зелёным.
 *
 * Корень ищется по признаку: вверх до каталога с `next.config.ts`. Так сторож
 * перестаёт зависеть от того, откуда его позвали.
 */

import { existsSync } from 'node:fs';
import path from 'node:path';

function findWebRoot(start: string): string {
  let current = start;

  for (;;) {
    if (existsSync(path.join(current, 'next.config.ts'))) return current;

    const parent = path.dirname(current);

    if (parent === current) {
      // Запуск из корня репозитория: спускаемся в приложение по известному пути.
      const fallback = path.join(start, 'apps', 'web');

      if (existsSync(path.join(fallback, 'next.config.ts'))) return fallback;

      throw new Error('Корень apps/web не найден: рядом нет next.config.ts');
    }

    current = parent;
  }
}

export const WEB_ROOT = findWebRoot(process.cwd());
