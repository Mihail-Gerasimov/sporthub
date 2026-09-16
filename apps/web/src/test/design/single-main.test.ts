// Сторож: ориентир `<main>` один — у каркаса `AppShell` (a11y-проход 38.97, MED).
//
// ⚠️ Зачем. Страницы рисовали свой `<main>` внутри `<main>` каркаса: два ориентира
// «основное содержимое», вложенный `main` — нарушение HTML, диктор объявляет
// область дважды. Корень страницы — `div` (или фрагмент); отступы под док, потолок
// и поля — у каркаса и у контейнеров секций. Текстовый: любой `<main` в
// `src/app/**` и `src/components/**` вне `layout/AppShell.tsx` — красный.
// Комментарии снимаются до поиска: слово `<main>` в пояснении — не тег.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Единственное место ориентира `main`. */
const MAIN_OWNER = 'src/components/layout/AppShell.tsx';

/** Текст без комментариев: блочных и строчных (до конца строки). */
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Открывающие теги `<main` (и `role="main"`) в тексте — то, что даёт ориентир. */
export function mainTags(text: string): string[] {
  const body = stripComments(text);

  return [...body.matchAll(/<main\b|role=["']main["']/g)].map((m) => m[0]);
}

async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = path.relative(WEB_ROOT, full).split(path.sep).join('/');

    if (relative.startsWith('src/test')) continue;

    if (entry.isDirectory()) found.push(...(await collectSources(full)));
    else if (entry.name.endsWith('.tsx')) found.push(relative);
  }

  return found;
}

describe('Сторож: ориентир main один — у AppShell (38.63/38.97)', () => {
  it('ни одна страница и ни один компонент вне AppShell не рисует <main>', async () => {
    const files = [
      ...(await collectSources(path.join(WEB_ROOT, 'src/app'))),
      ...(await collectSources(path.join(WEB_ROOT, 'src/components'))),
    ];
    const offenders: string[] = [];

    for (const file of files) {
      if (file === MAIN_OWNER) continue;

      const found = mainTags(await readFile(path.join(WEB_ROOT, file), 'utf8'));

      if (found.length > 0) offenders.push(`${file}: ${found.join(', ')}`);
    }

    expect(offenders).toEqual([]);
  });

  it('обратная половина: у AppShell ровно один <main>, сторож видит страницы', async () => {
    const shell = await readFile(path.join(WEB_ROOT, MAIN_OWNER), 'utf8');
    expect(mainTags(shell)).toEqual(['<main']);

    const files = await collectSources(path.join(WEB_ROOT, 'src/app'));
    expect(files).toContain('src/app/page.tsx');
    expect(files).toContain('src/app/catalog/page.tsx');
    expect(files).toContain('src/app/coming-soon/page.tsx');

    // Подставной тег находится; упоминание в комментарии — нет.
    expect(mainTags('<main className="x">')).toEqual(['<main']);
    expect(mainTags('<div role="main">')).toEqual(['role="main"']);
    expect(mainTags('// `<main>` один, у каркаса\n<div />')).toEqual([]);
  });
});
