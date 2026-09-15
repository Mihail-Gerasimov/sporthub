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
// ⚠️ Правило маппинга: `--ui-<семейство>-<имя>` ↔ `--<семейство>-<имя>`, где семейство —
// `font`, `radius` или `shadow`; всё остальное — цвет и маппится в `--color-<имя>`.
// Алиасы (`--ui-canvas: var(--ui-bg)`) — тоже цвет и тоже обязаны быть замаплены:
// на них держится половина классов проекта (`bg-panel`, `text-accent`).
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

/** Семейства, у которых в Tailwind своё пространство имён; всё остальное — цвет. */
const FAMILIES = ['font', 'radius', 'shadow'] as const;

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

/** Имя Tailwind-переменной, под которым обязан быть замаплен токен `--ui-...`. */
export function expectedThemeName(token: string): string {
  const bare = token.slice('--ui-'.length);

  for (const family of FAMILIES) {
    if (bare.startsWith(`${family}-`)) return `--${family}-${bare.slice(family.length + 1)}`;
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

describe('Сторож: контракт токенов палитры (38.7)', () => {
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
    expect(expectedThemeName('--ui-lime-soft')).toBe('--color-lime-soft');

    // Маппинг на чужой токен не засчитывается: `--color-ink: var(--ui-muted)` — не маппинг ink.
    expect(unmappedTokens('--ui-ink: #000;', '--color-ink: var(--ui-muted);')).toEqual([
      '--ui-ink',
    ]);
  });
});
