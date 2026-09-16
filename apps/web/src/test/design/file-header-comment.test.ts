// Сторож: у каждого файла — шапка-комментарий на русском (шаг 38.13).
//
// ⚠️ Зачем. Правило проекта: «каждый файл должен иметь комментарий в начале
// с описанием назначения файла», и только на русском. К фазе 38 без шапки жили
// 66 файлов из 436 — правило было, проверки не было. Файл без шапки читается
// с середины: что это, зачем, кто потребитель — выясняется по импортам.
//
// Что считается шапкой — ведущие комментарии файла (`//` и `/* */`) до первой
// строки кода; директива `'use client'` шапкой не является и пропускается
// в любом положении относительно неё. Порог кириллицы — `MIN_CYRILLIC` букв:
// `// hero section` — не шапка, `// Секция героя` — шапка. Порог, а не «есть
// комментарий»: латинская шапка нарушает правило «только на русском» так же,
// как её отсутствие.
//
// ⚠️ Список старых файлов без шапки только убывает: файл получил шапку — запись
// снимается, и запись с файлом, у которого шапка уже есть, — КРАСНАЯ.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Минимум кириллических букв в шапке. */
export const MIN_CYRILLIC = 10;

/** Старые файлы без русской шапки на день установки сторожа. Только убывает. */
export const LEGACY_HEADERLESS: string[] = [
  'src/components/auth/AuthModal.tsx',
  'src/components/auth/index.ts',
  'src/components/clubs/PopularNearby.tsx',
  'src/components/clubs/filterClubs.ts',
  'src/components/clubs/index.ts',
  'src/components/layout/AppShell.tsx',
  'src/components/layout/index.ts',
  'src/components/map/index.ts',
  'src/components/profile/AthleteAchievementsSection.tsx',
  'src/components/profile/AthleteFavoritesSection.tsx',
  'src/components/profile/athlete-achievements.ts',
  'src/components/profile/athlete-bookings.ts',
  'src/components/profile/athlete-favorites.ts',
  'src/components/profile/athlete-history.ts',
  'src/components/profile/athlete-review-items.ts',
  'src/components/schedule/getUpcomingSessions.ts',
  'src/components/schedule/index.ts',
  'src/components/search/CatalogResultsSection.tsx',
  'src/components/search/SearchBar.tsx',
  'src/components/search/SearchControlsPreview.tsx',
  'src/components/search/SportFilters.tsx',
  'src/components/search/index.ts',
  'src/components/trainers/PopularTrainers.tsx',
  'src/components/trainers/filterTrainers.ts',
  'src/components/trainers/index.ts',
  'src/components/trainers/trainer-preview.ts',
  'src/components/ui/Input.tsx',
  'src/components/ui/Modal.tsx',
  'src/components/ui/Rating.tsx',
  'src/components/ui/Skeleton.tsx',
  'src/components/ui/index.ts',
  'src/lib/utils.ts',
  'src/stores/useFilterStore.ts',
  'src/test/admin/analytics-charts2.test.tsx',
  'src/test/clubs/club-detail-page-client.test.tsx',
  'src/test/clubs/club-list.test.tsx',
  'src/test/clubs/popular-nearby.test.tsx',
  'src/test/lib/notification-types.test.ts',
  'src/test/mocks/server-only.ts',
  'src/test/profile/athlete-achievements.test.ts',
  'src/test/profile/athlete-bookings.test.ts',
  'src/test/profile/athlete-favorites.test.ts',
  'src/test/profile/athlete-history.test.ts',
  'src/test/profile/athlete-review-items.test.ts',
  'src/test/schedule/get-upcoming-sessions.test.ts',
  'src/test/schedule/upcoming-sessions.test.tsx',
  'src/test/search/search-controls.test.tsx',
  'src/test/setup.ts',
  'src/test/stores/useFilterStore.test.ts',
  'src/test/stores/useFilterStore.test.tsx',
  'src/test/stores/useUIStore.test.tsx',
  'src/test/trainers/trainer-detail-page-client.test.tsx',
  'src/test/types/domain-model.test.ts',
  'src/test/ui/app-shell.test.tsx',
  'src/test/ui/button.test.tsx',
  'src/test/ui/input.test.tsx',
  'src/test/ui/modal.test.tsx',
  'src/test/ui/rating.test.tsx',
];

/** Ведущие комментарии файла — до первой строки кода; директивы пропускаются. */
export function headerComment(text: string): string {
  let rest = text.replace(/^﻿/, '');
  let header = '';

  for (;;) {
    rest = rest.replace(/^\s+/, '');

    const directive = rest.match(/^(['"])use (?:client|server)\1;?/);

    if (directive) {
      rest = rest.slice(directive[0].length);
      continue;
    }

    if (rest.startsWith('/*')) {
      const end = rest.indexOf('*/');

      if (end < 0) break;

      header += `${rest.slice(0, end + 2)}\n`;
      rest = rest.slice(end + 2);
      continue;
    }

    if (rest.startsWith('//')) {
      const end = rest.indexOf('\n');

      header += `${end < 0 ? rest : rest.slice(0, end)}\n`;
      rest = end < 0 ? '' : rest.slice(end);
      continue;
    }

    break;
  }

  return header;
}

/** Есть ли у файла русская шапка. */
export function hasRussianHeader(text: string): boolean {
  return (headerComment(text).match(/[а-яё]/gi) ?? []).length >= MIN_CYRILLIC;
}

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

/** Обход `.ts`/`.tsx`/`.css` под `src` — тесты включительно: правило про каждый файл. */
async function collectSources(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const found: string[] = [];

  for (const entry of entries) {
    const full = path.join(directory, entry.name);

    if (entry.isDirectory()) {
      found.push(...(await collectSources(full)));
      continue;
    }

    if (/\.(ts|tsx|css)$/.test(entry.name)) found.push(normalize(path.relative(WEB_ROOT, full)));
  }

  return found;
}

describe('Сторож: шапка файла на русском (38.13)', () => {
  it('у каждого файла вне списка старых есть русская шапка', async () => {
    const legacy = new Set(LEGACY_HEADERLESS);
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      if (legacy.has(file)) continue;
      if (!hasRussianHeader(await readFile(path.join(WEB_ROOT, file), 'utf8')))
        offenders.push(file);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов только убывает: запись с файлом, у которого шапка есть, — красная', async () => {
    const stale: string[] = [];

    for (const file of LEGACY_HEADERLESS) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) stale.push(`${file}: файла нет — запись снять`);
      else if (hasRussianHeader(text)) stale.push(`${file}: шапка уже есть — запись снять`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы, а не пустоту', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));

    expect(files.length).toBeGreaterThan(300);
    expect(files).toContain('src/app/layout.tsx');
    expect(files).toContain('src/app/globals.css');
    expect(files).toContain('src/test/design/file-header-comment.test.ts');
  });

  it('сторож различает шапку и её отсутствие на подставном тексте', () => {
    // Русская шапка — строчная и блочная, до и после директивы.
    expect(
      hasRussianHeader('// Корневой layout приложения: шрифты и оболочка.\nimport x from "y";'),
    ).toBe(true);
    expect(hasRussianHeader('/**\n * Карточка клуба в выдаче.\n */\nexport {}')).toBe(true);
    expect(
      hasRussianHeader("'use client';\n\n// Кнопка с вариантами и размерами.\nexport {}"),
    ).toBe(true);
    // Нет шапки — диверсия д-10.
    expect(hasRussianHeader("import x from 'y';\n// Кнопка с вариантами и размерами.")).toBe(false);
    // Латинская шапка — диверсия д-11, порог кириллицы.
    expect(hasRussianHeader('// hero section\nexport {}')).toBe(false);
    // Одна русская буква в латинской шапке порог не берёт.
    expect(hasRussianHeader('// hero section — тест\nexport {}')).toBe(false);
  });
});
