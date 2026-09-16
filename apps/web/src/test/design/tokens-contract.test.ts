// Сторож: токены палитры объявлены ровно один раз и замаплены в Tailwind (шаг 38.7).
//
// ⚠️ Что он ловит — ФОРМУ, а не значения. Значение токена — решение дизайна, и оно
// меняется правкой одной строки в `globals.css`; сторож не вправе мешать этому.
// Ломается другое: токен снят, а классы на нём остались (`bg-lime` молча становится
// прозрачным — Tailwind не знает такого цвета и не жалуется); токен объявлен дважды
// с разными значениями (побеждает нижний, и правка верхнего ничего не меняет);
// токен заведён в `:root`, но не замаплен в `@theme inline` — тогда `var(--ui-x)`
// работает, а `bg-x` нет, и цвет расползается по коду в виде `bg-[var(--ui-x)]`.
//
// ⚠️ Правило маппинга: `--ui-<семейство>-<имя>` ↔ `--<пространство>-<имя>`, где семейство
// названо в `FAMILIES`: `font` → `--font-*`, `radius` → `--radius-*`, `shadow` →
// `--shadow-*`, `weight` → `--font-weight-*`. Семейства БЕЗ Tailwind-маппинга — `decor`
// (рисунки-декор для CSS) и `scale` (скаляры для `calc()`, шаг 38.19): у них
// пространства в Tailwind нет, но единственность стережётся так же. Всё остальное —
// цвет и маппится в `--color-<имя>`. Алиасы (`--ui-canvas: var(--ui-bg)`) — тоже цвет
// и тоже обязаны быть замаплены: на них держится половина классов проекта.
//
// ⚠️ Сверка значений с эталоном дизайна — разовая, по снимку шага 38.5, и в этот
// сторож не входит: тест, который знает hex наизусть, красен при каждой перекраске.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const GLOBALS_PATH = path.join(WEB_ROOT, 'src', 'app', 'globals.css');

/**
 * Токены, без которых палитра не палитра. Список закрыт: имена не меняются (решение
 * заказчика, шаг 38.7), меняются только значения. Снять любой из них — значит оставить
 * без цвета классы, которые на нём стоят.
 */
export const REQUIRED_TOKENS = [
  '--ui-bg',
  '--ui-bg-deep',
  '--ui-card',
  '--ui-card-2',
  '--ui-line',
  '--ui-line-2',
  '--ui-ink',
  '--ui-muted',
  '--ui-disabled',
  '--ui-lime',
  '--ui-lime-hov',
  '--ui-lime-soft',
  '--ui-orange',
  '--ui-orange-hov',
  '--ui-orange-soft',
  '--ui-orange-text',
  '--ui-tint-lime',
  '--ui-tint-sky',
  '--ui-tint-violet',
  '--ui-tint-orange',
  '--ui-hue-sky',
  '--ui-hue-violet',
  '--ui-red',
  '--ui-gold',
  // Контраст-плашка: тёмный фон героя и шапки с собственным текстом и линиями.
  '--ui-plate',
  '--ui-plate-ink',
  '--ui-plate-muted',
  '--ui-plate-line',
  '--ui-font-display',
  '--ui-font-body',
  '--ui-radius-card',
  '--ui-radius-pill',
  '--ui-radius-modal',
  '--ui-shadow-card',
  '--ui-shadow-floating',
];

/**
 * Семейства токенов: пространство Tailwind либо `null` — маппинга нет по построению.
 * Порядок важен: `font-weight` длиннее `font` и проверяется раньше.
 */
const FAMILIES: [family: string, themePrefix: string | null][] = [
  ['weight', '--font-weight'],
  ['font', '--font'],
  ['radius', '--radius'],
  ['shadow', '--shadow'],
  ['decor', null],
  ['scale', null],
];

/** Текст CSS без комментариев — иначе токен из пояснения посчитался бы объявлением. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Тело первого блока с данным заголовком (`:root`, `@theme inline`). */
function blockBody(css: string, header: string): string | null {
  const start = css.indexOf(header);

  if (start < 0) return null;

  const open = css.indexOf('{', start);
  let depth = 0;

  for (let i = open; i < css.length; i += 1) {
    if (css[i] === '{') depth += 1;
    if (css[i] === '}') {
      depth -= 1;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }

  return null;
}

/** Все объявления `--ui-*: значение;` в блоке — с повторами, порядок сохранён. */
export function declaredTokens(rootBody: string): { name: string; value: string }[] {
  return [...rootBody.matchAll(/(--ui-[a-z0-9-]+)\s*:\s*([^;]+);/g)].map((m) => ({
    name: m[1],
    value: m[2].trim(),
  }));
}

/** Имя Tailwind-переменной для токена `--ui-...`; `null` — семейство без маппинга. */
export function expectedThemeName(token: string): string | null {
  const bare = token.slice('--ui-'.length);

  for (const [family, prefix] of FAMILIES) {
    if (bare.startsWith(`${family}-`)) {
      return prefix === null ? null : `${prefix}-${bare.slice(family.length + 1)}`;
    }
  }

  return `--color-${bare}`;
}

/** Токены, объявленные больше одного раза. */
export function duplicatedTokens(tokens: { name: string }[]): string[] {
  const seen = new Map<string, number>();

  for (const { name } of tokens) seen.set(name, (seen.get(name) ?? 0) + 1);

  return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

/** Токены `:root`, у которых в `@theme inline` нет строки `--<семейство>-<имя>: var(--ui-...)`. */
export function unmappedTokens(rootBody: string, themeBody: string): string[] {
  const missing: string[] = [];

  for (const { name } of declaredTokens(rootBody)) {
    const themeName = expectedThemeName(name);

    if (themeName === null) continue;

    const mapping = new RegExp(`${themeName}\\s*:\\s*var\\(${name}\\)\\s*;`);

    if (!mapping.test(themeBody)) missing.push(name);
  }

  return missing;
}

/** Разбор настоящего файла — один на все проверки. */
function readGlobals(): { root: string; theme: string } {
  const css = stripComments(readFileSync(GLOBALS_PATH, 'utf8'));
  const root = blockBody(css, ':root');
  const theme = blockBody(css, '@theme inline');

  if (root === null || theme === null) {
    throw new Error('В globals.css нет блока :root или @theme inline');
  }

  return { root, theme };
}

/**
 * Правила, где декор-токен стоит в сокращённом `background:`, а селектор — не
 * псевдоэлемент. Сокращённая запись сбрасывает цвет подложки, и `bg-plate` /
 * `bg-card-2` у элемента исчезают (найдено проходом 38.87 у `.hero-bg-blank`);
 * у `::before`/`::after` своей подложки нет — там сокращение безвредно.
 */
export function decorShorthandOffenders(css: string): string[] {
  const offenders: string[] = [];

  for (const match of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    const selector = match[1].trim();
    const body = match[2];

    if (!/(^|[\s;])background:\s*var\(--ui-decor-/.test(body)) continue;
    if (/::(before|after)\b/.test(selector)) continue;

    offenders.push(selector);
  }

  return offenders;
}

/** Цвет `#rrggbb` или `rgba(r, g, b, a)` → [r, g, b, a]. */
function parseColor(value: string): [number, number, number, number] | null {
  const hex = /^#([0-9a-f]{6})$/i.exec(value.trim());
  if (hex) {
    const n = parseInt(hex[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255, 1];
  }
  const rgba = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+))?\s*\)$/i.exec(
    value.trim(),
  );
  if (rgba)
    return [
      Number(rgba[1]),
      Number(rgba[2]),
      Number(rgba[3]),
      rgba[4] === undefined ? 1 : Number(rgba[4]),
    ];
  return null;
}

/**
 * Контраст WCAG двух цветов. Полупрозрачная поверхность (`--ui-orange-soft`) сначала
 * кладётся на белую карточку, полупрозрачный текст — на поверхность.
 */
export function contrastRatio(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const raw = parseColor(background);
  if (!fg || !raw) return null;
  const white = [255, 255, 255, 1];
  const bg = raw.map((c, i) => (i === 3 ? 1 : c * raw[3] + white[i] * (1 - raw[3])));
  const blended = fg.map((c, i) => (i === 3 ? 1 : c * fg[3] + bg[i] * (1 - fg[3])));
  const luminance = ([r, g, b]: number[]) => {
    const f = (c: number) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const [hi, lo] = [luminance(blended), luminance(bg)].sort((a, b) => b - a);
  return (hi + 0.05) / (lo + 0.05);
}

/**
 * Пары «текст на поверхности», которые палитра обязана держать на AA (4,5:1):
 * приглушённый и тёмно-зелёный текст на светлых поверхностях, чернила на лайме,
 * белый и приглушённый белый на плашке. Порог — по WCAG для обычного текста.
 */
const AA_PAIRS: Array<[text: string, surface: string]> = [
  ['--ui-muted', '--ui-bg'],
  ['--ui-muted', '--ui-card'],
  ['--ui-muted', '--ui-card-2'],
  ['--ui-lime-hov', '--ui-bg'],
  ['--ui-lime-hov', '--ui-card'],
  ['--ui-ink', '--ui-lime'],
  ['--ui-ink', '--ui-bg'],
  ['--ui-plate-ink', '--ui-plate'],
  ['--ui-plate-muted', '--ui-plate'],
  // Оранжевый текстом на светлом — только `--ui-orange-text` (38.14a).
  ['--ui-orange-text', '--ui-bg'],
  ['--ui-orange-text', '--ui-card'],
  ['--ui-orange-text', '--ui-card-2'],
  ['--ui-orange-text', '--ui-orange-soft'],
  // Плитки «Возможности» (38.110): чернила и приглушённый на каждой подложке-оттенке.
  ['--ui-ink', '--ui-tint-lime'],
  ['--ui-ink', '--ui-tint-sky'],
  ['--ui-ink', '--ui-tint-violet'],
  ['--ui-ink', '--ui-tint-orange'],
  ['--ui-muted', '--ui-tint-lime'],
  ['--ui-muted', '--ui-tint-sky'],
  ['--ui-muted', '--ui-tint-violet'],
  ['--ui-muted', '--ui-tint-orange'],
];

describe('Сторож: контракт токенов палитры (38.7)', () => {
  it('пары палитры «текст на поверхности» держат AA 4,5:1 (38.97: muted на холсте был 4,47)', () => {
    const { root } = readGlobals();
    const values = new Map(declaredTokens(root).map((t) => [t.name, t.value]));
    const failing: string[] = [];

    for (const [text, surface] of AA_PAIRS) {
      const ratio = contrastRatio(values.get(text) ?? '', values.get(surface) ?? '');

      if (ratio === null) failing.push(`${text} на ${surface}: цвет не разобран`);
      else if (ratio < 4.5) failing.push(`${text} на ${surface}: ${ratio.toFixed(2)}:1`);
    }

    expect(failing).toEqual([]);
    // Обратная половина: прежнее значение muted на холсте — ниже порога; оранжевый
    // макета текстом на мягкой оранжевой подложке — тоже.
    expect(contrastRatio('#6b7280', '#f4f6f9')!).toBeLessThan(4.5);
    expect(contrastRatio('#f97316', 'rgba(249, 115, 22, 0.12)')!).toBeLessThan(3);
    // Подложка плитки при 40% оттенка (не 6%) уронила бы приглушённый текст ниже AA.
    expect(contrastRatio('#626b7a', 'rgba(139, 92, 246, 0.4)')!).toBeLessThan(4.5);
    expect(contrastRatio('rgba(255, 255, 255, 0.45)', '#111111')!).toBeGreaterThan(4.5);
  });

  it('декор-токены — только `background-image`; сокращённое `background:` лишь у псевдоэлементов', () => {
    const css = stripComments(readFileSync(GLOBALS_PATH, 'utf8'));
    expect(decorShorthandOffenders(css)).toEqual([]);
    // Обратная половина: подставная поломка находится, псевдоэлемент — нет.
    expect(
      decorShorthandOffenders(
        '.x { background: var(--ui-decor-hatch); }\n.y::before { background: var(--ui-decor-hatch); }',
      ),
    ).toEqual(['.x']);
  });

  it('каждый обязательный токен объявлен в :root', () => {
    const names = new Set(declaredTokens(readGlobals().root).map((t) => t.name));
    const missing = REQUIRED_TOKENS.filter((token) => !names.has(token));

    expect(missing, `не объявлены: ${missing.join(', ')}`).toEqual([]);
  });

  it('ни один токен не объявлен дважды', () => {
    const duplicates = duplicatedTokens(declaredTokens(readGlobals().root));

    expect(duplicates, `объявлены повторно: ${duplicates.join(', ')}`).toEqual([]);
  });

  it('каждый токен :root замаплен в @theme inline под своим семейством', () => {
    const { root, theme } = readGlobals();
    const missing = unmappedTokens(root, theme);

    expect(missing, `не замаплены: ${missing.join(', ')}`).toEqual([]);
  });

  it('сторож читает настоящий globals.css, а не пустоту', () => {
    // ⚠️ Текстовые сторожа проекта однажды обходили пустоту и оставались зелёными.
    const { root, theme } = readGlobals();
    const tokens = declaredTokens(root);

    expect(tokens.length).toBeGreaterThan(30);
    expect(theme).toContain('--color-lime');
    expect(tokens.map((t) => t.name)).toContain('--ui-lime');
  });

  it('сторож видит поломку на подставном тексте, а не молчит на любом', () => {
    // Дубль с разными значениями — узнаётся.
    expect(
      duplicatedTokens(declaredTokens('--ui-lime: #111;\n--ui-ink: #000;\n--ui-lime: #222;')),
    ).toEqual(['--ui-lime']);

    // Незамапленный цвет — узнаётся; замапленный — нет.
    expect(
      unmappedTokens('--ui-lime: #111;\n--ui-ink: #000;', '--color-lime: var(--ui-lime);'),
    ).toEqual(['--ui-ink']);

    // Семейства маппятся под своими именами, а не как цвет.
    expect(expectedThemeName('--ui-font-display')).toBe('--font-display');
    expect(expectedThemeName('--ui-radius-card-lg')).toBe('--radius-card-lg');
    expect(expectedThemeName('--ui-shadow-floating')).toBe('--shadow-floating');
    expect(expectedThemeName('--ui-weight-display')).toBe('--font-weight-display');
    expect(expectedThemeName('--ui-lime-soft')).toBe('--color-lime-soft');
    // Декор и скаляры маппинга не требуют, но дубль у них ловится так же.
    expect(expectedThemeName('--ui-decor-hatch')).toBeNull();
    expect(expectedThemeName('--ui-scale-display')).toBeNull();
    expect(unmappedTokens('--ui-decor-hatch: none;\n--ui-scale-display: 1.069;', '')).toEqual([]);
    expect(
      duplicatedTokens(declaredTokens('--ui-decor-hatch: none;\n--ui-decor-hatch: none;')),
    ).toEqual(['--ui-decor-hatch']);

    // Маппинг на чужой токен не засчитывается: `--color-ink: var(--ui-muted)` — не маппинг ink.
    expect(unmappedTokens('--ui-ink: #000;', '--color-ink: var(--ui-muted);')).toEqual([
      '--ui-ink',
    ]);
  });
});
