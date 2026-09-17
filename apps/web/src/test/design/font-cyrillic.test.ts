// Сторож: у каждого шрифта стека кириллица либо своя, либо закрыта названным соседом
// (шаг 38.17; 38.113 — стек макета).
//
// ⚠️ Зачем. Три фазы display-шрифтом был Bowlby One — у него кириллицы нет вовсе,
// и русские заголовки молча рисовались Impact'ом. Сборка проходит, тест классов
// зелёный, а H1 на странице — другим шрифтом. Никакой тест классов этого не поймает:
// подстановка происходит в браузере по глифу.
//
// С 38.113 шрифт без кириллицы в стеке есть НАМЕРЕННО — Barlow Condensed макета, и
// кириллицу за него берёт следующий в стеке: локальный Inter 900 с `unicode-range`
// кириллицы. Правило стало точнее: шрифт Google без кириллицы в каталоге допустим,
// только если в КАЖДОМ стеке `--ui-font-*`, где он стоит, за ним идёт шрифт с кириллицей
// (Google с `cyrillic` в `subsets` или локальное лицо с `unicode-range` кириллицы),
// и у него самого выключен подставной fallback: иначе Next вставит за ним Arial
// (`Barlow Condensed Fallback`, `src: local(Arial)`) — с кириллицей и БЕЗ `unicode-range`,
// и он перехватит русский текст раньше Inter. Шрифт с кириллицей в каталоге обязан
// её запросить — `subsets` без `cyrillic` тоже молчаливая подмена.
//
// Исключение одно и названо: `--ui-font-mono` — DM Mono кириллицы не несёт, и макет
// (`'DM Mono', monospace`) отдаёт её системной моноширинной; такой стек обязан
// заканчиваться `monospace`, чтобы кириллица не упала в serif по умолчанию.
//
// Проверяется по двум источникам сразу: по вызову в коде и по `font-data.json` самого
// Next — есть ли у шрифта кириллица вообще. Разбор — общий (`./fonts.ts`).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';
import {
  coversCyrillic,
  declarationOf,
  googleFontCalls,
  loadFontData,
  localFontCalls,
  stackVariables,
  type FontData,
} from './fonts';

/** Стеки, где кириллица сознательно системная моноширинная (см. шапку). */
export const SYSTEM_CYRILLIC_STACKS = ['mono'];

/** Имена всех стеков `--ui-font-<name>` в globals.css. */
export function stackNames(css: string): string[] {
  return [...css.matchAll(/--ui-font-([\w-]+)\s*:/g)].map((m) => m[1]);
}

/** Переменные шрифтов, у которых кириллица есть: Google с запрошенным `cyrillic` и локальные лица с её `unicode-range`. */
export function cyrillicProviders(layout: string, fontData: FontData): Set<string> {
  const providers = new Set<string>();

  for (const call of googleFontCalls(layout)) {
    if (
      call.variable &&
      fontData[call.name]?.subsets.includes('cyrillic') &&
      call.subsets.includes('cyrillic')
    )
      providers.add(call.variable);
  }
  for (const call of localFontCalls(layout)) {
    const variable = call.match(/variable\s*:\s*['"](--font-[\w-]+)['"]/)?.[1];

    if (variable && coversCyrillic(declarationOf(call, 'unicode-range'))) providers.add(variable);
  }

  return providers;
}

/** Нарушения: кириллица шрифта не своя и не закрыта соседом по стеку. */
export function cyrillicOffenders(layout: string, css: string, fontData: FontData): string[] {
  const offenders: string[] = [];
  const providers = cyrillicProviders(layout, fontData);

  for (const { name, subsets, variable, options } of googleFontCalls(layout)) {
    const known = fontData[name];

    if (!known) {
      offenders.push(`${name}: нет в каталоге Next`);
      continue;
    }

    if (known.subsets.includes('cyrillic')) {
      if (!subsets.includes('cyrillic'))
        offenders.push(`${name}: subsets без cyrillic (${subsets.join(', ') || 'пусто'})`);
      continue;
    }

    // Кириллицы нет в каталоге — закрыть её обязан сосед по стеку, а не подставной Arial.
    if (!/adjustFontFallback\s*:\s*false/.test(options) || !/fallback\s*:\s*\[\s*\]/.test(options))
      offenders.push(
        `${name}: без adjustFontFallback: false и fallback: [] подставной Arial перехватит кириллицу`,
      );

    const stacks = stackNames(css).filter(
      (stack) => variable && stackVariables(css, stack).includes(variable),
    );

    if (stacks.length === 0) offenders.push(`${name}: не стоит ни в одном стеке --ui-font-*`);

    for (const stack of stacks) {
      const entries = stackVariables(css, stack);
      const value = css.match(new RegExp(`--ui-font-${stack}\\s*:\\s*([^;]+);`))?.[1] ?? '';

      if (SYSTEM_CYRILLIC_STACKS.includes(stack)) {
        if (!/monospace\s*$/.test(value))
          offenders.push(
            `${name}: стек --ui-font-${stack} не заканчивается monospace — кириллица упадёт в serif`,
          );
        continue;
      }
      const after = entries.slice(entries.indexOf(variable!) + 1);

      if (!after.some((entry) => providers.has(entry)))
        offenders.push(`${name}: в --ui-font-${stack} за ним нет шрифта с кириллицей`);
    }
  }

  return offenders;
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
    const relative = path.relative(WEB_ROOT, full);

    if (relative.startsWith(path.join('src', 'test'))) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (/\.tsx?$/.test(entry.name)) found.push(normalize(relative));
  }

  return found;
}

const LAYOUT = 'src/app/layout.tsx';

describe('Сторож: кириллица у каждого шрифта стека (38.17, 38.113)', () => {
  it('шрифты Google подключаются только в layout.tsx', async () => {
    const elsewhere: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      if (file === LAYOUT) continue;
      if (googleFontCalls(await readFile(path.join(WEB_ROOT, file), 'utf8')).length > 0)
        elsewhere.push(file);
    }

    expect(elsewhere).toEqual([]);
  });

  it('у каждого шрифта кириллица своя или закрыта соседом по стеку; mono — системная', async () => {
    const layout = await readFile(path.join(WEB_ROOT, LAYOUT), 'utf8');
    const css = await readFile(path.join(WEB_ROOT, 'src', 'app', 'globals.css'), 'utf8');
    const offenders = cyrillicOffenders(layout, css, loadFontData());

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож читает настоящий layout и настоящий каталог, а не пустоту', async () => {
    const fontData = loadFontData();
    const layout = await readFile(path.join(WEB_ROOT, LAYOUT), 'utf8');
    const calls = googleFontCalls(layout);

    expect(Object.keys(fontData).length).toBeGreaterThan(1000);
    expect(calls.map((c) => c.name)).toEqual(['Barlow Condensed', 'DM Mono', 'Inter']);
    // Каталог знает, что у Barlow Condensed кириллицы нет — иначе диверсия д-35 не покраснела бы,
    // а локальное лицо кириллицы — единственный её поставщик в display-стеке.
    expect(fontData['Barlow Condensed'].subsets).not.toContain('cyrillic');
    expect(cyrillicProviders(layout, fontData)).toEqual(
      new Set(['--font-inter', '--font-inter-cyr']),
    );
  });

  it('сторож видит нарушение на подставном тексте', () => {
    const fontData = loadFontData();
    const barlow =
      "import { Barlow_Condensed } from 'next/font/google';\nconst b = Barlow_Condensed({ subsets: ['latin'], weight: '900', variable: '--font-barlow', adjustFontFallback: false, fallback: [] });";
    const cyrillic =
      "import localFont from 'next/font/local';\nconst c = localFont({ src: [], variable: '--font-inter-cyr', declarations: [{ prop: 'unicode-range', value: 'U+0400-045F' }] });";
    const display = (stack: string) =>
      `--ui-font-display: ${stack};\n--ui-font-mono: var(--font-dm-mono), monospace;`;

    // Диверсия д-35: Barlow Condensed без кириллицы — и никого с кириллицей за ним.
    expect(cyrillicOffenders(barlow, display('var(--font-barlow), sans-serif'), fontData)).toEqual([
      'Barlow Condensed: в --ui-font-display за ним нет шрифта с кириллицей',
    ]);
    // Кириллическое лицо ПЕРЕД Barlow не закрывает: подстановка идёт по порядку стека.
    expect(
      cyrillicOffenders(
        `${barlow}\n${cyrillic}`,
        display('var(--font-inter-cyr), var(--font-barlow)'),
        fontData,
      ),
    ).toEqual(['Barlow Condensed: в --ui-font-display за ним нет шрифта с кириллицей']);
    // Лицо за Barlow — чисто.
    expect(
      cyrillicOffenders(
        `${barlow}\n${cyrillic}`,
        display('var(--font-barlow), var(--font-inter-cyr)'),
        fontData,
      ),
    ).toEqual([]);
    // Подставной fallback не выключен — Arial перехватит кириллицу раньше лица.
    expect(
      cyrillicOffenders(
        `${barlow.replace('adjustFontFallback: false, fallback: []', '')}\n${cyrillic}`,
        display('var(--font-barlow), var(--font-inter-cyr)'),
        fontData,
      ),
    ).toEqual([
      'Barlow Condensed: без adjustFontFallback: false и fallback: [] подставной Arial перехватит кириллицу',
    ]);
    // Шрифт без кириллицы, которого нет ни в одном стеке, — мёртвый и не закрыт.
    expect(cyrillicOffenders(barlow, '--ui-font-display: var(--font-inter);', fontData)).toEqual([
      'Barlow Condensed: не стоит ни в одном стеке --ui-font-*',
    ]);
    // Шрифт с кириллицей, но подключённый без неё — тоже нарушение.
    expect(
      cyrillicOffenders(
        "import { Inter } from 'next/font/google';\nconst i = Inter({ subsets: ['latin'] });",
        '',
        fontData,
      ),
    ).toEqual(['Inter: subsets без cyrillic (latin)']);
    // Mono: DM Mono без кириллицы допустим, пока стек заканчивается monospace.
    const dmMono =
      "import { DM_Mono } from 'next/font/google';\nconst m = DM_Mono({ subsets: ['latin'], weight: '400', variable: '--font-dm-mono', adjustFontFallback: false, fallback: [] });";
    expect(
      cyrillicOffenders(dmMono, '--ui-font-mono: var(--font-dm-mono), monospace;', fontData),
    ).toEqual([]);
    expect(
      cyrillicOffenders(dmMono, '--ui-font-mono: var(--font-dm-mono), Menlo;', fontData),
    ).toEqual([
      'DM Mono: стек --ui-font-mono не заканчивается monospace — кириллица упадёт в serif',
    ]);
    // `next/font/local` сам по себе не проверяется.
    expect(cyrillicOffenders(cyrillic, '', fontData)).toEqual([]);
  });
});
