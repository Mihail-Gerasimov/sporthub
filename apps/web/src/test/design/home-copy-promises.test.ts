// Сторож: тексты витрины не обещают того, чего у площадки нет (шаг 38.64).
//
// ⚠️ Зачем. Макет — прототип, и его тексты зовут в маркет, дневники тренировок
// и питания, челленджи, оплату картой и СБП, пробное занятие, командные виды.
// Всё это — долг фазы 38, не продукт. Обещание на витрине без раздела за ним —
// тупик, который разведка нашла шестнадцать раз в старой главной. Здесь список
// слов-обещаний, и любое из них в текстах витрины — красное.
//
// Область — `lib/home-copy.ts` и `components/home/**`; комментарии снимаются.

import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { WEB_ROOT } from '../web-root';

/** Слова-обещания: разделы и механизмы вне фазы (долги Д-1, Д-3–Д-5, Д-7, Д-8, Д-11–Д-13). */
export const PROMISES: [string, RegExp][] = [
  ['маркет', /маркет/i],
  ['командные', /командн/i],
  ['дневник', /дневник/i],
  ['пробное занятие', /пробн/i],
  ['оплата', /оплат|картой|сбп/i],
  ['челленджи', /челлендж/i],
  ['питание', /питани/i],
  ['абонемент', /абонемент/i],
  // Д-4 «Сообщество» и живая лента; Д-3 отзывы о самом сервисе.
  ['сообщество / лента', /сообществ|живая лента|лент[аеуы]\b/i],
  ['отзыв о сервисе', /отзыв[а-я]* о (?:сервисе|площадке)/i],
  // Посещение отмечает провайдер, спортсмену — 403 (ревью 38.71): не его действие.
  ['отметка посещения спортсменом', /отмечай посещен/i],
];

/** Область витрины. */
const AREA = ['src/lib/home-copy.ts', 'src/components/home'];

/** Обещания в тексте файла. */
export function promisesIn(text: string): string[] {
  const body = text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

  return PROMISES.filter(([, pattern]) => pattern.test(body)).map(([name]) => name);
}

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

describe('Сторож: витрина не обещает разделов вне фазы (38.64)', () => {
  it('в текстах витрины нет слов-обещаний', async () => {
    const offenders: string[] = [];

    for (const file of await areaFiles()) {
      const found = promisesIn(await readFile(path.join(WEB_ROOT, file), 'utf8'));

      if (found.length > 0) offenders.push(`${file}: ${found.join(', ')}`);
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('сторож обходит настоящие файлы витрины, а не пустоту', async () => {
    expect(await areaFiles()).toContain('src/lib/home-copy.ts');
  });

  it('сторож видит обещание на подставном тексте', () => {
    expect(promisesIn("body: 'Веди дневник тренировок, участвуй в челленджах.'")).toEqual([
      'дневник',
      'челленджи',
    ]);
    expect(promisesIn("sub: 'Оплачивай абонементы картой или СБП'")).toEqual([
      'оплата',
      'абонемент',
    ]);
    expect(promisesIn("body: 'Запишись в два клика. Без звонков.'")).toEqual([]);
    expect(promisesIn("body: 'Живая лента сообщества и отзывы о сервисе'")).toEqual([
      'сообщество / лента',
      'отзыв о сервисе',
    ]);
    // «Отзывы после занятий» — про клубы и тренеров, не про сервис.
    expect(promisesIn("body: 'Читай отзывы после занятий.'")).toEqual([]);
    // Комментарий — не обещание.
    expect(promisesIn('// маркет и дневник — долг Д-8, Д-12')).toEqual([]);
  });
});
