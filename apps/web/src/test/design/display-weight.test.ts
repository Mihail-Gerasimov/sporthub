// Сторож: `font-display` — только вместе с весом (аудит главной 17.09, п. 2).
//
// ⚠️ Зачем. Display-шрифт без веса — обычный 400 (у Barlow 400 нет в стеке, у Inter —
// есть), а в макете все display-надписи — Barlow 900: «14:00» и имя занятия в «Сегодня
// в фокусе» стояли тонкими (`font-display` без `font-*`). Базовое правило даёт вес только `h1`/`h2`;
// у `p`/`span`/`h3` вес приходит лишь утилитой (`font-black`, `font-bold`, `font-hero`,
// `font-heading`) или пресетом `.t-*`, где семейство и вес объявлены вместе.
//
// Правило: в строке классов с `font-display` есть и `font-<вес>`. Старые файлы — в
// `LEGACY` с точным числом вхождений; список только убывает.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Старые файлы и точное число строк классов с `font-display` без веса. Только убывает. */
export const LEGACY: Record<string, number> = {
  'src/app/global-error.tsx': 1,
  'src/components/admin/AdminNotificationsPage.tsx': 1,
  'src/components/admin/DashboardPage.tsx': 2,
  'src/components/admin/LogsPage.tsx': 1,
  'src/components/admin/ModerationPage.tsx': 1,
  'src/components/admin/analytics/AnalyticsDashboard.tsx': 1,
  'src/components/admin/analytics/KpiCards.tsx': 1,
  'src/components/clubs/ClubDetailPageClient.tsx': 9,
  'src/components/detail-shared/DetailScheduleWeek.tsx': 2,
  'src/components/profile/AccountCredentialsSection.tsx': 1,
  'src/components/trainers/TrainerCard.tsx': 1,
  'src/components/trainers/TrainerDetailPageClient.tsx': 12,
  'src/components/ui/CardSlider.tsx': 1,
  'src/components/ui/HiddenPublicationNotice.tsx': 1,
  'src/components/ui/SlotCard.tsx': 3,
};

const WEIGHT =
  /(?<![\w-])font-(?:thin|extralight|light|normal|medium|semibold|bold|extrabold|black|heading|hero)(?![\w-])/;
const DISPLAY = /(?<![\w-])font-display(?![\w-])/;

function stripComments(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
}

/** Строки классов (литералы в кавычках) с `font-display` без веса. */
export function displayWithoutWeight(text: string): string[] {
  const found: string[] = [];

  for (const literal of stripComments(text).matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)) {
    const classes = literal[2];

    if (DISPLAY.test(classes) && !WEIGHT.test(classes)) found.push(classes.slice(0, 60));
  }

  return found;
}

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

describe('Сторож: font-display только с весом (аудит 17.09, п. 2)', () => {
  it('в строках классов font-display стоит вместе с font-<вес>; старые — не выше потолка', async () => {
    const offenders: string[] = [];

    for (const file of await collectSources(path.join(WEB_ROOT, 'src'))) {
      const found = displayWithoutWeight(await readFile(path.join(WEB_ROOT, file), 'utf8'));
      const ceiling = LEGACY[file] ?? 0;

      if (found.length > ceiling)
        offenders.push(`${file}: ${found.length} > ${ceiling}\n    ${found.join('\n    ')}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('список старых файлов только убывает: потолок равен факту', async () => {
    const stale: string[] = [];

    for (const [file, ceiling] of Object.entries(LEGACY)) {
      const text = await readFile(path.join(WEB_ROOT, file), 'utf8').catch(() => null);

      if (text === null) {
        stale.push(`${file}: файла нет — запись снять`);
        continue;
      }

      const actual = displayWithoutWeight(text).length;

      if (actual === 0) stale.push(`${file}: уже чист — запись снять`);
      else if (actual < ceiling)
        stale.push(`${file}: факт ${actual} < потолок ${ceiling} — опустить`);
    }

    expect(stale, stale.join('\n')).toEqual([]);
  });

  it('обратная половина: сторож видит компоненты и находит нарушение на подставном тексте', async () => {
    const files = await collectSources(path.join(WEB_ROOT, 'src'));
    expect(files).toContain('src/components/home/FocusCard.tsx');
    expect(files.length).toBeGreaterThan(100);

    expect(
      displayWithoutWeight('<p className="m-0 font-display text-[40px]">14:00</p>'),
    ).toHaveLength(1);
    expect(
      displayWithoutWeight('<p className="font-display font-black text-[40px]">14:00</p>'),
    ).toEqual([]);
    expect(displayWithoutWeight("'font-display font-hero leading-none'")).toEqual([]);
    expect(displayWithoutWeight('<h2 className="t-h2 mt-2 text-ink">x</h2>')).toEqual([]);
  });
});
