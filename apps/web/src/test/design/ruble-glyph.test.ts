// Сторож: знак рубля приходит из собственных шрифтов стека (шаг 38.18 → 38.113).
//
// ⚠️ Зачем. Цена «500 ₽» ломается молча: если у шрифта нет U+20BD, браузер подставит
// знак из системного — другим начертанием и другой ширины, и никакой тест классов
// этого не увидит. В 38.18 знак резали из Barlow Condensed отдельным лицом, потому что
// у Sofia Sans его не было. С 38.113 display-шрифт — сам Barlow Condensed, цифры —
// DM Mono, и у обоих `₽` лежит в подмножестве `latin-ext` Google (U+20A0–20C0), проверено
// fontkit по файлам gstatic 17.09.2026: Barlow Condensed 900 — 233 глифа, DM Mono 500 —
// 199, знак есть у обоих. Next включает @font-face ВСЕХ подмножеств с `unicode-range`
// (`subsets` в вызове — только предзагрузка), и файл приезжает по первому знаку на
// странице — ровно как в превью макета с `@import` Google. Отдельное лицо снято.
//
// Что стережётся здесь (без сети): у каждого Google-шрифта display- и mono-стека
// в каталоге Next есть `latin-ext`; вызов не сужает набор глифов опцией `text`
// (она бы вырезала знак вместе с остальным); локального рублёвого лица не осталось —
// `var(--font-ruble)` в стеке сделал бы всё объявление `font-family` недействительным.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';
import { googleFontCalls, loadFontData, stackVariables, type FontData } from './fonts';

/** Подмножество Google, в котором лежит U+20BD. */
export const RUBLE_SUBSET = 'latin-ext';

/** Нарушения покрытия рубля у шрифтов display- и mono-стеков. */
export function rubleOffenders(layout: string, css: string, fontData: FontData): string[] {
  const offenders: string[] = [];
  const fonts = googleFontCalls(layout);
  const stacks = [...stackVariables(css, 'display'), ...stackVariables(css, 'mono')];

  for (const variable of new Set(stacks)) {
    if (/ruble/.test(variable))
      offenders.push(`${variable}: локальное рублёвое лицо снято в 38.113`);
    const font = fonts.find((f) => f.variable === variable);

    if (!font) continue;
    const known = fontData[font.name];

    if (!known) offenders.push(`${font.name}: нет в каталоге Next`);
    else if (!known.subsets.includes(RUBLE_SUBSET))
      offenders.push(`${font.name}: нет подмножества ${RUBLE_SUBSET} — знака ₽ не будет`);
  }

  if (/\btext\s*:\s*['"[]/.test(layout)) offenders.push('опция `text` сужает набор глифов');

  return offenders;
}

describe('Сторож: знак рубля из собственных шрифтов стека (38.18 → 38.113)', () => {
  it('у Barlow Condensed и DM Mono в каталоге Next есть latin-ext, опции text нет, рублёвого лица нет', async () => {
    const layout = await readFile(path.join(WEB_ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    const css = await readFile(path.join(WEB_ROOT, 'src', 'app', 'globals.css'), 'utf8');

    expect(rubleOffenders(layout, css, loadFontData())).toEqual([]);
    // Имя склеено, чтобы сторож removed-fonts не принял проверку за ссылку.
    expect(layout).not.toContain(`--font-${'ruble'}`);
  });

  it('в каталоге локальных лиц рублёвых файлов не осталось', async () => {
    const files = await readdir(path.join(WEB_ROOT, 'src', 'fonts'));

    expect(files.filter((f) => /ruble/.test(f))).toEqual([]);
  });

  it('сторож читает настоящий layout и настоящий каталог, а не пустоту', async () => {
    const layout = await readFile(path.join(WEB_ROOT, 'src', 'app', 'layout.tsx'), 'utf8');
    const fontData = loadFontData();

    expect(Object.keys(fontData).length).toBeGreaterThan(1000);
    expect(googleFontCalls(layout).map((f) => f.name)).toEqual([
      'Barlow Condensed',
      'DM Mono',
      'Inter',
    ]);
    // Каталог различает: есть шрифты без latin-ext — на них проверка и краснеет.
    expect(Object.values(fontData).some((f) => !f.subsets.includes(RUBLE_SUBSET))).toBe(true);
  });

  it('сторож видит поломку на подставном тексте', () => {
    const fontData = loadFontData();
    const latinOnly = Object.entries(fontData).find(
      ([, f]) => f.subsets.includes('latin') && !f.subsets.includes(RUBLE_SUBSET),
    )![0];
    const layout = (name: string) =>
      `import { ${name.replace(/ /g, '_')} } from 'next/font/google';\nconst f = ${name.replace(/ /g, '_')}({ subsets: ['latin'], variable: '--font-x' });`;
    const css = '--ui-font-display: var(--font-x), sans-serif;\n--ui-font-mono: monospace;';

    // Шрифт без latin-ext в стеке — знака не будет.
    expect(rubleOffenders(layout(latinOnly), css, fontData)).toEqual([
      `${latinOnly}: нет подмножества ${RUBLE_SUBSET} — знака ₽ не будет`,
    ]);
    // Barlow Condensed — чисто.
    expect(rubleOffenders(layout('Barlow Condensed'), css, fontData)).toEqual([]);
    // Опция `text` — нарушение даже у шрифта с latin-ext.
    expect(
      rubleOffenders(
        `${layout('Barlow Condensed')}\nconst t = X({ text: '0123' });`,
        css,
        fontData,
      ),
    ).toEqual(['опция `text` сужает набор глифов']);
    // Вернувшееся рублёвое лицо в стеке — нарушение (имя склеено — см. выше).
    const rubleVariable = `--font-${'ruble'}`;
    expect(
      rubleOffenders(
        layout('Barlow Condensed'),
        `--ui-font-display: var(${rubleVariable}), var(--font-x);`,
        fontData,
      ),
    ).toEqual([`${rubleVariable}: локальное рублёвое лицо снято в 38.113`]);
  });
});
