// Сторож: бренд объявлен один раз — `BRAND_NAME` / `BRAND_WORDMARK` (шаг 38.33).
//
// ⚠️ Зачем. Имя площадки жило в 92 строках 51 файла: заголовки вкладок, шапка,
// подвал, письмо, подписи-заглушки «Спортсмен SportHub». Переименование — правка
// одной константы, если имя объявлено один раз, и охота по 51 файлу, если нет.
// После этого шага любое написание имени вне `packages/domain/src/brand.ts` — красное.
//
// Две половины:
//   (а) старое имя `SportHub` (любым регистром) в КОДЕ вне списка идентификаторов —
//       нарушение: `@sporthub/*`, `sh-session`, `sporthub-map-theme`, `SPORTHUB_*`,
//       `sporthub123`, `@sporthub.local`, имя базы — идентификаторы, их смена
//       разлогинит всех и перепишет 474 импорта ради строки, которую никто не видит;
//       «Администратор SportHub» — данные живого администратора, остаётся (решение
//       заказчика);
//   (б) второе написание нового имени — «ПРОСПОРТ», «ПРО» или «СПОРТ» литералом
//       в кавычках ИЛИ текстом JSX (`<span>ПРО</span>`), любым регистром, и латинское
//       «ProSport» — вне `brand.ts` нарушение: логотип обязан читать `BRAND_WORDMARK`.
//
// Комментарии снимаются до разбора: пояснение «раньше было SportHub» законно.
// Вне проверки — `prisma-client/**` (генерированный), `src/test/**`, `dist`.
// ⚠️ Список старых файлов — только убывает; на день установки пуст.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

const REPO_ROOT = path.resolve(WEB_ROOT, '..', '..');

/** Единственный дом бренда. */
export const BRAND_HOME = 'packages/domain/src/brand.ts';

/** Где искать код. */
const CODE_ROOTS = ['apps/web/src', 'apps/api/src', 'apps/api/prisma', 'packages'];
const SKIPPED =
  /(^|\/)(node_modules|dist|prisma-client|migrations|test|__tests__)(\/|$)|\.test\.[tj]sx?$/;

/** Идентификаторы со старым именем — не бренд, снимаются до поиска. */
export const IDENTIFIERS: RegExp[] = [
  /@sporthub\/[a-z-]+/g, // пакеты монорепозитория
  /__Host-sh-session|sh-session/g, // cookie сессии
  /sporthub-map-theme/g, // ключ localStorage темы карты
  /SPORTHUB_[A-Z_]+/g, // переменные окружения
  /sporthub123|admin-sporthub-\d+/g, // тестовые пароли
  /[\w.-]+@sporthub\.local/g, // тестовые адреса
  /sporthub_(?:postgres|web|api)/g, // контейнеры
  /sporthub-monorepo/g, // имя корневого пакета
  /Администратор SportHub/g, // имя живого администратора — данные
  /(?<=[-U]\s)sporthub\b|(?<=-d\s)sporthub\b|postgresql:\/\/[^\s'"]*sporthub[^\s'"]*/g, // база
];

/** Старое имя в любом написании. */
const OLD_NAME = /sport\s*hub/gi;

/**
 * Второе написание нового имени — два вида. Половины словомарки — ТОЧНО в верхнем
 * регистре: «спорт» строчными в тексте героя («Найди спорт») — обычное слово, а не имя.
 * Целое имя — любым регистром и латиницей: «Проспорт», «ProSport».
 */
const NEW_NAME_LITERAL = /['"`](?:ПРОСПОРТ|ПРО|СПОРТ)['"`]|>\s*(?:ПРОСПОРТ|ПРО|СПОРТ)\s*</g;
const NEW_NAME_LOOSE = /проспорт|pro\s*sport/gi;

/**
 * Старые файлы и потолок вхождений. Только убывает. Пуст с шага 38.33: все 26 файлов
 * переведены на `BRAND_NAME`; комментарий `schema.prisma:1` (38.35, бэкенд) — комментарий,
 * сторож его не считает.
 */
export const LEGACY_CEILINGS: Record<string, number> = {};

// Текст без комментариев: блочных, строчных (до конца строки) и `///` prisma.
// ⚠️ Обычным комментарием, а не JSDoc: пример `*/` внутри JSDoc закрыл бы его сам.
function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Путь в единой форме — со слэшами, от корня репозитория. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Старое имя в коде файла — вне идентификаторов; каждое вхождение. */
export function oldBrandIn(text: string): string[] {
  let body = stripComments(text);

  for (const pattern of IDENTIFIERS) body = body.replace(pattern, '');

  return [...body.matchAll(OLD_NAME)].map((m) => m[0]);
}

/** Литералы нового имени в коде файла — вне `brand.ts`. */
export function newBrandLiteralsIn(relativePath: string, text: string): string[] {
  if (normalize(relativePath) === BRAND_HOME) return [];

  const body = stripComments(text);

  return [
    ...[...body.matchAll(NEW_NAME_LITERAL)].map((m) => m[0]),
    ...[...body.matchAll(NEW_NAME_LOOSE)].map((m) => m[0]),
  ];
}

async function collectCode(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true }).catch(() => []);
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);
    const relative = normalize(path.relative(REPO_ROOT, full));

    if (SKIPPED.test(relative)) continue;

    if (entry.isDirectory()) {
      found.push(...(await collectCode(full)));
      continue;
    }

    if (/\.(ts|tsx|prisma)$/.test(entry.name)) found.push(relative);
  }

  return found;
}

async function allCode(): Promise<string[]> {
  const files: string[] = [];

  for (const root of CODE_ROOTS) files.push(...(await collectCode(path.join(REPO_ROOT, root))));

  return files;
}

describe('Сторож: бренд объявлен один раз (38.33)', () => {
  it('(а) старое имя в коде — только идентификаторы; вне списка старых файлов — ноль', async () => {
    const offenders: string[] = [];

    for (const file of await allCode()) {
      const found = oldBrandIn(await readFile(path.join(REPO_ROOT, file), 'utf8'));
      const ceiling = LEGACY_CEILINGS[file] ?? 0;

      if (found.length > ceiling) offenders.push(`${file}: ${found.length} > ${ceiling}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('(б) новое имя литералом — только в brand.ts', async () => {
    const offenders: string[] = [];

    for (const file of await allCode()) {
      const found = newBrandLiteralsIn(file, await readFile(path.join(REPO_ROOT, file), 'utf8'));

      if (found.length > 0) offenders.push(`${file}: ${found.join(', ')}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов только убывает', async () => {
    const stale: string[] = [];

    for (const [file, ceiling] of Object.entries(LEGACY_CEILINGS)) {
      const text = await readFile(path.join(REPO_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const actual = oldBrandIn(text).length;

      if (actual === 0) stale.push(`${file}: уже чист — запись снять`);
      else if (actual < ceiling)
        stale.push(`${file}: факт ${actual} < потолок ${ceiling} — опустить`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы трёх пакетов, а не пустоту', async () => {
    const files = await allCode();

    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain(BRAND_HOME);
    expect(files).toContain('apps/web/src/app/layout.tsx');
    expect(files).toContain('apps/api/src/auth/password-reset.service.ts');
    expect(files.some((f) => f.includes('prisma-client'))).toBe(false);
    // Дом бренда объявляет оба имени.
    const home = await readFile(path.join(REPO_ROOT, BRAND_HOME), 'utf8');
    expect(home).toContain("BRAND_NAME = 'ПРОСПОРТ'");
    expect(home).toMatch(/BRAND_WORDMARK = \{ lead: 'ПРО', tail: 'СПОРТ' \}/);
  });

  it('сторож видит поломку на подставном тексте', () => {
    // Диверсия д-50: строка со старым именем в компоненте.
    expect(oldBrandIn("title: 'SportHub — Логи'")).toEqual(['SportHub']);
    expect(oldBrandIn('<p>Вход для администратора Sporthub</p>')).toEqual(['Sporthub']);
    // Идентификаторы — не бренд.
    expect(
      oldBrandIn(
        "import { x } from '@sporthub/domain'; const c = 'sh-session'; process.env.SPORTHUB_API_URL; 'admin@sporthub.local'; 'sporthub123'; localStorage.getItem('sporthub-map-theme'); name: 'Администратор SportHub'",
      ),
    ).toEqual([]);
    // Комментарий — не нарушение.
    expect(oldBrandIn('// Глобальные стили SportHub\nconst x = 1;')).toEqual([]);
    // Диверсия д-51: половины литералом вместо BRAND_WORDMARK.
    expect(
      newBrandLiteralsIn(
        'apps/web/src/components/ui/BrandLogo.tsx',
        "<span>{'ПРО'}</span><span>{'СПОРТ'}</span>",
      ),
    ).toEqual(["'ПРО'", "'СПОРТ'"]);
    expect(newBrandLiteralsIn(BRAND_HOME, "export const BRAND_NAME = 'ПРОСПОРТ';")).toEqual([]);
    // Текст JSX между тегами, другой регистр и латиница — тоже второе написание.
    expect(
      newBrandLiteralsIn(
        'apps/web/src/components/ui/BrandLogo.tsx',
        '<span>ПРО</span><span>СПОРТ</span>',
      ),
    ).toEqual(['>ПРО<', '>СПОРТ<']);
    expect(newBrandLiteralsIn('apps/web/src/lib/x.ts', "const t = 'Проспорт';")).toEqual([
      'Проспорт',
    ]);
    // Слово «спорт» строчными в тексте — не половина словомарки.
    expect(
      newBrandLiteralsIn('apps/web/src/app/page.tsx', 'Найди <span>спорт</span> в своём ритме'),
    ).toEqual([]);
    expect(newBrandLiteralsIn('apps/web/src/lib/x.ts', "title: 'ProSport — вход'")).toEqual([
      'ProSport',
    ]);
    // Слово в тексте без кавычек — не второе написание.
    expect(
      newBrandLiteralsIn('apps/web/src/lib/x.ts', 'const t = `${BRAND_NAME} собирает клубы`;'),
    ).toEqual([]);
  });
});
