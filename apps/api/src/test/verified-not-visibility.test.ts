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

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';
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

// ═════════════════════════════════════════════════════════════════════════════
// Рантаймовая половина (ревью 38.49): текст стережёт код, стенд — поведение.
// ═════════════════════════════════════════════════════════════════════════════
//
// Опубликованный НЕпроверенный клуб виден гостю всеми публичными путями;
// проверенный СКРЫТЫЙ — не виден ни одним. Иначе текстовый сторож зелен
// и у видимости, которую перепутали не в тех файлах, что он обходит.
describe('проверенность не меняет видимость — по маршрутам', () => {
  let harness: TestHarness;

  /** Клуб 1 — опубликован, не проверен, со слотами; клуб 2 — проверен и скрыт. */
  const VERIFIED_HIDDEN_ID = 2;
  const PLAIN_ID = 1;

  beforeAll(async () => {
    harness = await createTestHarness('verified-not-visibility');
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureCollections,
      clubs: fixtureCollections.clubs.map((club) =>
        club.id === VERIFIED_HIDDEN_ID
          ? {
              ...club,
              status: 'hidden',
              hideReason: 'Стенд',
              hiddenKind: 'moderation',
              verifiedAt: '2026-09-15T12:00:00.000Z',
              verifiedByUserId: 3,
            }
          : club,
      ),
      // Слот у скрытого проверенного клуба — чтобы контекст слота тоже был под проверкой.
      schedule: [
        ...fixtureCollections.schedule,
        { ...fixtureCollections.schedule[0], id: 9, ownerId: VERIFIED_HIDDEN_ID, clubId: 2 },
      ],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const get = (url: string) => request(harness.app.getHttpServer()).get(url);
  const ids = (body: { data: { id: number }[] }) => body.data.map((row) => row.id);

  it('непроверенный опубликованный клуб виден гостю всеми публичными путями', async () => {
    const list = await get('/api/clubs');
    const showcase = await get('/api/clubs?sort=rating&limit=10');
    const byId = await get(`/api/clubs/${PLAIN_ID}`);
    const bySlug = await get('/api/clubs/by-slug/volna-aquatic-club');
    const context = await get('/api/schedule/1/context');

    expect(ids(list.body)).toContain(PLAIN_ID);
    expect(ids(showcase.body)).toContain(PLAIN_ID);
    expect(byId.status).toBe(200);
    expect(byId.body.data.club.verifiedAt).toBeUndefined();
    expect(bySlug.status).toBe(200);
    expect(context.status).toBe(200);
  });

  it('проверенный СКРЫТЫЙ клуб гостю не виден ни одним из них — знак не открывает дверь', async () => {
    const list = await get('/api/clubs');
    const showcase = await get('/api/clubs?sort=rating&limit=10');
    const byId = await get(`/api/clubs/${VERIFIED_HIDDEN_ID}`);
    const bySlug = await get('/api/clubs/by-slug/iron-gym');
    const context = await get('/api/schedule/9/context');

    // Слот скрытого клуба в базе ЕСТЬ — иначе 404 ниже означал бы «слота нет»,
    // а не «публикация скрыта», и проверка контекста зеленела бы мимо.
    const schedule = await harness.read<{ id: number; clubId?: number }[]>('schedule');

    expect(schedule.find((slot) => slot.id === 9)?.clubId).toBe(VERIFIED_HIDDEN_ID);

    expect(ids(list.body)).not.toContain(VERIFIED_HIDDEN_ID);
    expect(ids(showcase.body)).not.toContain(VERIFIED_HIDDEN_ID);
    expect(byId.status).toBe(404);
    expect(bySlug.status).toBe(404);
    expect(context.status).toBe(404);
  });
});
