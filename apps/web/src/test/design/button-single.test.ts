// Сторож: главная кнопка — одна, `ui/Button` (ревью 38.80).
//
// ⚠️ Зачем. Ссылка на страницу обязана быть ссылкой, а выглядеть — кнопкой; до ревью
// её собирали заново: `<Link className="… rounded-button bg-lime … shadow-glow">`
// в карточке карты, в призыве, в шапке. Три копии классов primary-кнопки — три места,
// где перекраска кнопки в `globals.css`/`Button.tsx` не доедет. С 38.80 `Button`
// принимает `href` и сам рисует `next/link` в тех же классах — копиям причины нет.
//
// Что ловится: открывающий тег `<a`, `<Link` или `<button` (кроме самого `ui/Button.tsx`),
// в `className` которого есть вид primary-кнопки — свечение `shadow-glow` вместе
// с display-шрифтом или радиусом кнопки, либо `rounded-button` вместе с заливкой
// `bg-lime`. Сегмент-переключатели с `aria-pressed` светятся тоже, но шрифтом текста
// и радиусом 9 — под правило не попадают.
//
// Обратная половина: сторож обязан видеть свои файлы (призыв, карточка карты, шапка)
// и обязан находить копию в подложенном фрагменте — иначе он зелёный от пустоты.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Единственное место, где классы primary-кнопки законны. */
const BUTTON_FILE = 'src/components/ui/Button.tsx';

/** Открывающий тег ссылки или кнопки — до `>` с учётом скобок в выражениях. */
const TAG_PATTERN = /<(a|Link|button)\b/g;

/** Текст открывающего тега с позиции `<` до парной `>` — скобки и кавычки учитываются. */
function openingTag(text: string, start: number): string {
  let depth = 0;
  let quote: string | null = null;

  for (let i = start; i < text.length; i += 1) {
    const ch = text[i];

    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{') depth += 1;
    else if (ch === '}') depth -= 1;
    else if (ch === '>' && depth === 0) return text.slice(start, i + 1);
  }

  return text.slice(start);
}

/** Признаки вида primary-кнопки в тексте классов тега. */
function looksLikePrimaryButton(tag: string): boolean {
  const classAttr = /className\s*=\s*(?:"[^"]*"|\{[\s\S]*?\}(?=\s*(?:[a-zA-Z-]+\s*=|\/?>)))/.exec(
    tag,
  );
  const classes = classAttr?.[0] ?? '';

  const glow = classes.includes('shadow-glow');
  const buttonShape = classes.includes('rounded-button');
  const display = classes.includes('font-display');
  const fill = /\bbg-lime\b/.test(classes);

  return (glow && (display || buttonShape)) || (buttonShape && fill);
}

/** Теги файла с видом primary-кнопки: `<Link …>` — первые 60 знаков. */
export function primaryLookOffenders(text: string): string[] {
  const offenders: string[] = [];

  for (const match of text.matchAll(TAG_PATTERN)) {
    const tag = openingTag(text, match.index);

    if (looksLikePrimaryButton(tag)) offenders.push(tag.replace(/\s+/g, ' ').slice(0, 60));
  }

  return offenders;
}

/** Обход `.tsx` фронта без тестов. */
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

describe('Сторож: главная кнопка одна — ui/Button (38.80)', () => {
  it('ни одна ссылка и ни одна кнопка вне ui/Button не собирает вид primary-кнопки классами', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    const violations: string[] = [];

    for (const file of files) {
      if (file === BUTTON_FILE) continue;

      const text = await readFile(path.join(WEB_ROOT, file), 'utf8');

      for (const offender of primaryLookOffenders(text)) violations.push(`${file}: ${offender}`);
    }

    expect(violations).toEqual([]);
  });

  it('обратная половина: сторож видит призыв, карточку карты и шапку', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    expect(files).toContain('src/components/home/HomeCta.tsx');
    expect(files).toContain('src/components/map/MapActiveCard.tsx');
    expect(files).toContain('src/components/layout/HeaderUser.tsx');
    expect(files).toContain(BUTTON_FILE);
  });

  it('обратная половина: копия классов primary-кнопки в ссылке находится, сегмент со свечением — нет', () => {
    const copy = `<Link href="/x" className="inline-flex rounded-button bg-lime font-display shadow-glow">
      Подробнее
    </Link>`;
    expect(primaryLookOffenders(copy)).toHaveLength(1);

    const segment = `<button type="button" aria-pressed={active} className={cn('flex-1 rounded-[9px] font-body', active ? 'bg-lime text-ink shadow-glow' : 'text-muted')}>Клубы</button>`;
    expect(primaryLookOffenders(segment)).toEqual([]);

    const plain = `<a href="/clubs/x" className="text-lime-hov underline">Подробнее</a>`;
    expect(primaryLookOffenders(plain)).toEqual([]);
  });
});
