// Сторож: рублёвый глиф — один символ, три обязательные опции, первым в стеке (шаг 38.18).
//
// ⚠️ Зачем. Механизм подстановки одного глифа ломается МОЛЧА в трёх местах, и ни одно
// не видно ни в сборке, ни в jsdom:
//   1. лишний глиф в файле (цифра «1» рядом с `₽`) — цифры цен уедут в Barlow, и никто
//      не заметит: шрифты похожи. Файл проверяется через fontkit: `characterSet`
//      строго `[0x20BD]`;
//   2. `adjustFontFallback` не выключен — Next подставит Arial-fallback сразу за рублём,
//      и он перехватит весь текст display-стека; `fallback: []` — по той же причине;
//      `preload: false` — иначе четыре файла грузятся на странице без единой цены;
//   3. рубль в стеке `--ui-font-display` не первый — браузер сначала спросит Sofia,
//      скачает её `latin-ext` (18,5 КБ) ради диапазона с рублём, глифа не найдёт
//      и лишь потом дойдёт до рубля.
//
// ⚠️ Диверсия «снять unicode-range» рубль не заставит перехватить текст: браузер
// подставляет по глифу, а глиф в файле один. Стережётся порядок в стеке и опции.
//
// ⚠️ `fontkit` берётся по внутреннему пути Next
// (`next/dist/compiled/@next/font/dist/fontkit`) — при обновлении Next это пункт
// чек-листа. Тот же fontkit Next использует сам при сборке `next/font/local`.

import { createRequire } from 'node:module';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const require = createRequire(import.meta.url);

/** Каталог глифов и ожидаемые файлы — веса донора. */
export const FONTS_DIR = 'src/fonts';
export const RUBLE_FILES = [
  'barlow-ruble-500.woff2',
  'barlow-ruble-600.woff2',
  'barlow-ruble-700.woff2',
  'barlow-ruble-800.woff2',
];
export const RUBLE = 0x20bd;

type FontFromBuffer = (buffer: Buffer) => { characterSet: number[] };

/** fontkit из поставки Next — тот же `fontFromBuffer`, что читает шрифты при сборке. */
export function loadFontkit(): FontFromBuffer {
  return (require('next/dist/compiled/@next/font/dist/fontkit') as { default: FontFromBuffer })
    .default;
}

/**
 * Кодовые точки файла.
 *
 * ⚠️ `U+FFFF` — не глиф, а завершающий сегмент таблицы cmap формата 4; fontkit отдаёт
 * его в `characterSet` у любого шрифта. Снимается до сравнения, иначе «строго один
 * глиф» было бы невыполнимо по построению.
 */
export function characterSetOf(buffer: Buffer): number[] {
  return [...loadFontkit()(buffer).characterSet].filter((c) => c !== 0xffff).sort((a, b) => a - b);
}

/** Текст вызова `localFont({ ... })` из layout.tsx. */
export function localFontCall(layout: string): string | null {
  return layout.match(/localFont\(\s*\{([\s\S]*?)\}\s*\)\s*;/)?.[1] ?? null;
}

/** Три обязательные опции и две декларации — что из них отсутствует. */
export function missingRubleOptions(call: string): string[] {
  const required: [string, RegExp][] = [
    ['adjustFontFallback: false', /adjustFontFallback\s*:\s*false/],
    ['fallback: []', /fallback\s*:\s*\[\s*\]/],
    ['preload: false', /preload\s*:\s*false/],
    ['unicode-range: U+20BD', /['"]unicode-range['"][\s\S]{0,40}['"]U\+20BD['"]/i],
    ['size-adjust', /['"]size-adjust['"]/],
    ["variable: '--font-ruble'", /variable\s*:\s*['"]--font-ruble['"]/],
  ];

  return required.filter(([, pattern]) => !pattern.test(call)).map(([name]) => name);
}

/** Первым ли рубль в стеке `--ui-font-display`. */
export function rubleFirstInStack(css: string): boolean {
  const value = css.match(/--ui-font-display\s*:\s*([^;]+);/)?.[1] ?? '';

  return /^\s*var\(--font-ruble\)\s*,\s*var\(--font-sofia\)/.test(value);
}

describe('Сторож: рублёвый глиф (38.18)', () => {
  it('в каждом файле рубля ровно один глиф — U+20BD', async () => {
    const wrong: string[] = [];

    for (const file of RUBLE_FILES) {
      const set = characterSetOf(await readFile(path.join(WEB_ROOT, FONTS_DIR, file)));

      if (set.length !== 1 || set[0] !== RUBLE) {
        wrong.push(`${file}: ${set.map((c) => `U+${c.toString(16).toUpperCase()}`).join(', ')}`);
      }
    }

    expect(wrong, wrong.join('\n')).toEqual([]);
  });

  it('в каталоге шрифтов нет ничего, кроме четырёх файлов рубля', async () => {
    const files = (await readdir(path.join(WEB_ROOT, FONTS_DIR)))
      .filter((f) => !f.startsWith('.'))
      .sort();

    expect(files).toEqual([...RUBLE_FILES].sort());
  });

  it('layout.tsx подключает рубль с тремя обязательными опциями и двумя декларациями', async () => {
    const layout = await readFile(path.join(WEB_ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    const call = localFontCall(layout);

    expect(call, 'вызова localFont({...}) в layout.tsx нет').not.toBeNull();
    expect(missingRubleOptions(call!)).toEqual([]);
    // Веса объявлены на ступень выше файла: файл 500 отвечает за Sofia 600 и так далее.
    for (const file of RUBLE_FILES) expect(call).toContain(file);
  });

  it('рубль стоит ПЕРВЫМ в стеке --ui-font-display, перед Sofia', async () => {
    const css = await readFile(path.join(WEB_ROOT, 'src', 'app', 'globals.css'), 'utf8');

    expect(rubleFirstInStack(css)).toBe(true);
  });

  it('сторож читает настоящие файлы через fontkit, а не пустоту', async () => {
    const buffer = await readFile(path.join(WEB_ROOT, FONTS_DIR, RUBLE_FILES[0]));

    expect(buffer.length).toBeGreaterThan(200);
    expect(characterSetOf(buffer)).toEqual([RUBLE]);
  });

  it('сторож видит поломку на подставном тексте', () => {
    // Диверсия д-37: adjustFontFallback не выключен.
    expect(
      missingRubleOptions(
        "src: [], variable: '--font-ruble', preload: false, fallback: [], declarations: [{ prop: 'unicode-range', value: 'U+20BD' }, { prop: 'size-adjust', value: '94%' }]",
      ),
    ).toEqual(['adjustFontFallback: false']);
    // Полный набор — чисто.
    expect(
      missingRubleOptions(
        "variable: '--font-ruble', preload: false, adjustFontFallback: false, fallback: [], declarations: [{ prop: 'unicode-range', value: 'U+20BD' }, { prop: 'size-adjust', value: '94%' }]",
      ),
    ).toEqual([]);
    // Диверсия д-36: рубль не первым.
    expect(
      rubleFirstInStack('--ui-font-display: var(--font-sofia), var(--font-ruble), sans-serif;'),
    ).toBe(false);
    expect(
      rubleFirstInStack('--ui-font-display: var(--font-ruble), var(--font-sofia), sans-serif;'),
    ).toBe(true);
  });
});
