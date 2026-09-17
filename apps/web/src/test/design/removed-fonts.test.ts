// Сторож: на снятые шрифты никто не ссылается (шаг 38.16).
//
// ⚠️ Зачем. Фаза 38 сняла четыре шрифта — Bowlby One, Oswald, JetBrains Mono и Sofia Sans
// Extra Condensed (38.113: стек макета — Barlow Condensed, Inter 900 кириллицей, DM Mono
// цифрами; токен `--ui-font-mono` вернулся как DM Mono). Ссылка на снятый шрифт в коде
// не падает: браузер молча подставит
// системный, и никто не заметит, пока не сравнит с макетом. `next/font/google` с именем
// снятого шрифта ещё и скачает его — назад к трём шрифтам одним импортом.
//
// Проверяется КОД, не комментарии: пояснение «раньше было Bowlby» законно.
// Область — весь `src`, тесты включительно: тест, утверждающий старый шрифт, — тот же
// мёртвый код.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Снятые шрифты — как они пишутся в CSS и как импортируются из `next/font/google`. */
export const REMOVED_FONTS =
  /Bowlby One|Bowlby_One|Oswald|JetBrains Mono|JetBrains_Mono|Sofia Sans|Sofia_Sans|font-sofia/;

// Текст без комментариев: блочных и строчных (до конца строки).
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Ссылается ли код файла на снятый шрифт. */
export function referencesRemovedFont(text: string): boolean {
  return REMOVED_FONTS.test(stripComments(text));
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (/\.(ts|tsx|css)$/.test(entry.name)) found.push(normalize(path.relative(WEB_ROOT, full)));
  }

  return found;
}

describe('Сторож: снятые шрифты (38.16)', () => {
  it('ни один файл не ссылается на Bowlby One, Oswald, JetBrains Mono или Sofia Sans', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      // Сам сторож называет шрифты — ради регулярки.
      if (file === 'src/test/design/removed-fonts.test.ts') continue;
      if (referencesRemovedFont(await readFile(path.join(WEB_ROOT, file), 'utf8')))
        offenders.push(file);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain('src/app/layout.tsx');
    expect(files).toContain('src/app/globals.css');
  });

  it('сторож видит ссылку на снятый шрифт на подставном тексте', () => {
    expect(referencesRemovedFont("import { Bowlby_One } from 'next/font/google';")).toBe(true);
    expect(referencesRemovedFont("--ui-font-body: 'Oswald', system-ui;")).toBe(true);
    expect(
      referencesRemovedFont("import { Sofia_Sans_Extra_Condensed } from 'next/font/google';"),
    ).toBe(true);
    expect(referencesRemovedFont('font-family: var(--font-sofia);')).toBe(true);
    // Комментарий — не ссылка.
    expect(referencesRemovedFont('// раньше display был Bowlby One\nconst x = 1;')).toBe(false);
    // Шрифты макета — не нарушение; `--ui-font-mono` теперь токен DM Mono (38.113).
    expect(
      referencesRemovedFont("import { Barlow_Condensed, DM_Mono, Inter } from 'next/font/google';"),
    ).toBe(false);
    expect(referencesRemovedFont('font-family: var(--ui-font-mono);')).toBe(false);
  });
});
