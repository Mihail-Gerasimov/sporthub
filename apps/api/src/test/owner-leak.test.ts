// Сторож: ни один публичный маршрут не отдаёт номер владельца публикации.
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

import { createTestHarness, type TestHarness } from './harness';

import { collectRoutes, type RouteRecord } from './app-routes';

/** Поле, которого в публичном ответе быть не должно. */
const OWNER_KEY = 'managedByUserId';

/** Путь до найденного поля — чтобы отчёт назвал место, а не только маршрут. */
function findOwnerFields(value: unknown, path = 'body'): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findOwnerFields(item, `${path}[${index}]`));
  }

  if (value && typeof value === 'object') {
    const found: string[] = [];

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;

      if (key === OWNER_KEY) found.push(childPath);

      found.push(...findOwnerFields(item, childPath));
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
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('таблица маршрутов не пустая', () => {
    expect(routes.length).toBeGreaterThan(10);
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

  it('ни один публичный GET не отдаёт гостю номер владельца', async () => {
    const offenders: string[] = [];

    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      const url = URL_BY_ROUTE[key] ?? route.path.replace(/:[A-Za-z]+/g, '1');
      const response = await request(harness.app.getHttpServer()).get(url);

      // Гостю закрытые маршруты отвечают 401 — их проверять нечем и незачем.
      if (response.status === 401) continue;

      for (const found of findOwnerFields(response.body)) {
        offenders.push(`${key}: ${found}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
