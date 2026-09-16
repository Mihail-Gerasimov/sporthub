// Разметка цветов видов спорта миграцией 20260916090000_sports_color (шаг 38.80).
//
// ⚠️ Зачем отдельный набор. Колонка `color` заводится аддитивно и у видов, заведённых
// до неё, пуста — то есть капли на боевой карте остались бы серыми: сид на боевой базе
// не запускается. Разметка делается внутри миграции, и палитра там — ВТОРАЯ копия той,
// что в `packages/fixtures`. Копии расходятся молча; здесь исполняется сам файл миграции
// и сверяется с фикстурами: разойдутся — красное.
//
// Тот же приём, что у `hide-kind-migration.test.ts`: читается тот SQL, который поедет
// на боевой сервер, а не своя копия запроса.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureSports } from '@sporthub/fixtures';

import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';
import { API_ROOT } from './repo-root';

/** Формат цвета на карте: `#rrggbb` строчными — тот же, что в CHECK `sports_color_hex`. */
const HEX_COLOR = /^#[0-9a-f]{6}$/;

/** Запросы разметки из самой миграции — без объявления колонки и ограничения. */
function backfillStatements(): string[] {
  const file = path.join(
    API_ROOT,
    'prisma',
    'migrations',
    '20260916090000_sports_color',
    'migration.sql',
  );
  // Комментарии снимаются ДО разбора: UPDATE идёт следом за пояснением.
  const sql = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.toUpperCase().startsWith('UPDATE'));
}

describe('миграция размечает цвета видов сида', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.truncateAll();
  });

  /** Виды сида в том виде, в каком они лежали до миграции: цвета нет. */
  const insertSportsWithoutColor = () =>
    db.prisma.sport.createMany({
      data: fixtureSports.map(({ color: _color, ...sport }) => ({
        ...sport,
        createdAt: new Date(sport.createdAt),
        color: null,
      })),
    });

  it('у каждого вида сида в фикстурах цвет задан и это #rrggbb', () => {
    expect(fixtureSports.length).toBeGreaterThan(0);

    for (const sport of fixtureSports) {
      expect(sport.color, `у вида «${sport.name}» нет цвета`).toMatch(HEX_COLOR);
    }
    // Палитра различает виды: две одинаковые точки легенды — те же «N одинаковых точек».
    expect(new Set(fixtureSports.map((sport) => sport.color)).size).toBe(fixtureSports.length);
  });

  it('UPDATE миграции красит виды сида ровно в цвета фикстур — копии не разошлись', async () => {
    await insertSportsWithoutColor();

    const statements = backfillStatements();

    expect(statements, 'в миграции нет UPDATE — разметки нет').toHaveLength(1);
    await db.prisma.$executeRawUnsafe(statements[0]);

    const rows = await db.prisma.sport.findMany({ orderBy: { id: 'asc' } });

    expect(new Map(rows.map((row) => [row.slug, row.color]))).toEqual(
      new Map(fixtureSports.map((sport) => [sport.slug, sport.color])),
    );
  });

  it('чужой цвет не переписывается, вид не из сида остаётся без цвета', async () => {
    await insertSportsWithoutColor();
    await db.prisma.sport.update({ where: { slug: 'yoga' }, data: { color: '#123456' } });
    // Номер — явно: фикстуры легли со своими номерами, и счётчик базы их не знает.
    await db.prisma.sport.create({
      data: {
        id: 1000,
        name: 'Скалолазание',
        slug: 'climbing',
        description: 'Заведён не сидом',
        icon: '🧗',
        imageUrl: '/images/sports/climbing.jpg',
      },
    });

    await db.prisma.$executeRawUnsafe(backfillStatements()[0]);

    const yoga = await db.prisma.sport.findUniqueOrThrow({ where: { slug: 'yoga' } });
    const climbing = await db.prisma.sport.findUniqueOrThrow({ where: { slug: 'climbing' } });

    expect(yoga.color).toBe('#123456');
    expect(climbing.color).toBeNull();
  });

  it('база отвергает цвет не в формате #rrggbb: «red», «#ABC», прописные', async () => {
    await insertSportsWithoutColor();

    for (const bad of ['red', '#ABC', '#8B5CF6', '8b5cf6']) {
      await expect(
        db.prisma.sport.update({ where: { slug: 'yoga' }, data: { color: bad } }),
        `«${bad}» прошёл`,
      ).rejects.toThrow(/sports_color_hex/);
    }
  });
});
