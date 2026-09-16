// Сторож: яркий зелёный — заливка и текст на плашке; на светлом — тёмно-зелёный (шаг 38.14a).
//
// ⚠️ Зачем. После перекраски `#7ed900` стал ярче mint, и яркий зелёный ТЕКСТ на белом
// (eyebrow «Сегодня в фокусе», счётчики, ховеры навигации) дал контраст 1,9:1 — нечитаем.
// Дизайн различает заливку (`#7ED900`) и текст на светлом (`#3a7000`): у нас это
// `--ui-lime` и `--ui-lime-hov`. Правило одно: `text-lime` / `text-accent` (и их
// `hover:`/`focus:`-формы, и `text-[var(--ui-lime)]`) допустимы ТОЛЬКО у элемента,
// который сам или через предка в том же файле стоит на `bg-plate` / `bg-lime`;
// на светлом — `text-lime-hov` / `text-accent-strong`.
//
// Вторая половина — прозрачность на плашке: `opacity-NN` на тексте внутри `bg-lime` /
// `bg-plate` роняет контраст ниже любого порога (слово «от» на лаймовой плашке цены —
// 1,64:1). На плашке текст приглушается только `text-plate-muted`, не прозрачностью.
//
// Как узнаётся предок — лёгкий разбор JSX: открывающие теги с `className` кладутся
// в стек, закрывающие снимают. Компонент, который рисуется ВНУТРИ плашки другого
// файла (лента видов спорта в герое), назван в `RENDERED_ON_PLATE` — сторож границы
// файла не видит. Комментарии снимаются до разбора.
//
// ⚠️ Список старых файлов с потолками — только убывает.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Компоненты, чей корень стоит на плашке другого файла. */
export const RENDERED_ON_PLATE: string[] = ['src/components/home/HeroSportMarquee.tsx'];

/**
 * Логотип — знак, а не текст: зелёная половина словомарки и зелёный бегун — фирменный
 * цвет марки, макет держит его и на белой шапке. Контраст текста к нему не применяется.
 */
export const BRAND_MARK: string[] = ['src/components/ui/BrandLogo.tsx'];

/** Старые файлы и потолок нарушений. Только убывает. */
export const LEGACY_CEILINGS: Record<string, number> = {};

/** Яркий зелёный как цвет текста — все формы, с вариантами состояний. */
const GREEN_TEXT =
  /(?<![\w-])(?:(?:hover|focus|focus-visible|group-hover|active):)?text-(?:lime|accent|\[var\(--ui-(?:lime|accent)\)\])(?![\w-])/;

/** Поверхности, на которых яркий зелёный текст читаем. */
const PLATE = /(?<![\w-])bg-(?:plate|lime|\[var\(--ui-(?:plate|lime)\)\])(?![\w-])/;

/** Прозрачность текста. */
const OPACITY = /(?<![\w-])opacity-\d+(?![\w-])/;

// Текст без комментариев: блочных и строчных (до конца строки).
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Все `className=...` тега — строка, шаблон или выражение с условиями. */
function classesOf(tag: string): string {
  return [...tag.matchAll(/className=(?:"([^"]*)"|\{([\s\S]*?)\}(?=\s|>|\/))/g)]
    .map((m) => m[1] ?? m[2] ?? '')
    .join(' ');
}

/**
 * Нарушения в тексте файла: яркий зелёный текст не на плашке и прозрачность на плашке.
 *
 * Отдельной функцией, чтобы проверяемо было, что сторож умеет их видеть.
 */
export function greenTextOffenders(relativePath: string, text: string): string[] {
  const file = normalize(relativePath);
  const body = stripComments(text);
  const offenders: string[] = [];
  // Стек предков: сколько из них — плашки.
  const stack: boolean[] = [];
  let plateDepth = RENDERED_ON_PLATE.includes(file) || BRAND_MARK.includes(file) ? 1 : 0;

  // Теги JSX по порядку: открывающие, закрывающие, самозакрывающиеся.
  const tags = body.matchAll(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g);

  for (const match of tags) {
    const tag = match[0];

    if (tag.startsWith('</')) {
      if (stack.pop()) plateDepth -= 1;
      continue;
    }

    const classes = classesOf(tag);
    const onPlate = plateDepth > 0 || PLATE.test(classes);
    const selfPlate = PLATE.test(classes);
    const line = body.slice(0, match.index).split('\n').length;

    if (GREEN_TEXT.test(classes) && !onPlate) {
      offenders.push(`строка ${line}: зелёный текст на светлом — ${classes.match(GREEN_TEXT)![0]}`);
    }

    if (OPACITY.test(classes) && plateDepth > 0 && !selfPlate) {
      offenders.push(`строка ${line}: ${classes.match(OPACITY)![0]} на тексте внутри плашки`);
    }

    if (!tag.endsWith('/>')) {
      stack.push(selfPlate);
      if (selfPlate) plateDepth += 1;
    }
  }

  return offenders;
}

/** Обход `.tsx` фронта; тесты не в счёт. */
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

    if (/\.tsx$/.test(entry.name)) found.push(normalize(relative));
  }

  return found;
}

describe('Сторож: зелёный текст только на плашке (38.14a)', () => {
  it('ни в одном компоненте яркий зелёный текст не стоит на светлом, прозрачность — не на плашке', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const found = greenTextOffenders(file, await readFile(path.join(WEB_ROOT, file), 'utf8'));
      const ceiling = LEGACY_CEILINGS[file] ?? 0;

      if (found.length > ceiling)
        offenders.push(`${file}: ${found.length} > ${ceiling}\n    ${found.join('\n    ')}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов только убывает', async () => {
    const stale: string[] = [];

    for (const [file, ceiling] of Object.entries(LEGACY_CEILINGS)) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const actual = greenTextOffenders(file, text).length;

      if (actual === 0) stale.push(`${file}: уже чист — запись снять`);
      else if (actual < ceiling)
        stale.push(`${file}: факт ${actual} < потолок ${ceiling} — опустить`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/app/page.tsx');
    expect(files).toContain('src/components/layout/MobileNav.tsx');
    for (const file of [...RENDERED_ON_PLATE, ...BRAND_MARK]) expect(files).toContain(file);
  });

  it('сторож видит нарушение и не путает плашку на подставном тексте', () => {
    const file = 'src/components/x/Y.tsx';

    // Зелёный текст на светлом — нарушение, в том числе ховер и произвольное значение.
    expect(greenTextOffenders(file, '<p className="text-lime">x</p>')).toHaveLength(1);
    expect(greenTextOffenders(file, '<a className="text-ink hover:text-lime">x</a>')).toHaveLength(
      1,
    );
    expect(
      greenTextOffenders(file, '<a className="hover:text-[var(--ui-lime)]">x</a>'),
    ).toHaveLength(1);
    // Тёмно-зелёный — законно; `text-lime-soft`/`bg-lime` — не текст.
    expect(greenTextOffenders(file, '<p className="text-lime-hov bg-lime-soft">x</p>')).toEqual([]);
    // На плашке — самом элементе или предке — законно.
    expect(
      greenTextOffenders(
        file,
        '<section className="bg-plate"><h1 className="text-lime">x</h1></section>',
      ),
    ).toEqual([]);
    expect(greenTextOffenders(file, '<span className="bg-lime text-lime">x</span>')).toEqual([]);
    // Предок закрылся — снова светлый фон.
    expect(
      greenTextOffenders(
        file,
        '<section className="bg-plate"><p>x</p></section>\n<p className="text-lime">y</p>',
      ),
    ).toHaveLength(1);
    // Самозакрывающийся тег плашки предком не становится.
    expect(
      greenTextOffenders(file, '<div className="bg-plate" />\n<p className="text-lime">y</p>'),
    ).toHaveLength(1);
    // Условные классы в фигурных скобках тоже читаются.
    expect(
      greenTextOffenders(file, "<p className={cn('text-ink', active && 'text-lime')}>x</p>"),
    ).toHaveLength(1);
    // Прозрачность на тексте внутри плашки — нарушение; на самой плашке — нет.
    expect(
      greenTextOffenders(
        file,
        '<span className="bg-lime"><span className="opacity-70">от</span></span>',
      ),
    ).toEqual(['строка 1: opacity-70 на тексте внутри плашки']);
    expect(greenTextOffenders(file, '<span className="bg-lime opacity-90">от</span>')).toEqual([]);
    expect(greenTextOffenders(file, '<span className="opacity-70">от</span>')).toEqual([]);
    // Компонент, живущий на плашке другого файла, — законно.
    expect(
      greenTextOffenders(RENDERED_ON_PLATE[0], '<span className="text-lime">x</span>'),
    ).toEqual([]);
    // Комментарий — не нарушение.
    expect(greenTextOffenders(file, '{/* <p className="text-lime">x</p> */}')).toEqual([]);
  });
});
