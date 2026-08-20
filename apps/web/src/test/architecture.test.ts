// Сторожа границы между фронтом и бэкендом.
//
// После переезда фронт обязан ходить за данными только по HTTP. Нарушения этой
// границы не видны в обычных тестах: страница, читающая файл напрямую, работает
// и выглядит правильно — до первого запуска на сервере, где файлов рядом нет.
// Поэтому границу стережёт отдельная проверка по исходникам.

import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const WEB_ROOT = process.cwd();

/** Обход дерева исходников. Тесты пропускаются: у них свои правила. */
async function collectFiles(
  directory: string,
  suffixes: string[],
  skipPrefix?: string,
): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full);

    if (skipPrefix && relative.startsWith(skipPrefix)) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectFiles(full, suffixes, skipPrefix)));
      continue;
    }

    if (suffixes.some((suffix) => entry.name.endsWith(suffix))) {
      found.push(relative);
    }
  }

  return found;
}

async function readProductionSources(): Promise<{ file: string; text: string }[]> {
  const files = await collectFiles(path.join(WEB_ROOT, 'src'), ['.ts', '.tsx'], 'src/test');

  return Promise.all(
    files.map(async (file) => ({ file, text: await readFile(path.join(WEB_ROOT, file), 'utf8') })),
  );
}

describe('Граница фронта и бэкенда', () => {
  it('фронт не обращается к слою данных напрямую', async () => {
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => /from '@\/lib\/db'/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('фронт не читает директорию данных', async () => {
    const sources = await readProductionSources();
    // Разрешено только определение пути: им пользуются тесты.
    const offenders = sources
      .filter(({ file }) => file !== 'src/lib/projectPaths.ts')
      .filter(({ text }) => /readFile\(|writeFile\(|getProjectDataDirectory\(/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('фронт не запускает автопереходы записей сам', async () => {
    // Переходы по времени выполняет бэкенд при чтении записей. Вызов со
    // стороны фронта означал бы второй источник правды о статусах.
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ file }) => file !== 'src/lib/server-api.ts')
      .filter(({ text }) => /runLazyBookingTransitions\s*\(/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('фронт не собирает момент времени из строк даты и времени', async () => {
    // `new Date(`${date}T${time}`)` даёт момент в поясе ТОГО, кто выполняет код:
    // на сервере — в поясе сервера, в браузере — в поясе зрителя. Расписание же
    // живёт по часам зала, и разница уезжает прямо в бизнес-правила: окна отмены,
    // окно отметки исхода, границы недели, координаты клетки тепловой карты.
    // Такие ошибки не видны на машине разработчика, если её пояс совпадает с
    // самарским, — поэтому запрет стережёт не тест поведения, а проверка исходников.
    // Единственный разрешённый способ — общий помощник из `@sporthub/domain`.
    const sources = await readProductionSources();
    const offenders = sources
      .filter(({ text }) => /new Date\(`[^`]*T[^`]*`\)/.test(text))
      .map(({ file }) => file);

    expect(offenders).toEqual([]);
  });

  it('у фронта не осталось собственных маршрутов', async () => {
    const apiDirectory = path.join(WEB_ROOT, 'src/app/api');
    const routes = await collectFiles(apiDirectory, ['route.ts']).catch(() => []);

    expect(routes).toEqual([]);
  });
});
