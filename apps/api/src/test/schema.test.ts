// Проверка схемы базы.
//
// Схема — не декларация, а работающий механизм. Поэтому здесь проверяется не то,
// что строка написана в файле, а то, что база действительно отбивает нарушение.
// Отдельно проверяются физические имена: сырые выражения миграции обращаются
// к таблицам и колонкам в snake_case, и стоит одному `@@map` пропасть — накат
// падает, а на схеме без наката это никак не видно.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { ACTIVE_BOOKING_STATUSES, ACTIVE_LINK_STATUSES } from '@sporthub/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, testSchemaName, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');

/** Физические имена из схемы Prisma: что должно оказаться в базе. */
async function readPhysicalNames(): Promise<{ tables: string[]; columns: string[] }> {
  const text = await readFile(SCHEMA_PATH, 'utf8');

  const tables = [...text.matchAll(/@@map\("([^"]+)"\)/g)].map((match) => match[1]);
  // Отрицательный просмотр назад отсекает `@@map` — иначе имена таблиц попали бы в колонки.
  const columns = [...text.matchAll(/(?<!@)@map\("([^"]+)"\)/g)].map((match) => match[1]);

  return { tables, columns };
}

let db: TestDatabase;

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

describe('Физические имена', () => {
  it('каждая таблица из схемы существует в базе под своим именем', async () => {
    const { tables } = await readPhysicalNames();
    const rows = await db.prisma.$queryRaw<{ tablename: string }[]>`
      SELECT tablename FROM pg_tables WHERE schemaname = ${testSchemaName()}
    `;
    const existing = new Set(rows.map((row) => row.tablename));

    expect(tables.filter((table) => !existing.has(table))).toEqual([]);
    // 27 таблиц по описи фазы плюс служебная таблица истории миграций.
    expect(tables.length).toBe(27);
  });

  it('имена таблиц и колонок записаны в нижнем регистре', async () => {
    const rows = await db.prisma.$queryRaw<{ table_name: string; column_name: string }[]>`
      SELECT table_name, column_name FROM information_schema.columns
      WHERE table_schema = ${testSchemaName()}
    `;

    const wrongCase = rows
      .filter(
        (row) =>
          row.table_name !== row.table_name.toLowerCase() ||
          row.column_name !== row.column_name.toLowerCase(),
      )
      .map((row) => `${row.table_name}.${row.column_name}`);

    expect(wrongCase).toEqual([]);
  });

  it('каждая переименованная колонка существует', async () => {
    const { columns } = await readPhysicalNames();
    const rows = await db.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT DISTINCT column_name FROM information_schema.columns
      WHERE table_schema = ${testSchemaName()}
    `;
    const existing = new Set(rows.map((row) => row.column_name));

    expect([...new Set(columns)].filter((column) => !existing.has(column))).toEqual([]);
  });
});

describe('Предикаты частичных индексов', () => {
  /** Значения, перечисленные в предикате индекса. */
  async function predicateValues(indexName: string): Promise<string[]> {
    const rows = await db.prisma.$queryRaw<{ indexdef: string }[]>`
      SELECT indexdef FROM pg_indexes
      WHERE schemaname = ${testSchemaName()} AND indexname = ${indexName}
    `;

    expect(rows, `индекса ${indexName} нет в базе`).toHaveLength(1);

    const where = rows[0].indexdef.split(' WHERE ')[1] ?? '';

    return [...where.matchAll(/'([^']+)'/g)].map((match) => match[1]).sort();
  }

  it('уникальность записи на занятие покрывает ровно действующие состояния', async () => {
    expect(await predicateValues('bookings_active_slot_user_uq')).toEqual(
      [...ACTIVE_BOOKING_STATUSES].sort(),
    );
  });

  it('уникальность связи покрывает ровно действующие состояния', async () => {
    expect(await predicateValues('links_active_pair_uq')).toEqual([...ACTIVE_LINK_STATUSES].sort());
  });

  it('отбор действующих записей слота покрывает те же состояния', async () => {
    expect(await predicateValues('bookings_active_by_slot_idx')).toEqual(
      [...ACTIVE_BOOKING_STATUSES].sort(),
    );
  });
});

describe('Ограничения работают, а не просто существуют', () => {
  beforeAll(async () => {
    await db.truncateAll();
  });

  /** Минимальный набор строк, на которых можно нарушать ограничения. */
  async function seedMinimum(): Promise<{ sportId: number; clubId: number; userId: number }> {
    const sport = await db.prisma.sport.create({
      data: {
        name: 'Бокс',
        slug: 'boxing',
        description: '',
        icon: '',
        imageUrl: '',
        isPopular: false,
      },
    });
    const user = await db.prisma.user.create({
      data: {
        name: 'Тест',
        email: 'schema@test.local',
        phone: '+7 (900) 000-00-00',
        passwordHash: 'хеш-заглушка',
        role: 'athlete',
        status: 'active',
      },
    });
    const club = await db.prisma.club.create({
      data: {
        name: 'Клуб',
        slug: 'club',
        slugNormalized: 'club',
        description: '',
        shortDescription: '',
        city: 'Самара',
        address: '',
        phone: '',
        latitude: 0,
        longitude: 0,
        priceFrom: 0,
        source: 'seed',
        status: 'published',
      },
    });

    return { sportId: sport.id, clubId: club.id, userId: user.id };
  }

  it('услуга без владельца не записывается', async () => {
    const { sportId } = await seedMinimum();

    await expect(
      db.prisma.offering.create({
        data: {
          sportId,
          title: 'Без владельца',
          description: '',
          format: 'group',
          price: 0,
          durationMinutes: 60,
          capacity: 1,
          address: '',
          latitude: 0,
          longitude: 0,
        },
      }),
    ).rejects.toThrow(/offerings_owner_one/);
  });

  it('оценка отзыва вне диапазона не записывается', async () => {
    await db.truncateAll();
    const { clubId, userId } = await seedMinimum();

    await expect(
      db.prisma.review.create({
        data: { clubId, userId, rating: 6, text: 'Слишком много звёзд' },
      }),
    ).rejects.toThrow(/reviews_rating_range/);
  });

  it('отзыв без адресата не записывается', async () => {
    await db.truncateAll();
    const { userId } = await seedMinimum();

    await expect(
      db.prisma.review.create({ data: { userId, rating: 5, text: 'Никому' } }),
    ).rejects.toThrow(/reviews_target_one/);
  });

  it('город не заводится дважды под тем же нормализованным именем', async () => {
    await db.truncateAll();
    await db.prisma.city.create({
      data: { name: 'Самара', nameNormalized: 'самара', latitude: 0, longitude: 0 },
    });

    await expect(
      db.prisma.city.create({
        data: { name: 'САМАРА', nameNormalized: 'самара', latitude: 0, longitude: 0 },
      }),
    ).rejects.toThrow(/name_normalized/);
  });
});
