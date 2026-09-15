// Сторож: каждый шрифт из `next/font/google` подключён с кириллицей (шаг 38.17).
//
// ⚠️ Зачем. Три фазы display-шрифтом был Bowlby One — у него кириллицы нет вовсе,
// и русские заголовки молча рисовались Impact'ом. Сборка проходит, тест классов
// зелёный, а H1 на странице — другим шрифтом. Никакой тест классов этого не поймает:
// подстановка происходит в браузере по глифу.
//
// Проверяется по двум источникам сразу: по вызову в коде — запрошен ли `subsets`
// с `cyrillic`; и по `font-data.json` самого Next — есть ли у шрифта кириллица вообще.
// Второе важнее: `subsets: ['cyrillic']` у Barlow Condensed сборку уронит, но диверсия
// «подключить Barlow без cyrillic» должна краснеть здесь, а не в браузере.
//
// ⚠️ `next/font/local` не проверяется: рублёвый глиф (38.18) — один символ U+20BD,
// кириллицы у него нет по построению.
//
// ⚠️ `font-data.json` берётся по внутреннему пути Next
// (`next/dist/compiled/@next/font/dist/google/font-data.json`) — при обновлении Next
// это пункт чек-листа.

import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const require = createRequire(import.meta.url);

type FontData = Record<string, { subsets: string[] }>;

/** Каталог шрифтов Google, каким его знает Next. */
export function loadFontData(): FontData {
  return require('next/dist/compiled/@next/font/dist/google/font-data.json') as FontData;
}

/** Имя импорта → имя шрифта: `Sofia_Sans_Extra_Condensed` → «Sofia Sans Extra Condensed». */
export function fontNameOf(importName: string): string {
  return importName.replace(/_/g, ' ');
}

/** Вызовы шрифтов Google в тексте: имя и запрошенные `subsets`. */
export function googleFontCalls(text: string): { name: string; subsets: string[] }[] {
  const imported = text.match(/import\s*\{([^}]+)\}\s*from\s*['"]next\/font\/google['"]/);

  if (!imported) return [];

  const names = imported[1]
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
  const calls: { name: string; subsets: string[] }[] = [];

  for (const name of names) {
    const call = text.match(new RegExp(`\\b${name}\\s*\\(\\s*\\{([\\s\\S]*?)\\}\\s*\\)`));
    const subsetsMatch = call?.[1].match(/subsets\s*:\s*\[([^\]]*)\]/);
    const subsets = subsetsMatch
      ? [...subsetsMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
      : [];

    calls.push({ name: fontNameOf(name), subsets });
  }

  return calls;
}

/** Нарушения: шрифт без кириллицы в каталоге или без `cyrillic` в запросе. */
export function cyrillicOffenders(text: string, fontData: FontData): string[] {
  const offenders: string[] = [];

  for (const { name, subsets } of googleFontCalls(text)) {
    const known = fontData[name];

    if (!known) {
      offenders.push(`${name}: нет в каталоге Next`);
      continue;
    }

    if (!known.subsets.includes('cyrillic')) {
      offenders.push(`${name}: у шрифта нет кириллицы (${known.subsets.join(', ')})`);
    } else if (!subsets.includes('cyrillic')) {
      offenders.push(`${name}: subsets без cyrillic (${subsets.join(', ') || 'пусто'})`);
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

describe('Сторож: шрифты Google с кириллицей (38.17)', () => {
  it('каждый шрифт из next/font/google подключён с cyrillic и имеет её в каталоге', async () => {
    const fontData = loadFontData();
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      for (const offender of cyrillicOffenders(text, fontData))
        offenders.push(`${file}: ${offender}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож читает настоящий layout и настоящий каталог, а не пустоту', async () => {
    const fontData = loadFontData();
    const layout = await readFile(path.join(WEB_ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    const calls = googleFontCalls(layout);

    expect(Object.keys(fontData).length).toBeGreaterThan(1000);
    expect(calls.map((c) => c.name)).toEqual(['Inter', 'Sofia Sans Extra Condensed']);
    for (const call of calls) expect(call.subsets).toContain('cyrillic');
    // Каталог знает, что у Barlow Condensed кириллицы нет — иначе диверсия д-35 не покраснела бы.
    expect(fontData['Barlow Condensed'].subsets).not.toContain('cyrillic');
  });

  it('сторож видит нарушение на подставном тексте', () => {
    const fontData = loadFontData();
    const barlow =
      "import { Barlow_Condensed } from 'next/font/google';\nconst b = Barlow_Condensed({ subsets: ['latin'], weight: '900' });";
    // Диверсия д-35: Barlow Condensed без кириллицы — у шрифта её нет вовсе.
    expect(cyrillicOffenders(barlow, fontData)).toEqual([
      'Barlow Condensed: у шрифта нет кириллицы (latin, latin-ext, vietnamese)',
    ]);
    // Шрифт с кириллицей, но подключённый без неё — тоже нарушение.
    expect(
      cyrillicOffenders(
        "import { Inter } from 'next/font/google';\nconst i = Inter({ subsets: ['latin'] });",
        fontData,
      ),
    ).toEqual(['Inter: subsets без cyrillic (latin)']);
    // Правильное подключение — чисто.
    expect(
      cyrillicOffenders(
        "import { Inter, Sofia_Sans_Extra_Condensed } from 'next/font/google';\nconst s = Sofia_Sans_Extra_Condensed({ subsets: ['cyrillic', 'latin'] });\nconst i = Inter({ subsets: ['cyrillic', 'latin'] });",
        fontData,
      ),
    ).toEqual([]);
    // `next/font/local` не проверяется.
    expect(
      cyrillicOffenders(
        "import localFont from 'next/font/local';\nconst r = localFont({ src: [] });",
        fontData,
      ),
    ).toEqual([]);
  });
});
