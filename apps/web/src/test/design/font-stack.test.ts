// Сторож: стек шрифтов макета и кириллица display-текста (шаг 38.113).
//
// ⚠️ Зачем. Макет объявляет Barlow Condensed 900, у которого нет кириллицы; в превью
// русские заголовки рисует системная Helvetica Bold. Мы воспроизводим это пословной
// подстановкой: Barlow латиницей, за ним локальный Inter 900 с `unicode-range`
// кириллицы. Механизм ломается МОЛЧА — сборка проходит, jsdom шрифтов не знает:
//   1. порядок в стеке: Inter (обычный, с кириллицей) раньше кириллического — заголовок
//      получит Inter 900 без `size-adjust`, а латиница «SportHub» уедет из Barlow;
//   2. `unicode-range` у локального лица снят — Inter 900 перехватит и латиницу, и цифры;
//   3. `size-adjust` снят — строка «НАЙДИ ЗАЛ» станет на 6,4% шире превью (Inter шире
//      Helvetica), и герой переносится иначе; 96% держит ширину в пределах 3%;
//   4. `adjustFontFallback` не выключен / `fallback` не пуст — Next вставит за лицом
//      Arial без `unicode-range`, и он перехватит всё, чего нет ни в Barlow, ни в Inter;
//   5. в файле лица оказались цифры или латиница сверх дублей кириллицы — они
//      не сработают из-за `unicode-range`, но файл вырастет с 8 КБ до полного Inter.
//
// Ширина меряется ПО ГЛИФАМ: сумма `advanceWidth` строки «НАЙДИ ЗАЛ» (без запятой —
// её в кириллическом подмножестве нет, в браузере она из Barlow) на кегле 72px, умноженная
// на `size-adjust`, против записанной ширины Helvetica Bold. Эталон снят тем же fontkit
// с `/System/Library/Fonts/Helvetica.ttc` (лицо `Helvetica-Bold`, upm 2048) 17.09.2026:
// 433,44px; высота капители 0,7197 em (у Inter 0,7275 × 0,96 = 0,6984 — тоже в 3%).
// Без `size-adjust` Inter 900 даёт 461,36px (+6,4%), с 96% — 442,90px (+2,2%).
//
// Разбор layout/globals и fontkit — общие для шрифтовых сторожей (`./fonts.ts`).

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';
import {
  coversCyrillic,
  declarationOf,
  googleFontCalls,
  loadFontkit,
  localFontCall,
  stackVariables,
  type Font,
} from './fonts';

/** Каталог локальных лиц: единственный файл — кириллический Inter 900. */
export const FONTS_DIR = 'src/fonts';
export const CYRILLIC_FILE = 'inter-cyrillic-900.woff2';
export const CYRILLIC_VARIABLE = '--font-inter-cyr';

/** Порядок display-стека: латиница Barlow, кириллица локального Inter, затем обычный Inter. */
export const DISPLAY_STACK_HEAD = ['--font-barlow', CYRILLIC_VARIABLE, '--font-inter'];

/** Строка героя макета для замера (без запятой — см. шапку) и кегль H1 на 1440. */
export const SAMPLE = 'НАЙДИ ЗАЛ';
export const SAMPLE_SIZE = 72;
/** Ширина `SAMPLE` в Helvetica Bold на 72px — эталон превью макета (fontkit, 17.09.2026). */
export const HELVETICA_BOLD_WIDTH = 433.44;
/** Допуск расхождения ширины с превью. */
export const WIDTH_TOLERANCE = 0.03;

/** Ширина строки в px на кегле `size`: сумма advance-ширин глифов по кодовым точкам. */
export function textWidth(font: Font, text: string, size: number): number {
  let units = 0;

  for (const char of text) units += font.glyphForCodePoint(char.codePointAt(0)!).advanceWidth;

  return (units / font.unitsPerEm) * size;
}

/** `size-adjust: '96%'` → 0.96; без декларации — 1 (браузер так и считает). */
export function sizeAdjustOf(call: string): number {
  const value = declarationOf(call, 'size-adjust');

  return value ? Number.parseFloat(value) / 100 : 1;
}

/** Чего не хватает локальному кириллическому лицу из обязательных опций. */
export function missingCyrillicOptions(call: string): string[] {
  const required: Array<[label: string, pattern: RegExp]> = [
    ["weight: '900'", /weight\s*:\s*['"]900['"]/],
    ['adjustFontFallback: false', /adjustFontFallback\s*:\s*false/],
    ['fallback: []', /fallback\s*:\s*\[\s*\]/],
    ['unicode-range кириллицы', /['"]unicode-range['"]/],
    ['size-adjust', /['"]size-adjust['"]/],
  ];

  return required.filter(([, pattern]) => !pattern.test(call)).map(([label]) => label);
}

const layoutPath = path.join(WEB_ROOT, 'src', 'app', 'layout.tsx');
const globalsPath = path.join(WEB_ROOT, 'src', 'app', 'globals.css');

describe('Сторож: стек шрифтов макета и кириллица display-текста (38.113)', () => {
  it('display-стек: Barlow с весом 900, за ним кириллический Inter 900, затем Inter; body — Inter', async () => {
    const css = await readFile(globalsPath, 'utf8');
    const barlow = googleFontCalls(await readFile(layoutPath, 'utf8')).find(
      (call) => call.variable === DISPLAY_STACK_HEAD[0],
    );

    expect(stackVariables(css, 'display').slice(0, 3)).toEqual(DISPLAY_STACK_HEAD);
    expect(stackVariables(css, 'body')[0]).toBe('--font-inter');
    // Вес макета: без '900' в запросе браузер подставит ближайший загруженный (800).
    expect(barlow?.options).toMatch(/weight\s*:\s*\[[^\]]*['"]900['"]/);
  });

  it('mono-стек — DM Mono и системная моноширинная; DM Mono больше нигде; `--font-mono` Tailwind — этот стек', async () => {
    const css = await readFile(globalsPath, 'utf8');

    expect(stackVariables(css, 'mono')).toEqual(['--font-dm-mono']);
    expect(css.match(/--ui-font-mono\s*:\s*([^;]+);/)?.[1]).toMatch(/monospace\s*$/);
    expect(stackVariables(css, 'display')).not.toContain('--font-dm-mono');
    expect(stackVariables(css, 'body')).not.toContain('--font-dm-mono');
    expect(css).toMatch(/--font-mono:\s*var\(--ui-font-mono\);/);
  });

  it('локальное лицо: вес 900, unicode-range кириллицы, size-adjust, без подставного fallback', async () => {
    const call = localFontCall(await readFile(layoutPath, 'utf8'), CYRILLIC_VARIABLE);

    expect(call, `вызова localFont с ${CYRILLIC_VARIABLE} в layout.tsx нет`).not.toBeNull();
    expect(missingCyrillicOptions(call!)).toEqual([]);
    expect(coversCyrillic(declarationOf(call!, 'unicode-range'))).toBe(true);
    expect(call).toContain(CYRILLIC_FILE);
  });

  it('в каталоге локальных лиц — только кириллический Inter 900', async () => {
    const files = (await readdir(path.join(WEB_ROOT, FONTS_DIR))).filter((f) => !f.startsWith('.'));

    expect(files).toEqual([CYRILLIC_FILE]);
  });

  it('файл лица: вся основная кириллица и Ё есть, цифр нет', async () => {
    const font = loadFontkit()(await readFile(path.join(WEB_ROOT, FONTS_DIR, CYRILLIC_FILE)));
    const missing: string[] = [];

    for (let codePoint = 0x410; codePoint <= 0x44f; codePoint += 1) {
      if (!font.hasGlyphForCodePoint(codePoint)) missing.push(String.fromCodePoint(codePoint));
    }
    for (const codePoint of [0x401, 0x451]) {
      if (!font.hasGlyphForCodePoint(codePoint)) missing.push(String.fromCodePoint(codePoint));
    }

    expect(missing).toEqual([]);
    for (let digit = 0x30; digit <= 0x39; digit += 1) {
      expect(font.hasGlyphForCodePoint(digit), String.fromCodePoint(digit)).toBe(false);
    }
  });

  it('ширина «НАЙДИ ЗАЛ» на 72px с size-adjust — ширина Helvetica Bold превью ±3%', async () => {
    const font = loadFontkit()(await readFile(path.join(WEB_ROOT, FONTS_DIR, CYRILLIC_FILE)));
    const call = localFontCall(await readFile(layoutPath, 'utf8'), CYRILLIC_VARIABLE) ?? '';
    const raw = textWidth(font, SAMPLE, SAMPLE_SIZE);
    const adjusted = raw * sizeAdjustOf(call);

    expect(Math.abs(adjusted / HELVETICA_BOLD_WIDTH - 1)).toBeLessThanOrEqual(WIDTH_TOLERANCE);
    // Обратная половина: подгонка несёт нагрузку — без неё строка выходит за допуск.
    expect(Math.abs(raw / HELVETICA_BOLD_WIDTH - 1)).toBeGreaterThan(WIDTH_TOLERANCE);
  });

  it('сторож читает настоящие файлы, а не пустоту', async () => {
    const font = loadFontkit()(await readFile(path.join(WEB_ROOT, FONTS_DIR, CYRILLIC_FILE)));

    expect(font.unitsPerEm).toBeGreaterThan(0);
    expect(font.characterSet.length).toBeGreaterThan(60);
    expect(await readFile(layoutPath, 'utf8')).toContain('localFont(');
    expect(stackVariables(await readFile(globalsPath, 'utf8'), 'display').length).toBeGreaterThan(
      2,
    );
  });

  it('сторож видит поломку на подставном тексте', () => {
    // Порядок стека: обычный Inter раньше кириллического.
    expect(
      stackVariables(
        '--ui-font-display: var(--font-barlow), var(--font-inter), var(--font-inter-cyr), sans-serif;',
        'display',
      ).slice(0, 3),
    ).not.toEqual(DISPLAY_STACK_HEAD);
    // Опции лица: без unicode-range и size-adjust.
    expect(
      missingCyrillicOptions(
        "src: [{ path: '../fonts/inter-cyrillic-900.woff2', weight: '900' }], variable: '--font-inter-cyr', adjustFontFallback: false, fallback: [], declarations: []",
      ),
    ).toEqual(['unicode-range кириллицы', 'size-adjust']);
    // Диапазон без основного блока кириллицы — не покрытие.
    expect(coversCyrillic('U+0301, U+0400-040F')).toBe(false);
    expect(coversCyrillic('U+0400-045F')).toBe(true);
    expect(coversCyrillic(null)).toBe(false);
    // Подгонка читается числом; без декларации — 1.
    expect(sizeAdjustOf("declarations: [{ prop: 'size-adjust', value: '96%' }]")).toBe(0.96);
    expect(sizeAdjustOf('declarations: []')).toBe(1);
    // Вызов ищется по переменной, а не по порядку.
    expect(
      localFontCall(
        "localFont({ variable: '--font-other' });\nlocalFont({ variable: '--font-inter-cyr' });",
        CYRILLIC_VARIABLE,
      ),
    ).toContain('--font-inter-cyr');
    // Ширина считается по кодовым точкам и кеглю.
    const fake = {
      unitsPerEm: 1000,
      characterSet: [],
      glyphForCodePoint: () => ({ advanceWidth: 500 }),
      hasGlyphForCodePoint: () => true,
    };
    expect(textWidth(fake, 'АБ', 20)).toBe(20);
  });
});
