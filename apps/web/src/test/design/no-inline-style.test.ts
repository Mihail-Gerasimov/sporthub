// Сторож: инлайновых стилей нет, кроме названных динамических (шаг 38.9).
//
// ⚠️ Зачем. `style={{ ... }}` — это цвет и размер, написанные мимо токенов и мимо
// Tailwind: их не видит ни перекраска, ни адаптив, ни сторож сырых цветов, если тот
// смотрит только на классы. К фазе 38 таких мест было тринадцать в восьми файлах,
// и лишь у трёх значение вычислялось в рантайме — остальные были статикой, которую
// просто не перевели в класс.
//
// Что законно — исключения ПАРАМИ «файл + свойство», а не файлами: значение,
// которое рождается из данных (`width: 37%` у полосы прогресса, `flexBasis:
// calc(100% / N)` у слайда), в класс не переведёшь без генерации классов. Любое другое
// свойство в том же файле — нарушение: исключение по файлу целиком превратило бы
// `AthleteAchievementsSection.tsx` в место, куда можно писать что угодно.
//
// ⚠️ Список исключений только убывает и обязан быть живым: пара, которой в файле
// уже нет, — красная, иначе «исключение» превращается в разрешение впрок.
//
// ⚠️ `style={переменная}` — тоже инлайновый стиль: содержимое переменной сторож
// прочитать не может, поэтому такая запись краснеет всегда. Так же краснеют спред
// `style={{ ...dynamic }}` и ключи-переменные `'--slot-tone'`: их не сверить с парой.
//
// ⚠️ Императивные стили — тоже инлайновые (ревью 38.13b): `el.style.transform = …`,
// `el.style.cssText = '…'` и `style="…"` внутри HTML-строки для `innerHTML`. Ловятся
// теми же парами «файл + свойство» (`cssText` и `style="` — свойство `<html>`).
// Старые файлы, которые ещё не переписаны, — в `LEGACY_IMPERATIVE` с потолком, только
// убывает: `MainMap.tsx` рисует маркеры и попап строками до 38.80.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Динамические свойства, которым инлайновый стиль разрешён: файл → свойства. */
export const ALLOWED_PAIRS: Record<string, string[]> = {
  // Ширина слайда — `calc(100% / visible)`, `visible` меняется по matchMedia в рантайме;
  // сдвиг трека — императивно из обработчика перетаскивания.
  'src/components/ui/CardSlider.tsx': ['flexBasis', 'transform'],
  // Сдвиг ленты чипов — из rAF-цикла.
  'src/components/ui/ChipMarquee.tsx': ['transform'],
  // Запрет прокрутки страницы под модалкой — на `document.body`, класса там нет.
  'src/components/ui/Modal.tsx': ['overflow'],
  // Полоса прогресса — процент выполнения из данных.
  'src/components/profile/AthleteAchievementsSection.tsx': ['width'],
};

/**
 * Старые файлы с императивными стилями и потолок вхождений. Только убывает:
 * `MainMap.tsx` переписывается на 38.80 (маркеры-капли, карточка снизу).
 */
export const LEGACY_IMPERATIVE: Record<string, number> = {
  'src/components/map/MainMap.tsx': 9,
};

// Текст без комментариев: блочных и строчных (до конца строки).
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Текст между скобкой на позиции `open` и парной ей — с учётом строк и вложенности. */
function balanced(text: string, open: number): string | null {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const stack: string[] = [];
  let quote: string | null = null;

  for (let i = open; i < text.length; i += 1) {
    const ch = text[i];

    if (quote !== null) {
      if (ch === '\\') i += 1;
      else if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') {
      quote = ch;
      continue;
    }

    if (ch in pairs) {
      stack.push(pairs[ch]);
      continue;
    }

    if (ch === '}' || ch === ')' || ch === ']') {
      if (stack.pop() !== ch) return null;
      if (stack.length === 0) return text.slice(open + 1, i);
    }
  }

  return null;
}

/** Имена свойств объектного литерала верхнего уровня: `{ a: 1, b: f(x, y) }` → `a`, `b`. */
function topLevelKeys(objectBody: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let segment = '';

  const flush = () => {
    const trimmed = segment.trim();

    if (trimmed === '') {
      segment = '';
      return;
    }

    const match = trimmed.match(/^(?:['"]?)([A-Za-z_$][\w$-]*)(?:['"]?)\s*:/);

    // Спред, ключ-переменная `[name]` и ключ `'--custom'` — не сверить с парой: offender.
    if (match) keys.push(match[1]);
    else if (trimmed.startsWith('...')) keys.push('<спред>');
    else keys.push(`<ключ ${trimmed.split(':')[0].trim().slice(0, 24)}>`);
    segment = '';
  };

  for (let i = 0; i < objectBody.length; i += 1) {
    const ch = objectBody[i];

    if (quote !== null) {
      segment += ch;
      if (ch === '\\') {
        segment += objectBody[i + 1] ?? '';
        i += 1;
      } else if (ch === quote) quote = null;
      continue;
    }

    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === '{' || ch === '(' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ')' || ch === ']') depth -= 1;
    else if (ch === ',' && depth === 0) {
      flush();
      continue;
    }

    segment += ch;
  }

  flush();

  return keys;
}

/**
 * Инлайновые стили файла, не попавшие в исключения: «свойство» либо `<выражение>`.
 *
 * Отдельной функцией, чтобы проверяемо было, что сторож умеет их видеть.
 */
export function inlineStyleOffenders(relativePath: string, text: string): string[] {
  const file = normalize(relativePath);
  const allowed = new Set(ALLOWED_PAIRS[file] ?? []);
  const body = stripComments(text);
  const offenders: string[] = [];

  // Императивные стили: `el.style.transform = …`, `el.style.cssText = …`.
  for (const match of body.matchAll(/\.style\.(cssText|[a-zA-Z]+)\s*=[^=]/g)) {
    if (!allowed.has(match[1])) offenders.push(match[1]);
  }

  // HTML-строки для `innerHTML`: `style="…"` внутри кавычек шаблона.
  for (const _ of body.matchAll(/style="/g)) {
    if (!allowed.has('<html>')) offenders.push('<html>');
  }

  for (const match of body.matchAll(/\bstyle\s*=\s*\{/g)) {
    const outer = balanced(body, match.index + match[0].length - 1);

    if (outer === null) continue;

    const inner = outer.trim();

    if (!inner.startsWith('{')) {
      offenders.push('<выражение>');
      continue;
    }

    const objectBody = balanced(inner, 0);

    if (objectBody === null) continue;

    for (const key of topLevelKeys(objectBody)) {
      if (!allowed.has(key)) offenders.push(key);
    }
  }

  return offenders;
}

/** Все свойства инлайновых стилей файла — для проверки, что исключения живые. */
export function inlineStyleKeys(text: string): string[] {
  const body = stripComments(text);
  const keys: string[] = [];

  for (const match of body.matchAll(/\bstyle\s*=\s*\{/g)) {
    const outer = balanced(body, match.index + match[0].length - 1);
    const inner = outer?.trim() ?? '';

    if (!inner.startsWith('{')) continue;

    const objectBody = balanced(inner, 0);

    if (objectBody !== null) keys.push(...topLevelKeys(objectBody));
  }

  return keys;
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

    if (!/\.tsx$/.test(entry.name)) continue;

    found.push(normalize(relative));
  }

  return found;
}

describe('Сторож: инлайновых стилей нет, кроме названных пар (38.9)', () => {
  it('ни один компонент не пишет style мимо пар-исключений', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const found = inlineStyleOffenders(file, await readFile(path.join(WEB_ROOT, file), 'utf8'));
      const ceiling = LEGACY_IMPERATIVE[file] ?? 0;

      if (found.length > ceiling)
        offenders.push(`${file}: ${found.join(', ')} (${found.length} > ${ceiling})`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов с императивными стилями только убывает', async () => {
    const stale: string[] = [];

    for (const [file, ceiling] of Object.entries(LEGACY_IMPERATIVE)) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const actual = inlineStyleOffenders(file, text).length;

      if (actual === 0) stale.push(`${file}: уже чист — запись снять`);
      else if (actual < ceiling)
        stale.push(`${file}: факт ${actual} < потолок ${ceiling} — опустить`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('каждая пара-исключение живая: свойство в файле есть', async () => {
    const stale: string[] = [];

    for (const [file, properties] of Object.entries(ALLOWED_PAIRS)) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — пару снять`);
        continue;
      }

      const present = new Set([
        ...inlineStyleKeys(text),
        ...[...stripComments(text).matchAll(/\.style\.(cssText|[a-zA-Z]+)\s*=[^=]/g)].map(
          (m) => m[1],
        ),
        ...(/style="/.test(stripComments(text)) ? ['<html>'] : []),
      ]);

      for (const property of properties) {
        if (!present.has(property)) stale.push(`${file}: «${property}» в файле нет — пару снять`);
      }
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain('src/components/ui/CardSlider.tsx');
    expect(files).toContain('src/components/clubs/ClubCard.tsx');
    expect(files.some((file) => file.startsWith('src/test/'))).toBe(false);
  });

  it('сторож видит инлайновый стиль на подставном тексте', () => {
    // Диверсия д-4: цвет инлайном в карточке клуба.
    expect(
      inlineStyleOffenders(
        'src/components/clubs/ClubCard.tsx',
        "<div style={{ background: '#7ED900' }} />",
      ),
    ).toEqual(['background']);

    // Несколько свойств — каждое названо; вложенные скобки и запятые в значениях не путают.
    expect(
      inlineStyleOffenders(
        'src/components/clubs/ClubCard.tsx',
        "style={{ width: `calc(100% / ${n})`, transform: fn(a, b), color: 'red' }}",
      ),
    ).toEqual(['width', 'transform', 'color']);

    // Разрешённая пара — не нарушение; чужое свойство в том же файле — нарушение.
    expect(
      inlineStyleOffenders(
        'src/components/ui/CardSlider.tsx',
        'style={{ flexBasis: `calc(100% / ${visible})` }}',
      ),
    ).toEqual([]);
    expect(
      inlineStyleOffenders(
        'src/components/ui/CardSlider.tsx',
        "style={{ flexBasis: x, background: 'red' }}",
      ),
    ).toEqual(['background']);

    // Стиль переменной — краснеет всегда: содержимое не прочитать.
    expect(inlineStyleOffenders('src/components/ui/Button.tsx', 'style={buttonStyle}')).toEqual([
      '<выражение>',
    ]);
    // Спред и ключ-переменная — тоже: их не сверить с парой (ревью 38.13b).
    expect(inlineStyleOffenders('src/components/ui/Button.tsx', 'style={{ ...dynamic }}')).toEqual([
      '<спред>',
    ]);
    expect(
      inlineStyleOffenders('src/components/ui/SlotCard.tsx', "style={{ '--slot-tone': tone }}"),
    ).toEqual(["<ключ '--slot-tone'>"]);
    // Императивные стили — свойство узнаётся, пара-исключение действует.
    expect(
      inlineStyleOffenders('src/components/ui/Button.tsx', "el.style.background = '#7ED900';"),
    ).toEqual(['background']);
    expect(
      inlineStyleOffenders(
        'src/components/ui/CardSlider.tsx',
        'rail.style.transform = `translateX(1px)`;',
      ),
    ).toEqual([]);
    expect(
      inlineStyleOffenders('src/components/ui/Button.tsx', "el.style.cssText = 'width:14px';"),
    ).toEqual(['cssText']);
    // Сравнение `el.style.color === x` — не присваивание.
    expect(
      inlineStyleOffenders('src/components/ui/Button.tsx', "if (el.style.color === 'red') {}"),
    ).toEqual([]);
    // HTML-строка для innerHTML со `style="…"`.
    expect(
      inlineStyleOffenders(
        'src/components/ui/Button.tsx',
        'el.innerHTML = `<div style="color:red">x</div>`;',
      ),
    ).toEqual(['<html>']);

    // Комментарий — не нарушение.
    expect(
      inlineStyleOffenders('src/components/ui/Button.tsx', "// style={{ color: 'red' }}"),
    ).toEqual([]);
  });
});
