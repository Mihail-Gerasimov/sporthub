// Проверка схемы базы.
//
// Схема — не декларация, а работающий механизм. Поэтому здесь проверяется не то,
// что строка написана в файле, а то, что база действительно отбивает нарушение.
// Отдельно проверяются физические имена: сырые выражения миграции обращаются
// к таблицам и колонкам в snake_case, и стоит одному `@@map` пропасть — накат
// падает, а на схеме без наката это никак не видно.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import {
  ACTIVE_BOOKING_STATUSES,
  ACTIVE_LINK_STATUSES,
  NOTIFICATION_ADDRESSEE_KINDS,
} from '@sporthub/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestDatabase, testSchemaName, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

import { NOTIFICATION_TYPE_GROUP } from '@sporthub/domain';

const SCHEMA_PATH = path.join(__dirname, '..', '..', 'prisma', 'schema.prisma');

/** Генератор ограничений: путь до него и форма того, что он объявляет. */
const CONSTRAINTS_GENERATOR_PATH = path.join(
  __dirname,
  '..',
  '..',
  '..',
  '..',
  'scripts',
  'db-constraints.mjs',
);

type CheckSpec = { table: string; expression: string };
type IndexSpec = { table: string; columns: string };

type ConstraintsGenerator = {
  CHECK_CONSTRAINTS: Record<string, CheckSpec>;
  PARTIAL_UNIQUE_INDEXES: Record<string, IndexSpec>;
  PARTIAL_INDEXES: Record<string, IndexSpec>;
  INDEX_PREDICATES: Record<string, string>;
};

/**
 * Поднять генератор.
 *
 * Путь собирается из частей намеренно: файл лежит вне `rootDir` бэкенда, и обычный
 * импорт по строковому литералу сломал бы сборку `tsc`. Форма объявлена здесь же —
 * это не вторая копия наборов, а описание того, что модуль отдаёт.
 */
async function loadConstraintsGenerator(): Promise<ConstraintsGenerator> {
  const loaded: unknown = await import(pathToFileURL(CONSTRAINTS_GENERATOR_PATH).href);

  return loaded as ConstraintsGenerator;
}

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
    // 27 таблиц по описи фазы 33 плюс две из фазы 34: `sessions` (шаг 34.4) и
    // `password_reset_tokens` (шаг 34.69 — одноразовые ссылки восстановления).
    // Число закреплено намеренно: таблица, добавленная мимо описи, обязана быть
    // замечена, а не приехать молча.
    expect(tables.length).toBe(29);
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

  it('в настройках уведомлений нет типов вне словаря', async () => {
    // ⚠️ Найдено браузерным прогоном 10.09.2026. Шаг 35.3a вырезал санкции за неявки,
    // но СТРОКИ настроек с их типами остались в базе и уезжали в выдачу
    // `GET /api/users`. Имена типов здесь не называются намеренно: их отсутствие
    // в исходниках стережёт отдельный сторож, и упоминание ослабило бы его —
    // а миграция, убравшая эти строки (10.09.2026), называет их там, где это
    // уместно, и объясняет почему.
    //
    // Проверка идёт по БАЗЕ против СЛОВАРЯ — то есть ищет не два известных имени,
    // а любое расхождение. Следующий вырезанный механизм оставит такой же след,
    // и найдётся он сам, а не через год и не браузером.
    const rows = await db.prisma.$queryRaw<{ type: string }[]>`
      SELECT DISTINCT type FROM user_notification_preferences
    `;
    // ⚠️ Словарь берётся из `NOTIFICATION_TYPE_GROUP`: он объявлен как
    // `Record<NotificationType, …>`, то есть полон по построению — забыть тип
    // в нём нельзя, не сломав сборку. Отдельного плоского списка типов в проекте
    // нет, и заводить его ради теста значило бы завести второе место правды.
    const known = new Set<string>(Object.keys(NOTIFICATION_TYPE_GROUP));
    const orphans = rows.map((row) => row.type).filter((type) => !known.has(type));

    expect(orphans, `настройки уведомлений с типами вне словаря: ${orphans.join(', ')}`).toEqual(
      [],
    );
  });

  it('лицо услуг есть у того и только у того, кто им владеет (шаг 35.39)', async () => {
    // ⚠️ Правило переноса фазы 35 звучит так: роль отбрасывается, лица выводятся
    // из ВЛАДЕНИЯ. Проверять его по коду недостаточно — `facesOf` можно прочитать
    // и убедиться, что он спрашивает владельца. Вопрос в другом: сходится ли это
    // с тем, что реально лежит в базе после наката миграций.
    //
    // Расхождение здесь тихое в обе стороны: лицо с владельцем, которого нет,
    // не покажется никому и будет выглядеть «пропавшим»; лицо, приписанное
    // не тому, откроет ему чужой кабинет.
    const orphanClubs = await db.prisma.$queryRaw<{ id: number }[]>`
      SELECT c.id FROM clubs c
      LEFT JOIN users u ON u.id = c.managed_by_user_id
      WHERE c.managed_by_user_id IS NOT NULL AND u.id IS NULL
    `;
    const orphanTrainers = await db.prisma.$queryRaw<{ id: number }[]>`
      SELECT t.id FROM trainers t
      LEFT JOIN users u ON u.id = t.managed_by_user_id
      WHERE t.managed_by_user_id IS NOT NULL AND u.id IS NULL
    `;

    expect(orphanClubs, 'клуб числится за несуществующим человеком').toEqual([]);
    expect(orphanTrainers, 'карточка тренера числится за несуществующим человеком').toEqual([]);

    // Обратная сторона: у служебной записи лиц быть не должно вовсе (решение 13).
    // Администратор не человек площадки — заводить клуб ему нечем и незачем.
    const adminFaces = await db.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM (
        SELECT managed_by_user_id FROM clubs
        UNION ALL
        SELECT managed_by_user_id FROM trainers
      ) AS faces
      JOIN users u ON u.id = faces.managed_by_user_id
      WHERE u.account_kind = 'admin'
    `;

    expect(Number(adminFaces[0]?.count ?? 0), 'у служебной записи оказались лица услуг').toBe(0);
  });

  it('колонки role и индекса по ней в таблице пользователей нет', async () => {
    // Шаг 35.24. Проверка идёт по БАЗЕ, а не по тексту схемы: текстовый сторож
    // (`role-boundary.test.ts`) ловит возврат объявления, а сюда попадёт возврат
    // самой колонки миграцией — например, откатом. Это разные ошибки.
    const columns = await db.prisma.$queryRaw<{ column_name: string }[]>`
      SELECT column_name FROM information_schema.columns
      WHERE table_schema = ${testSchemaName()} AND table_name = 'users'
    `;
    const names = columns.map((row) => row.column_name);

    expect(names).not.toContain('role');
    // Вид учётной записи — то, что осталось решать вместо роли.
    expect(names).toContain('account_kind');

    const indexes = await db.prisma.$queryRaw<{ indexname: string }[]>`
      SELECT indexname FROM pg_indexes
      WHERE schemaname = ${testSchemaName()} AND tablename = 'users'
    `;

    expect(indexes.map((row) => row.indexname)).not.toContain('users_role_idx');
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

  // --- Шаг 37.13: литералы предиката сверяются со словарём видов адресата ---
  //
  // ⚠️ До этого шага такая сверка была только у записей и связей. У ящиков
  // уведомлений её не было вовсе, и опечатка в одну букву — `'persona1'` вместо
  // `'personal'` — прошла бы молча: индекс создался бы, запросы перестали бы им
  // пользоваться, и никто бы не заметил, потому что ответы остались бы верными.
  //
  // Сверка идёт со СЛОВАРЁМ, а не с выписанной здесь строкой: второй список —
  // второе место, где можно ошибиться.
  it('предикат личного ящика называет вид адресата ровно из словаря', async () => {
    expect(await predicateValues('notifications_personal_idx')).toEqual(['personal']);
    expect(NOTIFICATION_ADDRESSEE_KINDS).toContain('personal');
  });

  it('предикат непрочитанного в личном ящике называет тот же вид', async () => {
    expect(await predicateValues('notifications_personal_unread_idx')).toEqual(['personal']);
  });

  it('предикаты очереди надзора называют вид адресата ровно из словаря', async () => {
    expect(await predicateValues('notifications_supervision_idx')).toEqual(['supervision']);
    expect(await predicateValues('notifications_supervision_unread_idx')).toEqual(['supervision']);
    expect(NOTIFICATION_ADDRESSEE_KINDS).toContain('supervision');
  });

  it('каждый вид адресата из словаря либо назван предикатом, либо не нуждается в нём', async () => {
    // ⚠️ Обратная сторона: сверка выше проверяет, что НАЗВАННОЕ верно, а эта —
    // что не забыт новый вид. У ящиков лица частичного индекса нет: там отбор
    // идёт по самой колонке лица, и она уже не пуста. Остальные обязаны быть
    // названы хотя бы одним предикатом.
    const named = new Set([
      ...(await predicateValues('notifications_personal_idx')),
      ...(await predicateValues('notifications_supervision_idx')),
    ]);
    const byFaceColumn = ['club', 'trainer'];

    for (const kind of NOTIFICATION_ADDRESSEE_KINDS) {
      expect(
        named.has(kind) || byFaceColumn.includes(kind),
        `вид адресата ${kind} не назван ни одним предикатом и не отбирается колонкой лица`,
      ).toBe(true);
    }
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

  it('уведомление сразу двум лицам не записывается', async () => {
    // Шаг 35.26. Пара колонок адресата взаимоисключающая: уведомление адресовано
    // либо клубу, либо карточке тренера, либо (когда обе пусты) человеку. Две
    // заполненные колонки — это строка, у которой два ящика: она попала бы в оба
    // и посчиталась бы дважды.
    await db.truncateAll();
    const { clubId, userId } = await seedMinimum();
    const trainer = await db.prisma.trainer.create({
      data: {
        name: 'Тренер',
        slug: 'trainer-addressee',
        slugNormalized: 'trainer-addressee',
        bio: '',
        city: 'Самара',
        latitude: 0,
        longitude: 0,
        priceFrom: 0,
        experienceYears: 0,
        source: 'seed',
        status: 'published',
      },
    });

    await expect(
      db.prisma.notification.create({
        data: {
          userId,
          addresseeKind: 'club',
          type: 'booking_requested',
          payload: {},
          addresseeClubId: clubId,
          addresseeTrainerId: trainer.id,
        },
      }),
      // ⚠️ Имя ограничения поменялось на шаге 37.8, и это не переименование.
      // Прежнее `notifications_addressee_one` знало только «не более одного лица»
      // и пропускало строку вообще без адресата. Новое выражает форму целиком —
      // какому виду адресата какая ссылка полагается.
    ).rejects.toThrow(/notifications_addressee_shape/);
  });

  it('заметка о клиенте сразу двум лицам не записывается', async () => {
    // Шаг 35.27a. Та же взаимоисключающая пара, что у уведомления, и по той же
    // причине: заметка ведётся ПРИ ОДНОМ лице. Две заполненные колонки дали бы
    // строку, которая видна в двух кабинетах сразу, а правит её кто угодно
    // из двух владельцев — то есть ровно ту кучу, которую шаг разбирает.
    await db.truncateAll();
    const { clubId, userId } = await seedMinimum();
    const trainer = await db.prisma.trainer.create({
      data: {
        name: 'Тренер',
        slug: 'trainer-note-face',
        slugNormalized: 'trainer-note-face',
        bio: '',
        city: 'Самара',
        latitude: 0,
        longitude: 0,
        priceFrom: 0,
        experienceYears: 0,
        source: 'seed',
        status: 'published',
      },
    });

    await expect(
      db.prisma.providerClientNote.create({
        data: {
          providerUserId: userId,
          clientUserId: userId,
          note: 'Двум лицам сразу',
          updatedAt: new Date(),
          faceClubId: clubId,
          faceTrainerId: trainer.id,
        },
      }),
    ).rejects.toThrow(/provider_client_notes_face_one/);
  });

  it('уведомление одному лицу и уведомление человеку записываются', async () => {
    // Обратная сторона: ограничение обязано пропускать все законные формы.
    // Без этой проверки форму можно было бы случайно ужесточить, и уведомления
    // человеку перестали бы писаться вовсе.
    await db.truncateAll();
    const { clubId, userId } = await seedMinimum();

    const toClub = await db.prisma.notification.create({
      data: {
        userId,
        addresseeKind: 'club',
        type: 'booking_requested',
        payload: {},
        addresseeClubId: clubId,
      },
    });
    const toPerson = await db.prisma.notification.create({
      data: { userId, addresseeKind: 'personal', type: 'booking_confirmed', payload: {} },
    });

    expect(toClub.addresseeClubId).toBe(clubId);
    expect(toPerson.addresseeClubId).toBeNull();
    expect(toPerson.addresseeTrainerId).toBeNull();
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

/**
 * Генератор ограничений против того, что реально стоит в базе.
 *
 * `scripts/db-constraints.mjs` — единственное место, где записаны проверки целостности
 * и предикаты частичных индексов. Но сам по себе он ни на что не влияет: собранный им
 * SQL один раз попал в миграцию и там застыл. Значит правка генератора расходится
 * с базой МОЛЧА — а молчаливое расхождение хуже, чем отсутствие генератора вовсе:
 * читающий код верит, что правит базу, а не текстовый файл.
 *
 * Этот набор и есть недостающая связь. Он не сверяет строки «как написано»: база
 * хранит не текст, а разобранное дерево, и печатает его по-своему — `BETWEEN`
 * превращается в пару сравнений, перечисление — в массив. Поэтому выражения генератора
 * накладываются на ТУ ЖЕ базу под временными именами: обе стороны проходят один разбор,
 * и совпадение напечатанного означает совпадение смысла, а не написания.
 *
 * Отложенных ограничений больше нет: `schedule_booked_range` переведён в действующие
 * вместе с миграцией `20260821_schedule_booked_range`. Отсрочка держалась на двух
 * условиях — «счётчик мест меняется одной операцией с условием» и «проверка мест
 * стоит внутри транзакции», — и оба выполнены.
 */
describe('Генератор ограничений и база', () => {
  /** CHECK-ограничения схемы прогона: имя → таблица и разобранное базой определение. */
  async function checksInDatabase(): Promise<Map<string, { table: string; definition: string }>> {
    const rows = await db.prisma.$queryRaw<
      { conname: string; relname: string; definition: string }[]
    >`
      SELECT c.conname, t.relname, pg_get_constraintdef(c.oid) AS definition
        FROM pg_constraint c
        JOIN pg_class t ON t.oid = c.conrelid
        JOIN pg_namespace n ON n.oid = c.connamespace
       WHERE c.contype = 'c' AND n.nspname = ${testSchemaName()}
    `;

    return new Map(
      rows.map((row) => [row.conname, { table: row.relname, definition: row.definition }]),
    );
  }

  /** Частичные индексы схемы прогона: имя → готовое определение из базы. */
  async function partialIndexesInDatabase(): Promise<Map<string, string>> {
    const rows = await db.prisma.$queryRaw<{ indexname: string; indexdef: string }[]>`
      SELECT indexname, indexdef FROM pg_indexes
       WHERE schemaname = ${testSchemaName()} AND indexdef LIKE '% WHERE %'
    `;

    return new Map(rows.map((row) => [row.indexname, row.indexdef]));
  }

  /** Как база понимает выражение генератора: ставим его временно и читаем разбор. */
  async function checkAsUnderstoodByDatabase(name: string, spec: CheckSpec): Promise<string> {
    const probe = `probe_${name}`;

    try {
      // NOT VALID — чтобы проверка не пошла по уже лежащим строкам: нас интересует
      // разбор выражения, а не состояние данных соседних наборов.
      await db.prisma.$executeRawUnsafe(
        `ALTER TABLE "${spec.table}" ADD CONSTRAINT "${probe}" CHECK (${spec.expression}) NOT VALID`,
      );

      const rows = await db.prisma.$queryRaw<{ definition: string }[]>`
        SELECT pg_get_constraintdef(c.oid) AS definition
          FROM pg_constraint c
          JOIN pg_namespace n ON n.oid = c.connamespace
         WHERE n.nspname = ${testSchemaName()} AND c.conname = ${probe}
      `;

      return rows[0].definition.replace(/ NOT VALID$/, '');
    } finally {
      await db.prisma.$executeRawUnsafe(
        `ALTER TABLE "${spec.table}" DROP CONSTRAINT IF EXISTS "${probe}"`,
      );
    }
  }

  /** То же для индекса: ставим временный по описанию генератора и читаем его определение. */
  async function indexAsUnderstoodByDatabase(
    name: string,
    spec: IndexSpec,
    predicate: string,
    unique: boolean,
  ): Promise<string> {
    const probe = `probe_${name}`;

    try {
      await db.prisma.$executeRawUnsafe(
        `CREATE ${unique ? 'UNIQUE ' : ''}INDEX "${probe}" ON "${spec.table}" (${spec.columns}) WHERE ${predicate}`,
      );

      const rows = await db.prisma.$queryRaw<{ indexdef: string }[]>`
        SELECT indexdef FROM pg_indexes
         WHERE schemaname = ${testSchemaName()} AND indexname = ${probe}
      `;

      // Имя временного индекса меняем на настоящее: сравнивать надо всё остальное.
      return rows[0].indexdef.replace(probe, name);
    } finally {
      await db.prisma.$executeRawUnsafe(`DROP INDEX IF EXISTS "${probe}"`);
    }
  }

  it('в базе стоят ровно те проверки целостности, которые объявил генератор', async () => {
    const { CHECK_CONSTRAINTS } = await loadConstraintsGenerator();
    const actual = await checksInDatabase();

    expect([...actual.keys()].sort()).toEqual(Object.keys(CHECK_CONSTRAINTS).sort());
  });

  it('каждая проверка стоит на объявленной таблице и означает то же, что в генераторе', async () => {
    const { CHECK_CONSTRAINTS } = await loadConstraintsGenerator();
    const actual = await checksInDatabase();

    for (const [name, spec] of Object.entries(CHECK_CONSTRAINTS)) {
      const inDatabase = actual.get(name);

      expect(inDatabase, `проверки ${name} нет в базе`).toBeDefined();
      expect(inDatabase?.table, `проверка ${name} стоит не на той таблице`).toBe(spec.table);
      expect(await checkAsUnderstoodByDatabase(name, spec), `проверка ${name} разошлась`).toBe(
        inDatabase?.definition,
      );
    }
  });

  it('в базе стоят ровно те частичные индексы, которые объявил генератор', async () => {
    const { PARTIAL_UNIQUE_INDEXES, PARTIAL_INDEXES } = await loadConstraintsGenerator();
    const declared = [...Object.keys(PARTIAL_UNIQUE_INDEXES), ...Object.keys(PARTIAL_INDEXES)];
    const actual = await partialIndexesInDatabase();

    expect([...actual.keys()].sort()).toEqual(declared.sort());
  });

  it('каждый частичный индекс собран из тех же колонок и того же предиката', async () => {
    const { PARTIAL_UNIQUE_INDEXES, PARTIAL_INDEXES, INDEX_PREDICATES } =
      await loadConstraintsGenerator();
    const actual = await partialIndexesInDatabase();

    const declared: [string, IndexSpec, boolean][] = [
      ...Object.entries(PARTIAL_UNIQUE_INDEXES).map(
        ([name, spec]) => [name, spec, true] as [string, IndexSpec, boolean],
      ),
      ...Object.entries(PARTIAL_INDEXES).map(
        ([name, spec]) => [name, spec, false] as [string, IndexSpec, boolean],
      ),
    ];

    for (const [name, spec, unique] of declared) {
      const inDatabase = actual.get(name);

      expect(inDatabase, `индекса ${name} нет в базе`).toBeDefined();
      expect(
        await indexAsUnderstoodByDatabase(name, spec, INDEX_PREDICATES[name], unique),
        `индекс ${name} разошёлся`,
      ).toBe(inDatabase);
    }
  });
});
