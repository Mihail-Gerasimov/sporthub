// Сторож: проверенность НЕ входит ни в один предикат видимости (фаза 38, шаг 38.49).
//
// Фаза 36 закрыла семь путей к скрытой публикации одним правилом поверх
// `AccessService`, и у каждого пути одна и та же развилка: `status`. Верификация —
// не восьмое состояние публикации, а знак на ней: непроверенный клуб виден гостю
// точно так же, как проверенный, а «проверено» без «опубликовано» гасится
// скрытием (38.46). Восьмой путь появился бы, если бы кто-то дописал
// `verifiedAt: { not: null }` в публичный отбор «чтобы на витрине были только
// проверенные» — и сразу после выкатки витрина опустела бы: знака нет ни у кого.
//
// Две половины. Первая: файлы, где решается видимость, слова `verified` в коде
// не содержат вовсе. Вторая: единственное место, где запрос смотрит на
// `verified_at`, — отбор раздела модерации (`filter.verified`, 38.47), и внутри
// построителя условия ни одна строка про `verifiedAt` не обходится без него.
// Диверсия д-47: `verifiedAt: { not: null }` в ветку `excludeHidden`.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

import { API_ROOT } from './repo-root';

/**
 * Файлы, решающие видимость публикации гостю и владельцу: правило скрытия
 * (`canSeeHiddenPublication`), отказ 404 на карточке, публичные выборки каталога,
 * расписание с отсевом скрытых владельцев и контекст слота.
 */
const VISIBILITY_FILES = [
  'access/access.service.ts',
  'catalog/clubs.controller.ts',
  'catalog/catalog-query.service.ts',
  'schedule/schedule.controller.ts',
  'schedule/slot-context.service.ts',
  'publications/publication.service.ts',
  'repositories/prisma/bookings.repository.ts',
];

const ENTITIES_REPOSITORY = 'repositories/prisma/entities.repository.ts';

/** Текст без комментариев: объяснить «почему не здесь» обязано быть можно. */
function codeOnly(text: string): string {
  return text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

async function readCode(relative: string): Promise<string> {
  return codeOnly(await readFile(path.join(API_ROOT, 'src', relative), 'utf8'));
}

/** Тело построителя условия отбора публикаций — по имени функции, не по строкам. */
function publicationWhereBody(code: string): string {
  const start = code.indexOf('function buildPublicationWhere(');

  expect(start, 'построитель условия не найден — сторож смотрит не туда').toBeGreaterThan(-1);

  const open = code.indexOf('{', code.indexOf(')', start));
  let depth = 0;

  for (let index = open; index < code.length; index += 1) {
    if (code[index] === '{') depth += 1;
    if (code[index] === '}') depth -= 1;
    if (depth === 0) return code.slice(open, index + 1);
  }

  throw new Error('тело построителя не закрыто');
}

describe('проверенность — не видимость', () => {
  it('файлы, решающие видимость, слова «verified» в коде не содержат', async () => {
    const offenders: string[] = [];

    for (const relative of VISIBILITY_FILES) {
      if (/verified/i.test(await readCode(relative))) offenders.push(relative);
    }

    expect(offenders, `проверенность попала в видимость:\n${offenders.join('\n')}`).toEqual([]);
  });

  it('в построителе условия verifiedAt живёт только у отбора раздела модерации', async () => {
    const body = publicationWhereBody(await readCode(ENTITIES_REPOSITORY));
    const lines = body.split('\n').filter((line) => /verified/i.test(line));

    // Обратная сторона: отбор 38.47 на месте — иначе проверять нечего.
    expect(lines.length, 'отбор по проверенности исчез из построителя').toBeGreaterThan(0);

    const strays = lines.filter((line) => !line.includes('filter.verified'));

    expect(strays, `verifiedAt в условии не своего отбора:\n${strays.join('\n')}`).toEqual([]);
  });

  it('обратная половина: правило скрытия на месте и обходится этим сторожем', async () => {
    // Список файлов видимости не пустышка: правило действительно там.
    expect(await readCode('access/access.service.ts')).toContain('canSeeHiddenPublication');
    expect(await readCode('catalog/clubs.controller.ts')).toContain('assertVisible');
  });
});
