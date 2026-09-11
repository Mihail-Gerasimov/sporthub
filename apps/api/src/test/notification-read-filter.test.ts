// Сторож: в ЧТЕНИИ уведомлений не осталось отбора по настройкам (шаг 36.50).
//
// ⚠️ Зачем сторож, а не просто удалённый код. Отбор при чтении выглядит безобидно
// и добавляется в одну строку: «а давайте здесь ещё и выключенные спрячем». Именно так
// он и расплодился — лента, счётчик и колокольчик решали каждый сам, и за две фазы
// разошлись трижды:
//
//   фаза 35 — «в колокольчике 3, в списке 0»;
//   фаза 35 — настройки лица сохранялись и не применялись;
//   фаза 36 — колокольчик применял личные настройки к строкам всех лиц.
//
// Решение теперь принимается один раз, при отправке. Сторож существует, чтобы вернуть
// его в чтение нельзя было молча: попытка краснит набор и называет файл.
//
// ⚠️ Сторож ТЕКСТОВЫЙ и это осознанно. Рантаймовый проверил бы, что отбора нет
// в тех местах, которые ему перечислили, — а опасность ровно в новом месте, которое
// перечислить забудут. Здесь же обходится весь исходник обоих приложений.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from './repo-root';

/** Каталоги исходников, которые обходим. Тесты не в счёт: они вправе поминать что угодно. */
const ROOTS = ['apps/api/src', 'apps/web/src', 'packages/domain/src'];

/**
 * Следы отбора по настройкам в чтении.
 *
 * `excludeTypes` — имя поля, которого больше нет в контракте выдачи.
 * `disabledTypes` — имя метода, который переводил настройки в этот список.
 */
const FORBIDDEN = ['excludeTypes', 'disabledTypes'];

/**
 * Где помянуть эти слова законно.
 *
 * Пусто и должно оставаться пустым: если появится исключение, у него обязана быть
 * причина, записанная здесь же. Исключение без причины — это возвращённый фильтр.
 */
const ALLOWED: readonly string[] = [];

/**
 * Текст файла без комментариев.
 *
 * ⚠️ Сторож, не умеющий отличить код от пояснения, заставляет писать ХУЖЕ
 * комментарии: объяснить, почему поля больше нет, стало бы нельзя — слово попало бы
 * под запрет. Поэтому комментарии снимаются, и запрет касается только кода.
 */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

async function sourceFiles(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      files.push(...(await sourceFiles(full)));
      continue;
    }

    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    // Тесты и каталог тестов не обходим: набор вправе называть то, чего не должно
    // быть в рабочем коде, — этим он и проверяет.
    if (/\.test\.(ts|tsx)$/.test(entry.name)) continue;
    if (full.includes(`${path.sep}test${path.sep}`)) continue;

    files.push(full);
  }

  return files;
}

describe('в чтении уведомлений не осталось отбора по настройкам', () => {
  it('ни один рабочий файл не переводит настройки в условие выдачи', async () => {
    const offenders: string[] = [];

    for (const root of ROOTS) {
      for (const file of await sourceFiles(path.join(REPO_ROOT, root))) {
        const relative = path.relative(REPO_ROOT, file);

        if (ALLOWED.includes(relative)) continue;

        const text = codeOnly(await readFile(file, 'utf8'));

        for (const word of FORBIDDEN) {
          if (text.includes(word)) {
            offenders.push(`${relative} — ${word}`);
          }
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    // ⚠️ Девять текстовых сторожей этого проекта однажды считали корень от каталога
    // запуска и вне своего каталога обходили НИЧЕГО, оставаясь зелёными. Корень
    // ищется по признаку (`repo-root.ts`), а эта проверка сторожит сам обход.
    for (const root of ROOTS) {
      const files = await sourceFiles(path.join(REPO_ROOT, root));

      expect(files.length).toBeGreaterThan(10);
    }
  });
});
