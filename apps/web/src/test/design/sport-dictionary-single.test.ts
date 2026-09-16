// Сторож: виды спорта — из базы, а не литералом в витрине (шаг 38.64).
//
// ⚠️ Зачем. Макет держит два побайтово одинаковых списка категорий (`SPORT_CATS`
// и `TRAINER_CATS`, `HomePage.tsx:205-220`) — шесть видов, выписанных руками.
// У нас виды спорта — таблица `sports` и `getSports()`: новый вид появляется
// в базе и на витрине сам. Литеральный список в компоненте — второй словарь,
// который разойдётся с первым молча (диверсия д-27).
//
// Как узнаётся: три и более разных названий видов спорта в кавычках в одном файле
// области. Названия для сверки — сегодняшний засев базы; это единственное место
// в коде фронта, где они написаны буквами, и оно — тест.
//
// Область — витрина: `components/home/**`, `lib/home-copy.ts`, `lib/home-sections.ts`.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Область витрины. */
export const AREA = ['src/components/home', 'src/lib/home-copy.ts', 'src/lib/home-sections.ts'];

/** Названия видов спорта из засева — для узнавания литерального списка. */
const SPORT_NAMES = [
  'Йога',
  'Бокс',
  'Плавание',
  'Кроссфит',
  'Танцы',
  'Тренажёрный зал',
  'Единоборства',
  'Пилатес',
  'Футбол',
  'Бег',
];

/** Сколько разных видов спорта названо в кавычках. */
export function literalSportsIn(text: string): string[] {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');
  const quoted = [...body.matchAll(/['"`]([^'"`\n]{2,40})['"`]/g)].map((m) => m[1].trim());

  return SPORT_NAMES.filter((name) => quoted.some((q) => q.toLowerCase() === name.toLowerCase()));
}

/** Порог: два вида могут встретиться в примере подсказки, три — уже список. */
export const LITERAL_LIST_THRESHOLD = 3;

/** Путь в единой форме — со слэшами, от корня приложения. */
function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

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
    if (/\.tsx?$/.test(item)) found.push(item);
    else await walk(path.join(WEB_ROOT, item)).catch(() => undefined);
  }

  return found;
}

describe('Сторож: виды спорта не литералом (38.64)', () => {
  it('ни один файл витрины не держит список видов спорта буквами', async () => {
    const offenders: string[] = [];

    for (const file of await areaFiles()) {
      const found = literalSportsIn(await readFile(path.join(WEB_ROOT, file), 'utf8'));

      if (found.length >= LITERAL_LIST_THRESHOLD) offenders.push(`${file}: ${found.join(', ')}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы витрины, а не пустоту', async () => {
    const files = await areaFiles();

    expect(files).toContain('src/lib/home-copy.ts');
    expect(files).toContain('src/components/home/HeroSportMarquee.tsx');
  });

  it('сторож видит литеральный список на подставном тексте', () => {
    // Диверсия д-27: список категорий как в макете.
    expect(
      literalSportsIn(
        "const SPORT_CATS = [{ id: 'crossfit', label: 'Кроссфит' }, { id: 'yoga', label: 'Йога' }, { id: 'swimming', label: 'Плавание' }];",
      ),
    ).toEqual(['Йога', 'Плавание', 'Кроссфит']);
    // Два вида в подсказке поля — не список.
    expect(literalSportsIn("placeholder: 'Кроссфит, йога, бассейн, район…'")).toEqual([]);
    expect(literalSportsIn("['Йога', 'Бокс']").length).toBeLessThan(LITERAL_LIST_THRESHOLD);
    // Комментарий — не список.
    expect(literalSportsIn("// 'Йога', 'Бокс', 'Плавание' — из базы")).toEqual([]);
  });
});
