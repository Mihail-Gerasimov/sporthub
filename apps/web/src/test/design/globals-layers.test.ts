// Сторож: в `globals.css` нет правил вне слоёв (аудит главной 17.09, п. 1).
//
// ⚠️ Зачем. `* { border-color: var(--ui-line) }` стоял вне `@layer` — а правило вне слоя
// сильнее ЛЮБОЙ утилиты Tailwind (утилиты живут в `@layer utilities`), и `border-lime/20`,
// `border-transparent`, `hover:border-lime` по всей площадке рисовались серым `#e5e7eb`:
// зелёной обводки не было никогда, и «элементы не похожи на макет» — отсюда. Тот же
// класс дефекта — `.t-eyebrow { color }` (38.79c). Правило: верхний уровень файла —
// только `@import`, `:root`, `@theme`, `@layer`, `@font-face`, `@keyframes` и комментарии;
// элементные умолчания — в `@layer base`, классы площадки — в `@layer components`,
// ниже утилит.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const ALLOWED = /^(@import\b|:root$|@theme\b|@layer\b|@font-face\b|@keyframes\b)/;

/** Текст без комментариев. */
function stripComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

/** Заголовки конструкций верхнего уровня: текст до `{` на нулевой глубине скобок. */
export function topLevelHeads(css: string): string[] {
  const heads: string[] = [];
  let depth = 0;
  let head = '';

  for (const ch of stripComments(css)) {
    if (ch === '{') {
      if (depth === 0) heads.push(head.trim().replace(/\s+/g, ' '));
      depth += 1;
      head = '';
      continue;
    }
    if (ch === '}') {
      depth -= 1;
      head = '';
      continue;
    }
    if (depth === 0) {
      if (ch === ';')
        head = ''; // `@import …;` — без блока
      else head += ch;
    }
  }

  return heads;
}

/** Конструкции верхнего уровня, которым место в слое. */
export function unlayered(css: string): string[] {
  return topLevelHeads(css).filter((head) => !ALLOWED.test(head));
}

describe('Сторож: globals.css — всё в слоях (аудит 17.09, п. 1)', () => {
  const css = readFileSync(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8');

  it('на верхнем уровне — только @import, :root, @theme, @layer, @font-face, @keyframes', () => {
    expect(unlayered(css)).toEqual([]);
  });

  it('обратная половина: сторож видит настоящие слои и находит правило вне слоя', () => {
    const heads = topLevelHeads(css);
    expect(heads).toContain(':root');
    expect(heads.some((h) => h.startsWith('@layer base'))).toBe(true);
    expect(heads.some((h) => h.startsWith('@layer components'))).toBe(true);
    expect(heads.some((h) => h.startsWith('@theme'))).toBe(true);

    expect(unlayered('* { border-color: red; }')).toEqual(['*']);
    expect(unlayered('.t-eyebrow { color: red; }\n@layer base { h1 { x: 1; } }')).toEqual([
      '.t-eyebrow',
    ]);
    expect(unlayered('@media (min-width: 1px) { .x { a: 1; } }')).toEqual([
      '@media (min-width: 1px)',
    ]);
    expect(
      unlayered("@import 'tailwindcss';\n@keyframes k { to { a: 1; } }\n:root { --a: 1; }"),
    ).toEqual([]);
  });
});
