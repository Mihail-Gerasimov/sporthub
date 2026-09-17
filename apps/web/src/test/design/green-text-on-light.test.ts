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
// файла (счётчики и подзаголовок в герое), назван в `RENDERED_ON_PLATE` — сторож границы
// файла не видит. Комментарии снимаются до разбора.
//
// Третья половина (ревью 38.79c): ТЁМНО-зелёный на плашке — `text-lime-hov` внутри
// `bg-plate` даёт 3,1:1 — тоже красный; на плашке зелёный текст — яркий `text-lime`.
// И класс типографики (`.t-*` в `globals.css`) цвета не несёт: `.t-eyebrow { color }`
// побивал утилиту `text-lime` призыва каскадом, а сторож классов каскада не видит.
//
// ⚠️ Список старых файлов с потолками — только убывает.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Компоненты, чей корень стоит на плашке другого файла. */
export const RENDERED_ON_PLATE: string[] = [
  // Ряд счётчиков — слот `counters` героя (38.69), рисуется на его плашке.
  'src/components/home/HomeCounters.tsx',
];

/**
 * Логотип — знак, а не текст: зелёная половина словомарки и зелёный бегун — фирменный
 * цвет марки, макет держит его и на белой шапке. Контраст текста к нему не применяется.
 */
export const BRAND_MARK: string[] = ['src/components/ui/BrandLogo.tsx'];

/**
 * Значки — графика, а не текст (38.110, 38.71): яркий зелёный красит SVG-иконку 22px
 * на белом квадрате, как `GREEN` макета у плиток «Возможности» и шагов; правило
 * контраста текста к рисунку не применяется (как и к `hue-sky`, 2,8:1). Исключение
 * названо здесь, а не спрятано за переменной или одним словом в строке классов;
 * обратная половина ниже — в каждом файле списка есть `<svg`.
 */
export const ICON_GREEN: string[] = [
  'src/components/home/HomeFeatures.tsx',
  'src/components/home/HomeSteps.tsx',
];

/** Старые файлы и потолок нарушений. Только убывает. */
export const LEGACY_CEILINGS: Record<string, number> = {};

/**
 * Яркая заливка как цвет текста — все формы, с вариантами состояний: лайм и оранжевый
 * (38.14a: `--ui-orange` текстом — 2,8:1 на белом, `--ui-orange-hov` — 3,6; на светлом
 * текст — `text-orange-text`). На тёмной плашке оба читаемы (оранжевый — 6,9:1).
 */
const GREEN_TEXT =
  /(?<![\w-])(?:(?:hover|focus|focus-visible|group-hover|active):)?text-(?:lime|accent|orange|orange-hov|\[var\(--ui-(?:lime|accent|orange|orange-hov)\)\])(?![\w-])/;

/**
 * Поверхности, на которых яркий зелёный текст читаем. `bg-lime/10` — мягкая подложка,
 * не плашка: модификатор прозрачности исключён (ревью 38.79c нашёл дыру).
 */
const PLATE = /(?<![\w-])bg-(?:plate|lime|\[var\(--ui-(?:plate|lime)\)\])(?![\w\-/])/;

/** Лаймовая заливка — отдельно от тёмной плашки: светлый текст на ней нечитаем (1,64:1). */
const LIME = /(?<![\w-])bg-(?:lime|\[var\(--ui-lime\)\])(?![\w\-/])/;

/** Светлый текст — цвета холста и белого: на плашке верно, на лайме — нет. */
const LIGHT_TEXT =
  /(?<![\w-])text-(?:bg|card|plate-ink|\[var\(--ui-(?:bg|card|plate-ink)\)\])(?![\w-])/;

/** Тёмно-зелёный как цвет текста — на плашке нечитаем (3,1:1). */
const DARK_GREEN_TEXT =
  /(?<![\w-])(?:(?:hover|focus|focus-visible|group-hover|active):)?text-(?:lime-hov|accent-strong|\[var\(--ui-(?:lime-hov|accent-strong)\)\])(?![\w-])/;

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
  // Стек предков: сколько из них — плашки; отдельно — сколько лаймовых заливок.
  const stack: boolean[] = [];
  const limeStack: boolean[] = [];
  let plateDepth = RENDERED_ON_PLATE.includes(file) || BRAND_MARK.includes(file) ? 1 : 0;
  // Значки: яркий зелёный допустим только у тега, который оборачивает рисунок — следом
  // идёт `<svg` или выражение с иконкой (`{icons[…]}`); текст в тех же файлах проверяется.
  const iconFile = ICON_GREEN.includes(file);
  let limeDepth = 0;

  // Теги JSX по порядку: открывающие, закрывающие, самозакрывающиеся.
  const tags = body.matchAll(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g);

  for (const match of tags) {
    const tag = match[0];

    if (tag.startsWith('</')) {
      if (stack.pop()) plateDepth -= 1;
      if (limeStack.pop()) limeDepth -= 1;
      continue;
    }

    const classes = classesOf(tag);
    const onPlate = plateDepth > 0 || PLATE.test(classes);
    const selfPlate = PLATE.test(classes);
    const selfLime = LIME.test(classes);
    const line = body.slice(0, match.index).split('\n').length;

    const wrapsIcon =
      iconFile &&
      /^\s*(?:<svg\b|\{[^}]*icons?\b[^}]*\})/i.test(
        body.slice(match.index + tag.length, match.index + tag.length + 160),
      );

    if (GREEN_TEXT.test(classes) && !onPlate && !wrapsIcon) {
      offenders.push(
        `строка ${line}: цвет заливки текстом на светлом — ${classes.match(GREEN_TEXT)![0]}`,
      );
    }

    // Тёмно-зелёный внутри плашки. У самого элемента-плашки — только при литеральном
    // `className="…"`: в тернарии `active ? 'bg-lime …' : '… hover:text-lime-hov'` фон
    // и тёмный текст живут в разных ветках, и сторож без вычисления ветки промолчит.
    const literalClasses = /className="/.test(tag);
    if (DARK_GREEN_TEXT.test(classes) && (plateDepth > 0 || (selfPlate && literalClasses))) {
      offenders.push(
        `строка ${line}: тёмно-зелёный текст на плашке — ${classes.match(DARK_GREEN_TEXT)![0]}`,
      );
    }

    // Светлый текст на лаймовой заливке (пилюля «Сегодня»: `text-bg` на `bg-lime` — 1,64:1).
    if (LIGHT_TEXT.test(classes) && (limeDepth > 0 || (selfLime && literalClasses))) {
      offenders.push(
        `строка ${line}: светлый текст на лаймовой заливке — ${classes.match(LIGHT_TEXT)![0]}`,
      );
    }

    if (OPACITY.test(classes) && plateDepth > 0 && !selfPlate) {
      offenders.push(`строка ${line}: ${classes.match(OPACITY)![0]} на тексте внутри плашки`);
    }

    if (!tag.endsWith('/>')) {
      stack.push(selfPlate);
      if (selfPlate) plateDepth += 1;
      limeStack.push(selfLime);
      if (selfLime) limeDepth += 1;
    }
  }

  // Строки классов ВНЕ тегов — константы и тернарии (`accent === 'lime' ? … : 'bg-orange-soft
  // text-orange'`): предка у них нет, и раньше сторож их не видел (диверсия д-Z осталась
  // зелёной). Строка с цветом заливки текстом и без своей плашки — красная; строка
  // с плашкой (`'bg-plate text-lime'`) — нет. Файлы на плашке чужого файла — исключены.
  if (!RENDERED_ON_PLATE.includes(file) && !BRAND_MARK.includes(file)) {
    const outsideTags = body.replace(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g, ' ');

    for (const literal of outsideTags.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
      const text = literal[2];

      if (!/\s/.test(text.trim())) continue; // одно слово — не строка классов
      if (!GREEN_TEXT.test(text) || PLATE.test(text)) continue;

      const line = body.slice(0, literal.index).split('\n').length;
      offenders.push(
        `строка ${line}: цвет заливки текстом в строке классов вне тега — ${text.match(GREEN_TEXT)![0]}`,
      );
    }
  }

  return offenders;
}

/**
 * Стоит ли тег `<Name` в тексте файла на плашке: ребёнком элемента с `bg-plate`
 * (по тому же стеку предков) или значением пропса у компонента-плашки —
 * `<HomeHero counters={<HomeCounters />} />`, где `isPlate('HomeHero')` — в файле
 * героя корень на `bg-plate`. Обратная половина записи в `RENDERED_ON_PLATE`
 * (ревью 38.69): запись — заявление, и без этой проверки она держалась бы на слове.
 */
export function standsOnPlate(text: string, name: string, isPlate: (host: string) => boolean) {
  const body = stripComments(text);
  const tagPattern = new RegExp(`<${name}(?![\\w$])`, 'g');

  for (const usage of body.matchAll(tagPattern)) {
    const at = usage.index;

    // Пропс компонента-плашки: от `<Host` до его `>` на нулевой глубине скобок
    // тег `<Name` ещё внутри атрибутов.
    for (const host of body.slice(0, at).matchAll(/<([A-Z][\w.]*)(?![\w$])/g)) {
      if (!isPlate(host[1])) continue;

      let depth = 0;
      let cursor = host.index + host[0].length;

      while (cursor < body.length) {
        const char = body[cursor];

        if (char === '{') depth += 1;
        else if (char === '}') depth -= 1;
        else if (char === '>' && depth === 0) break;
        cursor += 1;
      }

      if (cursor > at) return true;
    }

    // Ребёнок элемента с `bg-plate` — стек предков по тегам до места употребления.
    const stack: boolean[] = [];
    let plateDepth = 0;

    for (const match of body.slice(0, at).matchAll(/<\/?[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g)) {
      const tag = match[0];

      if (tag.startsWith('</')) {
        if (stack.pop()) plateDepth -= 1;
        continue;
      }

      if (tag.endsWith('/>')) continue;

      const selfPlate = PLATE.test(classesOf(tag));

      stack.push(selfPlate);
      if (selfPlate) plateDepth += 1;
    }

    if (plateDepth > 0) return true;
  }

  return false;
}

/**
 * Компонент — плашка, если его КОРЕНЬ стоит на `bg-plate`/`bg-lime`: первый тег
 * файла с `className`. Не «где-то в файле есть `bg-lime`»: у героя лаймовый бейдж
 * внутри, у карточки — тоже, и по нему карточка стала бы плашкой.
 */
export function isPlateComponent(text: string): boolean {
  for (const match of stripComments(text).matchAll(/<[A-Za-z][\w.]*(?:\s[^<>]*?)?\/?>/g)) {
    const classes = classesOf(match[0]);

    if (classes !== '') return PLATE.test(classes);
  }

  return false;
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

/** Классы типографики `.t-*` в globals.css, несущие `color`: цвет — утилитой по контексту. */
export function typographyClassesWithColor(css: string): string[] {
  const found: string[] = [];

  for (const match of css.matchAll(/(\.t-[\w-]+)\s*\{([^{}]*)\}/g)) {
    if (/(^|[\s;])color\s*:/.test(match[2])) found.push(match[1]);
  }

  return found;
}

describe('Сторож: зелёный текст только на плашке (38.14a)', () => {
  it('классы типографики .t-* не несут цвета — каскад бил бы утилиту цвета по контексту', async () => {
    const css = stripComments(await readFile(path.join(WEB_ROOT, 'src/app/globals.css'), 'utf8'));
    expect(typographyClassesWithColor(css)).toEqual([]);
    // Обратная половина: подставной класс с цветом находится.
    expect(typographyClassesWithColor('.t-eyebrow { font-size: 11px; color: red; }')).toEqual([
      '.t-eyebrow',
    ]);
  });

  it('обратная половина: тёмно-зелёный на плашке находится, на светлом — нет', () => {
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<section className="bg-plate"><p className="t-eyebrow text-lime-hov">x</p></section>',
      ),
    ).toHaveLength(1);
    expect(
      greenTextOffenders('src/x/Y.tsx', '<section><p className="text-lime-hov">x</p></section>'),
    ).toEqual([]);
    // Мягкая подложка `bg-lime/10` — не плашка: тёмно-зелёный на ней читаем.
    expect(
      greenTextOffenders('src/x/Y.tsx', '<span className="bg-lime/10 text-lime-hov">x</span>'),
    ).toEqual([]);
    // Строка классов вне тега (константа, тернарий) с цветом заливки текстом — красная.
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        "const counter = accent === 'lime' ? 'bg-lime-soft text-lime-hov' : 'bg-orange-soft text-orange';",
      ),
    ).toHaveLength(1);
    expect(greenTextOffenders('src/x/Y.tsx', "const plate = 'bg-plate text-lime';")).toEqual([]);
    // Оранжевый текстом на светлом — красный; на плашке (LIVE) — верный; `text-orange-text` — нет.
    expect(
      greenTextOffenders('src/x/Y.tsx', '<span className="bg-orange-soft text-orange">x</span>'),
    ).toHaveLength(1);
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<div className="bg-plate"><b className="text-orange">LIVE</b></div>',
      ),
    ).toEqual([]);
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<span className="bg-orange-soft text-orange-text">x</span>',
      ),
    ).toEqual([]);
    // Светлый текст на лайме — красный (пилюля «Сегодня»); на тёмной плашке — верный.
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<span className="rounded-full bg-lime text-bg">Сегодня</span>',
      ),
    ).toHaveLength(1);
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<div className="bg-lime"><b className="text-card">x</b></div>',
      ),
    ).toHaveLength(1);
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<div className="bg-plate"><b className="text-plate-ink">x</b></div>',
      ),
    ).toEqual([]);
    // Сам элемент-плашка с литеральным классом — красный; в тернарии — нет.
    expect(
      greenTextOffenders('src/x/Y.tsx', '<span className="bg-lime text-lime-hov">x</span>'),
    ).toHaveLength(1);
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        "<a className={active ? 'bg-lime text-ink' : 'hover:text-lime-hov'}>x</a>",
      ),
    ).toEqual([]);
    expect(
      greenTextOffenders(
        'src/x/Y.tsx',
        '<section className="bg-plate"><p className="text-lime">x</p></section>',
      ),
    ).toEqual([]);
  });

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

  it('каждая запись RENDERED_ON_PLATE подтверждена: её тег стоит на плашке в другом файле', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    const texts = new Map<string, string>();

    for (const file of files) texts.set(file, await readFile(path.join(WEB_ROOT, file), 'utf8'));

    // Компонент — плашка по корню своего файла (файл — по имени тега).
    const isPlate = (host: string) => {
      const file = files.find((candidate) => candidate.endsWith(`/${host}.tsx`));

      return file !== undefined && isPlateComponent(texts.get(file) ?? '');
    };
    const unproven: string[] = [];

    for (const entry of RENDERED_ON_PLATE) {
      const name = path.basename(entry, '.tsx');
      const proven = files.some(
        (file) => file !== entry && standsOnPlate(texts.get(file) ?? '', name, isPlate),
      );

      if (!proven) unproven.push(`${entry}: ни один файл не рисует <${name}> на bg-plate`);
    }

    expect(unproven, unproven.join('\n')).toEqual([]);
  });

  it('обратная проверка видит плашку и не видит её на подставном тексте', () => {
    const isPlate = (host: string) => host === 'HomeHero';

    // Пропс компонента-плашки — да; пропс обычного компонента — нет.
    expect(standsOnPlate('<HomeHero counters={<HomeCounters />} />', 'HomeCounters', isPlate)).toBe(
      true,
    );
    expect(standsOnPlate('<Card counters={<HomeCounters />} />', 'HomeCounters', isPlate)).toBe(
      false,
    );
    // Ребёнок элемента на `bg-plate` — да; закрытая плашка выше — нет.
    expect(
      standsOnPlate('<div className="bg-plate"><HomeCounters /></div>', 'HomeCounters', isPlate),
    ).toBe(true);
    expect(
      standsOnPlate(
        '<div className="bg-plate">x</div>\n<div><HomeCounters /></div>',
        'HomeCounters',
        isPlate,
      ),
    ).toBe(false);
    // Пропс плашки закрылся до тега — нет; упоминание в импорте — не тег.
    expect(standsOnPlate('<HomeHero /> <HomeCounters />', 'HomeCounters', isPlate)).toBe(false);
    expect(standsOnPlate("import { HomeCounters } from './x';", 'HomeCounters', isPlate)).toBe(
      false,
    );
    // Плашка — по корню файла: бейдж `bg-lime` внутри карточки плашкой её не делает.
    expect(
      isPlateComponent(
        '<section className="bg-plate"><span className="bg-lime">x</span></section>',
      ),
    ).toBe(true);
    expect(
      isPlateComponent('<article className="bg-card"><span className="bg-lime">x</span></article>'),
    ).toBe(false);
    expect(isPlateComponent('<Fragment><p className="text-ink">x</p></Fragment>')).toBe(false);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/app/page.tsx');
    expect(files).toContain('src/components/layout/MobileNav.tsx');
    for (const file of [...RENDERED_ON_PLATE, ...BRAND_MARK, ...ICON_GREEN]) {
      expect(files).toContain(file);
    }
  });

  it('файлы ICON_GREEN красят зелёным графику: в каждом есть значок', async () => {
    for (const file of ICON_GREEN) {
      const text = stripComments(await readFile(path.join(WEB_ROOT, file), 'utf8'));

      // Значки — либо `<svg` в самом файле, либо из общего файла иконок (`LUCIDE[…]`, 38.117).
      expect(text, `${file}: значков нет — исключение без предмета`).toMatch(/<svg\b|\bLUCIDE\[/);
      expect(text, `${file}: ярко-зелёного нет — запись снять`).toMatch(
        /(?<![\w-])text-lime(?![\w-])/,
      );
    }
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
    // Значок в файле ICON_GREEN — законно только у тега, оборачивающего рисунок;
    // текст в том же файле — по-прежнему нарушение.
    expect(
      greenTextOffenders(
        ICON_GREEN[0],
        '<span className="text-lime"><svg aria-hidden="true" /></span>',
      ),
    ).toEqual([]);
    expect(
      greenTextOffenders(ICON_GREEN[0], '<span className="text-lime">{icons[key]}</span>'),
    ).toEqual([]);
    expect(greenTextOffenders(ICON_GREEN[0], '<p className="text-lime">x</p>')).toHaveLength(1);
    // Вне списка тот же тег со значком — нарушение: исключение поимённое.
    expect(
      greenTextOffenders(file, '<span className="text-lime"><svg aria-hidden="true" /></span>'),
    ).toHaveLength(1);
  });
});
