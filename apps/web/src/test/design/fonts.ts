// Общие разборщики шрифтовых сторожей (38.113): `layout.tsx`, стеки `globals.css`,
// каталог Google-шрифтов и fontkit из поставки Next.
//
// Три сторожа — `font-stack` (порядок стека и кириллическое лицо), `font-cyrillic`
// (у кого нет кириллицы и кто её закрывает) и `ruble-glyph` (знак `₽`) — читают одни и те
// же тексты; разбор объявлен один раз, чтобы «вызов шрифта» во всех трёх значил одно.
// Обратные половины (разбор на подставном тексте) остаются в каждом стороже — у своих
// функций.
//
// ⚠️ `fontkit` и `font-data.json` берутся по внутренним путям Next
// (`next/dist/compiled/@next/font/dist/...`) — при обновлении Next это пункт чек-листа.
// Тот же fontkit Next использует сам при сборке `next/font/local`.

import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);

export type Glyph = { advanceWidth: number };
export type Font = {
  unitsPerEm: number;
  characterSet: number[];
  glyphForCodePoint: (codePoint: number) => Glyph;
  hasGlyphForCodePoint: (codePoint: number) => boolean;
};
export type FontFromBuffer = (buffer: Buffer) => Font;
export type FontData = Record<string, { subsets: string[] }>;

/** Вызов шрифта Google в layout: имя шрифта, запрошенные `subsets`, переменная, текст опций. */
export type GoogleFontCall = {
  name: string;
  subsets: string[];
  variable: string | null;
  options: string;
};

/** fontkit из поставки Next — тот же `fontFromBuffer`, что читает шрифты при сборке. */
export function loadFontkit(): FontFromBuffer {
  return (require('next/dist/compiled/@next/font/dist/fontkit') as { default: FontFromBuffer })
    .default;
}

/** Каталог шрифтов Google, каким его знает Next. */
export function loadFontData(): FontData {
  return require('next/dist/compiled/@next/font/dist/google/font-data.json') as FontData;
}

/** Имя импорта → имя шрифта: `Barlow_Condensed` → «Barlow Condensed». */
export function fontNameOf(importName: string): string {
  return importName.replace(/_/g, ' ');
}

/** Вызовы шрифтов Google в тексте — в порядке импорта. */
export function googleFontCalls(text: string): GoogleFontCall[] {
  const imported = text.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/);

  if (!imported) return [];

  const calls: GoogleFontCall[] = [];

  for (const importName of imported[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)) {
    const options =
      text.match(new RegExp(`\\b${importName}\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`))?.[1] ?? '';
    const subsetsMatch = options.match(/subsets\s*:\s*\[([^\]]*)\]/);

    calls.push({
      name: fontNameOf(importName),
      subsets: subsetsMatch
        ? [...subsetsMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
        : [],
      variable: options.match(/variable\s*:\s*['"](--font-[\w-]+)['"]/)?.[1] ?? null,
      options,
    });
  }

  return calls;
}

/** Тексты опций всех вызовов `localFont({ ... })` в layout. */
export function localFontCalls(text: string): string[] {
  return [...text.matchAll(/localFont\(\s*\{([\s\S]*?)\}\s*\)\s*;/g)].map((m) => m[1]);
}

/** Текст вызова `localFont({ ... })` с переменной `variable`. */
export function localFontCall(text: string, variable: string): string | null {
  return (
    localFontCalls(text).find((call) =>
      new RegExp(`variable\\s*:\\s*['"]${variable}['"]`).test(call),
    ) ?? null
  );
}

/** Значение декларации `{ prop: '<prop>', value: '...' }` в вызове шрифта. */
export function declarationOf(call: string, prop: string): string | null {
  return (
    call.match(
      new RegExp(`prop\\s*:\\s*['"]${prop}['"]\\s*,\\s*value\\s*:\\s*['"]([^'"]+)['"]`),
    )?.[1] ?? null
  );
}

/** Переменные `var(--font-*)` стека `--ui-font-<name>` из globals.css — в порядке объявления. */
export function stackVariables(css: string, name: string): string[] {
  const value = css.match(new RegExp(`--ui-font-${name}\\s*:\\s*([^;]+);`))?.[1] ?? '';

  return [...value.matchAll(/var\((--font-[\w-]+)\)/g)].map((m) => m[1]);
}

/** Покрывает ли `unicode-range` весь основной блок кириллицы U+0400–U+045F. */
export function coversCyrillic(unicodeRange: string | null): boolean {
  if (!unicodeRange) return false;

  return [...unicodeRange.matchAll(/U\+([0-9A-F]+)(?:-([0-9A-F]+))?/gi)].some((m) => {
    const from = Number.parseInt(m[1], 16);
    const to = m[2] ? Number.parseInt(m[2], 16) : from;

    return from <= 0x400 && to >= 0x45f;
  });
}
