// Сторож: ни один публичный маршрут не отдаёт скрытые поля публикации —
// номер владельца, надзорный признак и номер подтвердившего администратора.
//
// ⚠️ Шаг 38.48. Список скрытого берётся из `HIDDEN_FROM_PUBLIC`, а не переписан
// здесь: до этого шага сторож знал ОДНО имя (`managedByUserId`), и второе
// скрытое поле стереглось бы только тем, что о нём вспомнили. Теперь четвёртое
// поле — строка в списке, и обход подхватывает его сам.
//
// ⚠️ В фикстурах — ВЕРИФИЦИРОВАННАЯ публикация. Без неё `verifiedByUserId`
// был бы `undefined` у всех, поле не попало бы в JSON вовсе, и сторож зеленел бы
// мимо: «не утекает» неотличимо от «нечему утекать». Отдельная проверка ниже
// убеждается, что в базе номер действительно стоит.
//
// ⚠️ Шаг 35.20a. `managedByUserId` — техническая связь лица услуг с человеком.
// Пока она уезжала в публичную выдачу каталога, «эти лица принадлежат одному
// человеку» скачивалось ОДНИМ запросом: посторонний получал готовую карту
// владельцев площадки, ничего не подбирая. Аффилиация на площадке
// показывается подтверждённой связью тренер↔клуб, а не техническим полем.
//
// Почему сторож, а не только точечные проверки маршрутов каталога. Вырезание
// поля — это то, что забывают в новом месте: карточка клуба отдаёт своих
// тренеров, карточка тренера — свой клуб, контекст слота — и клуб, и тренера.
// Точечная проверка каждого такого места живёт ровно до появления следующего.
// Здесь же список публичных маршрутов берётся у самого приложения, ответы
// обходятся рекурсивно, и новый публичный маршрут попадает под сторожа сам.
//
// Проверяется имя ключа, а не значение: номер владельца — обычное целое, и от
// номера клуба его по значению не отличить. Поэтому единственная надёжная
// зацепка — само поле, и `stripPublicationOwner` обязано вырезать его под тем
// же именем, каким его называет тип. Разойдись имя — вырезалось бы поле,
// которого нет, и номер утекал бы молча. Ровно эта ловушка уже была с хешем
// пароля (`password-leak.test.ts`).

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { HIDDEN_FROM_PUBLIC } from '../catalog/public-view';
import { createTestHarness, type TestHarness } from './harness';

import { collectRoutes, type RouteRecord } from './app-routes';

/**
 * Что список скрытого ОБЯЗАН содержать — приколото здесь, а не выведено из него.
 *
 * ⚠️ Ревью 38.48: сторож обходил ответы по тому же `HIDDEN_FROM_PUBLIC`, по которому
 * `stripPublicationOwner` вырезает. Убери имя из списка — и вырезание, и проверка
 * перестали бы его знать одновременно, а сторож остался бы зелёным. Ожидание
 * закреплено отдельно: снятие поля из списка краснит эту строку, и тогда решение
 * «поле больше не скрываем» принимается вслух, а не пропадает.
 */
const EXPECTED_HIDDEN = ['managedByUserId', 'awaitingRecheck', 'verifiedByUserId'] as const;

/** Поля, которых в публичном ответе быть не должно, — по приколотому ожиданию. */
const HIDDEN_KEYS: ReadonlySet<string> = new Set(EXPECTED_HIDDEN);

/** Администратор из фикстур — им «подтверждена» публикация стенда. */
const ADMIN_ID = 3;
const VERIFIED_AT = '2026-09-15T12:00:00.000Z';

/** Фикстуры, где клуб 1 и тренер 1 подтверждены: есть чему утекать. */
function verifiedFixtures(): Parameters<TestHarness['writeMany']>[0] {
  const verify = <T extends { id: number }>(rows: readonly T[]) =>
    rows.map((row) =>
      row.id === 1 ? { ...row, verifiedAt: VERIFIED_AT, verifiedByUserId: ADMIN_ID } : row,
    );

  return {
    ...fixtureCollections,
    clubs: verify(fixtureCollections.clubs),
    trainers: verify(fixtureCollections.trainers),
  };
}

/** Путь до найденного поля — чтобы отчёт назвал место, а не только маршрут. */
function findHiddenFields(value: unknown, path = 'body'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findHiddenFields(item, `${path}[${index}]`));
  }

  if (value && typeof value === 'object') {
    const found: string[] = [];

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;

      if (HIDDEN_KEYS.has(key)) found.push(childPath);

      found.push(...findHiddenFields(item, childPath));
    }

    return found;
  }

  return [];
}

/**
 * Чем подставить параметры адреса, чтобы вызов дошёл до данных, а не отбился
 * на разборе. Номера взяты из общего набора фикстур.
 */
const URL_BY_ROUTE: Record<string, string> = {
  'get /api/clubs': '/api/clubs?includeHidden=true',
  'get /api/clubs/:id': '/api/clubs/1',
  'get /api/clubs/by-slug/:slug': '/api/clubs/by-slug/volna-aquatic-club',
  'get /api/trainers': '/api/trainers?includeHidden=true',
  'get /api/trainers/:id': '/api/trainers/1',
  'get /api/trainers/by-slug/:slug': '/api/trainers/by-slug/marina-sokolova',
  'get /api/schedule/:id/context': '/api/schedule/1001/context',
};

/**
 * Маршруты, ради которых сторож заведён: они действительно отдают публикации.
 *
 * Контрольная группа обязательна. Без неё нельзя отличить «поле убрано»
 * от «маршрут ответил отказом, и смотреть было нечего»: пустое тело проходит
 * проверку так же зелено, как правильное.
 */
const PUBLICATION_BEARING_ROUTES = [
  'get /api/clubs',
  'get /api/clubs/:id',
  'get /api/clubs/by-slug/:slug',
  'get /api/trainers',
  'get /api/trainers/:id',
  'get /api/trainers/by-slug/:slug',
  'get /api/schedule/:id/context',
];

describe('Сторож: номер владельца публикации не уходит в публичную выдачу', () => {
  let harness: TestHarness;
  let routes: RouteRecord[];

  beforeAll(async () => {
    harness = await createTestHarness('owner-leak');
    routes = collectRoutes(harness.app);
  });

  beforeEach(async () => {
    await harness.writeMany(verifiedFixtures());
  });

  afterAll(async () => {
    await harness.close();
  });

  it('таблица маршрутов не пустая', () => {
    expect(routes.length).toBeGreaterThan(10);
  });

  it('список скрытого совпадает с приколотым ожиданием — поле не снять молча', () => {
    expect([...HIDDEN_FROM_PUBLIC]).toEqual([...EXPECTED_HIDDEN]);
  });

  it('маршруты, отдающие публикации, действительно отвечают гостю данными', async () => {
    for (const key of PUBLICATION_BEARING_ROUTES) {
      const url = URL_BY_ROUTE[key] ?? key.split(' ')[1];
      const response = await request(harness.app.getHttpServer()).get(url);

      expect(response.status, `${key} → ${response.status}`).toBe(200);
      // Тело не пустое: иначе проверка «поля нет» ничего не значит.
      expect(JSON.stringify(response.body.data).length, `${key}`).toBeGreaterThan(100);
    }
  });

  it('стенду есть чему утекать: у клуба 1 и тренера 1 в базе стоит номер подтвердившего', async () => {
    // Без этой проверки сторож зелен и тогда, когда поле не попало в базу вовсе.
    const clubs = await harness.read<{ id: number; verifiedByUserId?: number }[]>('clubs');
    const trainers = await harness.read<{ id: number; verifiedByUserId?: number }[]>('trainers');

    expect(clubs.find((row) => row.id === 1)?.verifiedByUserId).toBe(ADMIN_ID);
    expect(trainers.find((row) => row.id === 1)?.verifiedByUserId).toBe(ADMIN_ID);
  });

  it('ни один публичный GET не отдаёт гостю скрытые поля публикации', async () => {
    const offenders: string[] = [];

    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      const url = URL_BY_ROUTE[key] ?? route.path.replace(/:[A-Za-z]+/g, '1');
      const response = await request(harness.app.getHttpServer()).get(url);

      // Гостю закрытые маршруты отвечают 401 — их проверять нечем и незачем.
      if (response.status === 401) continue;

      for (const found of findHiddenFields(response.body)) {
        offenders.push(`${key}: ${found}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });

  it('«когда подтверждено» гостю ВИДНО — вырезается «кем», а не сам знак; у клуба и у тренера', async () => {
    // Обратная половина: список скрытого не должен однажды разрастись до даты,
    // иначе знак проверки на карточке нечем рисовать. Буквально, по именам,
    // на обеих сущностях — обход по списку выше это дополняет, а не заменяет.
    const club = await request(harness.app.getHttpServer()).get('/api/clubs/1');
    const trainer = await request(harness.app.getHttpServer()).get('/api/trainers/1');

    expect(club.status).toBe(200);
    expect(club.body.data.club.verifiedAt).toBe(VERIFIED_AT);
    expect('verifiedByUserId' in club.body.data.club).toBe(false);
    expect('managedByUserId' in club.body.data.club).toBe(false);
    expect('awaitingRecheck' in club.body.data.club).toBe(false);

    expect(trainer.status).toBe(200);
    expect(trainer.body.data.trainer.verifiedAt).toBe(VERIFIED_AT);
    expect('verifiedByUserId' in trainer.body.data.trainer).toBe(false);
    expect('managedByUserId' in trainer.body.data.trainer).toBe(false);
    expect('awaitingRecheck' in trainer.body.data.trainer).toBe(false);
  });
});
