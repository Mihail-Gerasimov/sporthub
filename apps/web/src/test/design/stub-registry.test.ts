// Сторож: заглушки помечены `STUB:` и записаны в реестр (шаг 38.13).
//
// ⚠️ Зачем. Правило проекта: «заглушки помечаем всегда `// STUB:` — чтобы потом легко
// найти и заменить». Пометка без реестра — та же потеря: искать по коду можно, но
// никто не ищет. Реестр — `tests/checklists/phase-38-stubs.md`: каждая заглушка
// в коде записана там, каждая запись там указывает на живую пометку.
//
// Две половины:
//   (а) в коде нет `TODO` / `FIXME` / `HACK` без `STUB:` — «доделать потом» без
//       пометки не найдёт никто; и у каждого файла с `STUB:` есть строка реестра;
//   (б) у каждой строки реестра есть предмет — файл существует и `STUB:` в нём есть.
//       Иначе заглушку заменили, а реестр обещает её до сих пор.
//
// ⚠️ Область — весь репозиторий, а не только фронт: три заглушки на день установки
// живут в `apps/web`, `apps/api` (схема и репозиторий) и `packages/types`. Тесты
// и сгенерированный `prisma-client` не в счёт.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Корень репозитория — на два уровня выше приложения. */
const REPO_ROOT = path.resolve(WEB_ROOT, '..', '..');

/** Реестр заглушек. */
export const REGISTRY_PATH = 'tests/checklists/phase-38-stubs.md';

/** Где искать код: каталоги от корня репозитория. */
const CODE_ROOTS = ['apps/web/src', 'apps/api/src', 'apps/api/prisma', 'packages'];

/** Что не код: тесты, сборка, зависимости, сгенерированный клиент базы. */
const SKIPPED =
  /(^|\/)(node_modules|dist|prisma-client|migrations|test|__tests__)(\/|$)|\.test\.[tj]sx?$/;

/** Пометка заглушки. */
const STUB = /\bSTUB:/;

/** Пометки «доделать потом» без `STUB:` — в начале комментария. */
const LOOSE_TODO = /(?:\/\/|\/\*+|^\s*\*|#)\s*(TODO|FIXME|HACK)\b/;

/** Путь в единой форме — со слэшами, от корня репозитория. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Обход кода репозитория. */
async function collectCode(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = normalize(path.relative(REPO_ROOT, full));

    if (SKIPPED.test(relative)) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectCode(full)));
      continue;
    }

    if (/\.(ts|tsx|mjs|prisma)$/.test(entry.name)) found.push(relative);
  }

  return found;
}

/** Строки текста с «доделать потом» без `STUB:` — половина (а). */
export function looseTodos(text: string): string[] {
  return text.split('\n').filter((line) => LOOSE_TODO.test(line) && !STUB.test(line));
}

/** Есть ли в тексте пометка заглушки. */
export function hasStub(text: string): boolean {
  return STUB.test(text);
}

/** Пути из таблицы реестра: первая ячейка строки — путь в обратных кавычках. */
export function registryFiles(markdown: string): string[] {
  return [...markdown.matchAll(/^\|\s*`([^`]+)`\s*\|/gm)].map((match) => match[1]);
}

describe('Сторож: реестр заглушек (38.13)', () => {
  it('(а) в коде нет TODO/FIXME/HACK без STUB:, и у каждого файла с STUB: есть запись', async () => {
    const registry = new Set(
      registryFiles(await readFile(path.join(REPO_ROOT, REGISTRY_PATH), 'utf8')),
    );
    const offenders: string[] = [];

    for (const root of CODE_ROOTS) {
      for (const file of await collectCode(path.join(REPO_ROOT, root))) {
        const text = await readFile(path.join(REPO_ROOT, file), 'utf8');
        const loose = looseTodos(text);

        if (loose.length > 0) offenders.push(`${file}: без STUB: — ${loose[0].trim()}`);
        if (hasStub(text) && !registry.has(file))
          offenders.push(`${file}: STUB: есть, записи в реестре нет`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('(б) у каждой записи реестра есть предмет: файл существует и STUB: в нём есть', async () => {
    const files = registryFiles(await readFile(path.join(REPO_ROOT, REGISTRY_PATH), 'utf8'));
    const stale: string[] = [];

    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const text = await readFile(path.join(REPO_ROOT, file), 'utf8').catch(() => null);

      if (text === null) stale.push(`${file}: файла нет — запись без предмета`);
      else if (!hasStub(text)) stale.push(`${file}: STUB: в файле нет — запись без предмета`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы всех трёх пакетов, а не пустоту', async () => {
    const files: string[] = [];

    for (const root of CODE_ROOTS) files.push(...(await collectCode(path.join(REPO_ROOT, root))));

    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain('apps/web/src/components/profile/athlete-achievements.ts');
    expect(files).toContain('apps/api/prisma/schema.prisma');
    expect(files).toContain('packages/types/src/types.ts');
    expect(files.some((file) => file.includes('prisma-client'))).toBe(false);
    expect(files.some((file) => /\.test\.tsx?$/.test(file))).toBe(false);
  });

  it('сторож видит нарушение на подставном тексте', () => {
    // Диверсия д-12: «доделать» без STUB:.
    expect(looseTodos('// TODO: доделать\nconst x = 1;')).toEqual(['// TODO: доделать']);
    expect(looseTodos('/* FIXME: потом */')).toEqual(['/* FIXME: потом */']);
    // С пометкой — законно.
    expect(looseTodos('// STUB: TODO после каталога')).toEqual([]);
    // Маска телефона «XXX» и слово в тексте — не пометка.
    expect(
      looseTodos("/** Маска телефона: +7 (XXX) XXX-XX-XX */\nconst todo = 'список дел';"),
    ).toEqual([]);
    // Реестр: путь читается из первой ячейки, заголовок таблицы — нет.
    expect(
      registryFiles(
        '| Файл | Предмет |\n| --- | --- |\n| `apps/web/src/a.ts` | что-то |\n| `packages/x.ts` | ещё |',
      ),
    ).toEqual(['apps/web/src/a.ts', 'packages/x.ts']);
    expect(hasStub('// STUB: заглушка')).toBe(true);
    expect(hasStub('// заглушки нет')).toBe(false);
  });
});
