// Сторож хранилища.
//
// Проверяет две вещи, обе — про то, что легко сломать молча.
//
// 1. **Выбора реализации в коде нет.** Файловая реализация удалена в фазе 34, и это
//    решение заказчика, а не уборка: пока реализаций было две, каждая новая таблица
//    требовала бы вторую реализацию, заведомо идущую в мусор. Вернуть выбор можно
//    только сознательно — этот тест краснеет на любой попытке.
// 2. **Данные не появляются рядом с исходниками.** Это не гипотетика: файлы уже
//    однажды попадали в репозиторий.
//
// Границу «клиент базы известен только своему слою» стережёт отдельный тест —
// `database-boundary.test.ts`; дублировать её здесь нечем.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const API_ROOT = process.cwd();
const SOURCE_ROOT = path.join(API_ROOT, 'src');

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

describe('Выбор хранилища', () => {
  // Сторож против возврата второй реализации. Файловая удалена в фазе 34 (этап Э0a),
  // и это решение, а не уборка: пока реализаций было две, КАЖДАЯ новая таблица —
  // сессии, ссылки восстановления пароля — требовала бы вторую реализацию, заведомо
  // идущую в мусор. Вернуться к выбору хранилища можно только сознательно, а не
  // случайно: этот тест краснеет на любой попытке.
  const FORBIDDEN = [
    { pattern: /SPORT_HUB_STORAGE/, why: 'переключатель хранилища' },
    { pattern: /SPORT_HUB_DATA_DIRECTORY/, why: 'каталог файловых данных' },
    { pattern: /from\s+'[^']*json-storage'/, why: 'файловое хранилище' },
    { pattern: /\bJsonStorage\b/, why: 'файловое хранилище' },
    { pattern: /\bresolveStorageKind\b|\bStorageKind\b/, why: 'выбор реализации' },
  ];

  it('в коде не осталось выбора реализации хранилища', async () => {
    const files = await collectSources(SOURCE_ROOT);
    const offenders: string[] = [];

    for (const file of files) {
      const relative = file.split(path.sep).join('/');
      const text = await readFile(path.join(API_ROOT, file), 'utf8');

      for (const { pattern, why } of FORBIDDEN) {
        if (pattern.test(text)) offenders.push(`${relative} — ${why}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});

describe('Данные не появляются рядом с исходниками', () => {
  it('в корне пакета бэкенда нет файлов коллекций', async () => {
    const entries = await readdir(API_ROOT, { withFileTypes: true });
    // Свои файлы пакета — не данные: их состав известен и меняется редко.
    const own = new Set(['package.json', 'tsconfig.json', 'tsconfig.build.json', 'nest-cli.json']);

    const strays = entries
      .filter((entry) => entry.isFile() && entry.name.endsWith('.json') && !own.has(entry.name))
      .map((entry) => entry.name);

    expect(strays).toEqual([]);
  });
});
