// Где лежат данные.
//
// Переменная окружения имеет приоритет — на ней держится изоляция тестов:
// каждый прогон получает собственную копию каталога. Без неё поднимаемся
// по дереву от текущего файла и ищем каталог `data` рядом с `package.json`.

import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveDataDirectory(): string {
  const override = process.env.SPORT_HUB_DATA_DIRECTORY;

  if (override && override.trim() !== '') {
    return override;
  }

  // __dirname работает и в собранном виде, и под тестовым раннером.
  let current = __dirname;

  while (true) {
    const candidate = path.join(current, 'data');

    if (existsSync(path.join(current, 'package.json')) && existsSync(candidate)) {
      return candidate;
    }

    const parent = path.dirname(current);

    if (parent === current) {
      throw new Error('Не удалось найти каталог данных SportHub.');
    }

    current = parent;
  }
}
