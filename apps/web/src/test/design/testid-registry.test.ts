// Сторож: ни один контракт разметки главной и каркаса не пропал молча (шаг 38.13a).
//
// ⚠️ Зачем. Перенос на новый вид переписывает разметку 33 страниц, а на разметку
// опираются тесты, слайдер и экранный диктор: `data-testid`, data-атрибуты и подписи
// `aria-label`. Исчезнувший идентификатор — упавший тест в лучшем случае и молча
// сломанный слайдер в худшем. Реестр — приложение А `tests/checklists/phase-38-transfer.md`:
// у каждого контракта статус `остаётся` / `снят` / `переехал`, причина и новое имя.
//
// Три вида контрактов — три половины:
//   (а) `data-testid`: `остаётся` — в коде под тем же именем; `переехал` — под новым,
//       названным в последней колонке; `снят` — код не проверяется, но причина обязана
//       быть названа (в);
//   (б) каждый `data-testid` в ОБЛАСТИ — с записью в реестре: новый идентификатор
//       без строки — красный;
//   (в) у `снят` и `переехал` причина не пустая; у `переехал` названо новое имя.
//   Data-атрибуты и подписи: каждая названная в реестре — в коде; снятая помечается
//   зачёркиванием `~~…~~ (снят: причина)`.
//
// ⚠️ Область — перечень каталогов внутри сторожа, не весь `src`: во всём `src`
// идентификаторов 231, в дереве главной и каркаса — 21. Шаблонные имена
// (`notification-bell-item-{id}` ↔ `` `notification-bell-item-${id}` ``) нормализуются
// до `{…}` с обеих сторон.
//
// ⚠️ Сторож временный: снимается на 38.103 вместе с реестром.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const REPO_ROOT = path.resolve(WEB_ROOT, '..', '..');

/** Реестр переноса; контракты — в приложении А. */
export const REGISTRY_PATH = 'tests/checklists/phase-38-transfer.md';

/** Область: дерево главной и каркаса. Пути от корня приложения. */
export const AREA = [
  'src/app/page.tsx',
  'src/components/home',
  'src/components/clubs',
  'src/components/trainers',
  'src/components/ui',
  'src/components/map',
  'src/components/layout',
  'src/components/search',
  'src/components/schedule',
];

/**
 * Файлы области, которых с главной не достичь: детальные страницы и компоненты
 * кабинетов. Их контракты — не в приложении А (там 21 идентификатор, не 231).
 */
export const OUTSIDE_HOME_TREE = [
  'src/components/clubs/ClubDetailPageClient.tsx',
  'src/components/trainers/TrainerDetailPageClient.tsx',
  'src/components/ui/HiddenPublicationNotice.tsx',
  'src/components/ui/PaginationBar.tsx',
];

export type TestidRow = {
  testid: string;
  status: string;
  reason: string;
  movedTo: string;
};

/** Шаблонная часть имени: `{badge}` в реестре и `${badge}` в коде — одно и то же. */
export function normalizeTemplate(name: string): string {
  return name.replace(/\$?\{[^}]*\}/g, '{}');
}

/** Пустая ли ячейка: прочерк, тире или ничего. */
function isBlank(cell: string): boolean {
  return /^[\s—–-]*$/.test(cell);
}

/** Текст приложения А — от его заголовка до заголовка приложения Б. */
export function appendixA(markdown: string): string {
  const start = markdown.indexOf('# А)');
  const end = markdown.indexOf('# Б)', start);

  return start < 0 ? markdown : markdown.slice(start, end < 0 ? undefined : end);
}

/** Строки таблицы приложения А: 7 ячеек, вторая — testid в обратных кавычках. */
export function parseTestidRows(markdown: string): TestidRow[] {
  const rows: TestidRow[] = [];

  for (const line of appendixA(markdown).split('\n')) {
    if (!line.startsWith('|')) continue;

    const cells = line
      .split('|')
      .slice(1, -1)
      .map((cell) => cell.trim());

    if (cells.length !== 7) continue;

    const testid = cells[1].match(/^`([^`]+)`/);

    if (!testid) continue;

    rows.push({
      testid: testid[1],
      status: cells[4].replace(/\*/g, '').trim(),
      reason: cells[5],
      movedTo: cells[6].replace(/`/g, '').trim(),
    });
  }

  return rows;
}

/** Data-атрибуты из таблицы «Атрибуты-контракты»: все `data-*` в первой ячейке. */
export function parseDataAttributes(markdown: string): { name: string; removed: boolean }[] {
  const found: { name: string; removed: boolean }[] = [];

  for (const line of markdown.split('\n')) {
    if (!line.startsWith('|')) continue;

    const first = line.split('|')[1] ?? '';

    for (const match of first.matchAll(/(~~)?`(data-[a-z-]+)`(~~)?/g)) {
      found.push({ name: match[2], removed: match[1] !== undefined });
    }
  }

  return found;
}

/** Подписи из абзаца «Опоры на текст и подписи»: строки в кавычках внутри обратных. */
export function parseLabels(markdown: string): { label: string; removed: boolean }[] {
  const start = markdown.indexOf('**Опоры на текст и подписи**');

  if (start < 0) return [];

  const paragraph = markdown.slice(start, markdown.indexOf('\n\n', start));
  const found: { label: string; removed: boolean }[] = [];

  for (const match of paragraph.matchAll(/(~~)?`(?:aria-label=)?"([^"]+)"`(~~)?/g)) {
    found.push({ label: match[2], removed: match[1] !== undefined });
  }

  return found;
}

/** Постоянная часть подписи — до шаблонного знака (`N`, `X`, `…`) или развилки `а/б`. */
export function labelPrefix(label: string): string {
  return label.replace(/\s*(\bN\b|\bX\b|…).*$/u, '').replace(/\s+\S*\/\S*$/u, '');
}

/** `data-testid` в тексте — нормализованные имена. */
export function testidsIn(text: string): string[] {
  const found: string[] = [];

  for (const match of text.matchAll(/data-testid=(?:"([^"]+)"|\{`([^`]+)`\})/g)) {
    found.push(normalizeTemplate(match[1] ?? match[2]));
  }

  return found;
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Файлы области. */
async function areaFiles(): Promise<string[]> {
  const found: string[] = [];

  async function walk(directory: string) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);

      if (entry.isDirectory()) await walk(full);
      else if (/\.tsx?$/.test(entry.name)) found.push(normalize(path.relative(WEB_ROOT, full)));
    }
  }

  for (const item of AREA) {
    const full = path.join(WEB_ROOT, item);

    if (item.endsWith('.tsx') || item.endsWith('.ts')) found.push(item);
    else await walk(full);
  }

  return found.filter((file) => !OUTSIDE_HOME_TREE.includes(file));
}

/** Весь код области одной строкой — контракты ищутся по нему. */
async function areaText(): Promise<{ files: string[]; text: string }> {
  const files = await areaFiles();
  const parts: string[] = [];

  for (const file of files) parts.push(await readFile(path.join(WEB_ROOT, file), 'utf8'));

  return { files, text: parts.join('\n') };
}

async function readRegistry(): Promise<string> {
  return readFile(path.join(REPO_ROOT, REGISTRY_PATH), 'utf8');
}

describe('Сторож: реестр контрактов разметки (38.13a)', () => {
  it('(а) «остаётся» — в коде под тем же именем, «переехал» — под новым', async () => {
    const rows = parseTestidRows(await readRegistry());
    const present = new Set(testidsIn((await areaText()).text));
    const missing: string[] = [];

    expect(rows.length).toBeGreaterThan(15);

    for (const row of rows) {
      if (row.status === 'остаётся' && !present.has(normalizeTemplate(row.testid))) {
        missing.push(`${row.testid}: «остаётся», а в коде нет`);
      }

      if (row.status === 'переехал' && !present.has(normalizeTemplate(row.movedTo))) {
        missing.push(`${row.testid}: «переехал → ${row.movedTo}», а нового имени в коде нет`);
      }
    }

    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('(б) каждый data-testid в области записан в реестре', async () => {
    const known = new Set(
      parseTestidRows(await readRegistry()).map((row) => normalizeTemplate(row.testid)),
    );
    const moved = new Set(
      parseTestidRows(await readRegistry())
        .filter((row) => row.status === 'переехал')
        .map((row) => normalizeTemplate(row.movedTo)),
    );
    const unregistered: string[] = [];

    for (const file of await areaFiles()) {
      for (const testid of testidsIn(await readFile(path.join(WEB_ROOT, file), 'utf8'))) {
        if (!known.has(testid) && !moved.has(testid)) unregistered.push(`${file}: ${testid}`);
      }
    }

    expect(unregistered, unregistered.join('\n')).toEqual([]);
  });

  it('(в) у «снят» причина названа; у «переехал» — причина и новое имя', async () => {
    const bad: string[] = [];

    for (const row of parseTestidRows(await readRegistry())) {
      if (!['остаётся', 'снят', 'переехал'].includes(row.status)) {
        bad.push(`${row.testid}: неизвестный статус «${row.status}»`);
      }

      if ((row.status === 'снят' || row.status === 'переехал') && isBlank(row.reason)) {
        bad.push(`${row.testid}: «${row.status}» без причины`);
      }

      if (row.status === 'переехал' && isBlank(row.movedTo)) {
        bad.push(`${row.testid}: «переехал», а куда — не названо`);
      }
    }

    expect(bad, bad.join('\n')).toEqual([]);
  });

  it('data-атрибуты и подписи из реестра есть в коде, если не зачёркнуты', async () => {
    const registry = await readRegistry();
    const { text } = await areaText();
    const missing: string[] = [];
    const attributes = parseDataAttributes(registry);
    const labels = parseLabels(registry);

    expect(attributes.length).toBeGreaterThan(5);
    expect(labels.length).toBeGreaterThan(10);

    for (const { name, removed } of attributes) {
      if (!removed && !new RegExp(`\\b${name}(?![\\w-])`).test(text))
        missing.push(`атрибут ${name}`);
    }

    for (const { label, removed } of labels) {
      if (!removed && !text.includes(labelPrefix(label))) missing.push(`подпись «${label}»`);
    }

    expect(missing, missing.join('\n')).toEqual([]);
  });

  it('сторож читает настоящую область, а не пустоту', async () => {
    const { files, text } = await areaText();

    expect(files.length).toBeGreaterThan(30);
    expect(files).toContain('src/components/clubs/ClubCard.tsx');
    expect(files).toContain('src/app/page.tsx');
    expect(files.some((file) => file.startsWith('src/components/profile'))).toBe(false);
    expect(testidsIn(text).length).toBeGreaterThan(15);
  });

  it('сторож видит подмену на подставном тексте', () => {
    // Шаблоны сходятся с обеих сторон.
    expect(normalizeTemplate('notification-bell-item-{id}')).toBe('notification-bell-item-{}');
    expect(testidsIn('data-testid={`notification-bell-item-${n.id}`}')).toEqual([
      'notification-bell-item-{}',
    ]);
    expect(testidsIn('data-testid="club-card"')).toEqual(['club-card']);

    // Строка реестра разбирается со статусом, причиной и новым именем.
    const row =
      '| 2 | `club-card` | `x.tsx:1` | да | переехал | карточка витрины | `catalog-club-card` |';

    expect(parseTestidRows(row)).toEqual([
      {
        testid: 'club-card',
        status: 'переехал',
        reason: 'карточка витрины',
        movedTo: 'catalog-club-card',
      },
    ]);
    // Пустая причина — узнаётся (диверсия д-15).
    expect(isBlank('—')).toBe(true);
    expect(isBlank('решение заказчика')).toBe(false);

    // Атрибуты: два в одной ячейке, зачёркнутый помечен.
    expect(
      parseDataAttributes(
        '| `data-card-slider-dot` + `data-active` | x | y |\n| ~~`data-old`~~ | x | y |',
      ),
    ).toEqual([
      { name: 'data-card-slider-dot', removed: false },
      { name: 'data-active', removed: false },
      { name: 'data-old', removed: true },
    ]);

    // Подписи: шаблонная часть отрезается.
    expect(labelPrefix('Слайд N')).toBe('Слайд');
    expect(labelPrefix('Рейтинг: X из 5')).toBe('Рейтинг:');
    expect(labelPrefix('Перейти в кабинет: …')).toBe('Перейти в кабинет:');
    expect(labelPrefix('Основная навигация')).toBe('Основная навигация');
    expect(labelPrefix('Прокрутить популярные клубы влево/вправо')).toBe(
      'Прокрутить популярные клубы',
    );
    // Строки основного реестра (не приложения А) за контракты не принимаются.
    expect(
      parseTestidRows(
        '| 75 | `MapPreviewSection` | `x` | y | нет | ВЫКИНУТЬ | z |\n# А)\n| 1 | `a` | `x` | y | остаётся | — | — |\n# Б)\n| 2 | `b` | `x` | y | нет | z | w |',
      ).map((r) => r.testid),
    ).toEqual(['a']);
  });
});
