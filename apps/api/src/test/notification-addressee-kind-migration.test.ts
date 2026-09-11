// Миграция 20260911140000_notification_addressee_kind (шаг 37.5).
//
// ⚠️ Зачем отдельный набор. Строки, написанные до фазы 37, вида адресата не несут,
// и его надо восстановить по тем самым колонкам, из которых он выводился раньше.
// Обычный тест сервиса этого не покажет: сервис работает уже с восстановленными
// данными и строк без вида больше не пишет вовсе.
//
// ⚠️ Тест исполняет САМ ФАЙЛ миграции, а не свою копию запроса. Копия доказывала бы,
// что верна копия; здесь читается тот же SQL, который поедет на боевой сервер
// (образец — `notification-subject-migration.test.ts`).
//
// ⚠️ Главных проверок две, и вторая важнее первой. Первая — что перевод верен.
// Вторая — что у колонки НЕТ УМОЛЧАНИЯ: с умолчанием «забыли записать вид» означало бы
// «строка молча стала личной», ответ 200 и письмо не у того. Без умолчания забывчивость
// падает на вставке, то есть находится сразу.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NOTIFICATION_ADDRESSEE_KINDS } from '@sporthub/domain';

import type { Prisma } from '../storage/prisma-client/client';
import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';
import { API_ROOT, REPO_ROOT } from './repo-root';

/** Запрос заполнения из самой миграции. */
function backfillStatements(): string[] {
  const file = path.join(
    API_ROOT,
    'prisma',
    'migrations',
    '20260911140000_notification_addressee_kind',
    'migration.sql',
  );
  // Комментарии снимаются ДО разбора: запрос идёт следом за пояснением, и без
  // этого он опознавался бы как «не UPDATE» — набор зеленел бы, проверив ничего.
  const sql = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.toUpperCase().startsWith('UPDATE'));
}

describe('миграция восстанавливает вид адресата у прежних строк (37.5)', () => {
  let db: TestDatabase;
  let counter = 0;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    // Возврат ограничения: снятое и не возвращённое, оно превратило бы соседние
    // проверки этого же файла в проверки без защиты.
    const { CHECK_CONSTRAINTS } = (await import(
      pathToFileURL(path.join(REPO_ROOT, 'scripts', 'db-constraints.mjs')).href
    )) as { CHECK_CONSTRAINTS: Record<string, { table: string; expression: string }> };
    const spec = CHECK_CONSTRAINTS.notifications_addressee_shape;

    await db.prisma.$executeRawUnsafe(
      `ALTER TABLE ${spec.table} ADD CONSTRAINT notifications_addressee_shape CHECK (${spec.expression})`,
    );
    await db.close();
  });

  beforeEach(async () => {
    await db.truncateAll();
    counter = 0;

    // ⚠️ Ограничение формы снимается НА ВРЕМЯ набора — и это не послабление,
    // а условие проверки. Миграция восстанавливает вид адресата у строк, написанных
    // ДО фазы 37, то есть до того, как ограничение появилось. Пока оно стоит,
    // «строку с неверным видом» физически невозможно записать — и проверять
    // было бы нечего: набор зеленел бы, ничего не восстановив.
    //
    // Схема у каждого файла набора своя, поэтому снятие не задевает соседей.
    // Ограничение возвращается в `afterAll`, и его возврат тоже проверяется.
    await db.prisma.$executeRawUnsafe(
      'ALTER TABLE notifications DROP CONSTRAINT IF EXISTS notifications_addressee_shape',
    );
  });

  const insertUser = async (): Promise<number> => {
    counter += 1;
    const created = await db.prisma.user.create({
      data: {
        name: `Человек ${counter}`,
        email: `addressee-kind-${counter}@test.local`,
        phone: '+7 (900) 000-00-00',
        passwordHash: 'x',
        accountKind: 'person',
        status: 'active',
      },
    });

    return created.id;
  };

  const insertClub = async (managedByUserId: number): Promise<number> => {
    counter += 1;
    const created = await db.prisma.club.create({
      data: {
        name: `Клуб ${counter}`,
        slug: `klub-addressee-${counter}`,
        slugNormalized: `klub-addressee-${counter}`,
        description: 'Описание',
        shortDescription: 'Кратко',
        city: 'Самара',
        address: 'ул. Ленина, 1',
        phone: '+7 (846) 000-00-00',
        latitude: 53.2,
        longitude: 50.1,
        priceFrom: 1000,
        managedByUserId,
        status: 'published',
      },
    });

    return created.id;
  };

  const insertTrainer = async (managedByUserId: number): Promise<number> => {
    counter += 1;
    const created = await db.prisma.trainer.create({
      data: {
        name: `Карточка ${counter}`,
        slug: `kartochka-addressee-${counter}`,
        slugNormalized: `kartochka-addressee-${counter}`,
        bio: 'Описание',
        avatarUrl: '',
        experienceYears: 5,
        priceFrom: 1000,
        city: 'Самара',
        address: 'ул. Ленина, 2',
        phone: '+7 (900) 000-00-02',
        latitude: 53.2,
        longitude: 50.1,
        managedByUserId,
        status: 'published',
      },
    });

    return created.id;
  };

  /**
   * Строка в том виде, в каком она лежала ДО миграции.
   *
   * ⚠️ Вид адресата ставится заведомо неверный — `'supervision'`. Поставить
   * правильный означало бы проверить, что миграция ничего не испортила; здесь
   * проверяется, что она действительно ВЫЧИСЛЯЕТ вид, а не оставляет как есть.
   */
  const insertNotification = async (face: {
    clubId?: number;
    trainerId?: number;
    userId: number;
  }): Promise<number> => {
    const created = await db.prisma.notification.create({
      data: {
        userId: face.userId,
        addresseeKind: 'supervision',
        addresseeClubId: face.clubId ?? null,
        addresseeTrainerId: face.trainerId ?? null,
        type: 'booking_requested',
        payload: { subjectType: 'booking', subjectId: 1 } as Prisma.InputJsonValue,
      },
    });

    return created.id;
  };

  const run = async (): Promise<void> => {
    for (const statement of backfillStatements()) {
      await db.prisma.$executeRawUnsafe(statement);
    }
  };

  const kindOf = async (id: number): Promise<string> => {
    const rows = await db.prisma.$queryRawUnsafe<{ addressee_kind: string }[]>(
      'SELECT addressee_kind FROM notifications WHERE id = $1',
      id,
    );

    return rows[0].addressee_kind;
  };

  it('строка без лица становится личной', async () => {
    const userId = await insertUser();
    const id = await insertNotification({ userId });

    await run();

    expect(await kindOf(id)).toBe('personal');
  });

  it('строка с клубом становится ящиком клуба', async () => {
    const userId = await insertUser();
    const clubId = await insertClub(userId);
    const id = await insertNotification({ userId, clubId });

    await run();

    expect(await kindOf(id)).toBe('club');
  });

  it('строка с карточкой тренера становится ящиком карточки', async () => {
    const userId = await insertUser();
    const trainerId = await insertTrainer(userId);
    const id = await insertNotification({ userId, trainerId });

    await run();

    expect(await kindOf(id)).toBe('trainer');
  });

  it('ни одна строка не сменила ящик: колонки лица остались прежними', async () => {
    // ⚠️ Главное обещание миграции — «прежние строки остались корректными».
    // Проверяется не примерами, а тем, что после перевода НЕ осталось строк,
    // у которых вид расходится с колонками.
    const userId = await insertUser();
    const clubId = await insertClub(userId);
    const trainerId = await insertTrainer(userId);

    await insertNotification({ userId });
    await insertNotification({ userId, clubId });
    await insertNotification({ userId, trainerId });

    await run();

    const mismatched = await db.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM notifications
       WHERE (addressee_club_id IS NOT NULL AND addressee_kind <> 'club')
          OR (addressee_trainer_id IS NOT NULL AND addressee_kind <> 'trainer')
          OR (addressee_club_id IS NULL AND addressee_trainer_id IS NULL
              AND addressee_kind <> 'personal')`,
    );

    expect(Number(mismatched[0].count)).toBe(0);
  });

  it('после миграции ни одна строка не осталась без вида адресата', async () => {
    const userId = await insertUser();
    await insertNotification({ userId });

    await run();

    const unknown = await db.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM notifications
       WHERE addressee_kind IS NULL OR addressee_kind NOT IN (${NOTIFICATION_ADDRESSEE_KINDS.map(
         (kind) => `'${kind}'`,
       ).join(', ')})`,
    );

    expect(Number(unknown[0].count)).toBe(0);
  });
});

describe('колонка вида адресата обязательна и БЕЗ умолчания (37.5)', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  it('колонка объявлена NOT NULL', async () => {
    const rows = await db.prisma.$queryRawUnsafe<{ is_nullable: string }[]>(
      `SELECT is_nullable FROM information_schema.columns
       WHERE table_name = 'notifications' AND column_name = 'addressee_kind'
         AND table_schema = current_schema()`,
    );

    expect(rows[0]?.is_nullable).toBe('NO');
  });

  it('у колонки НЕТ значения по умолчанию', async () => {
    // ⚠️ Это не мелочь оформления. Умолчание превращает забытый вид адресата
    // в молчаливую личную строку: ответ 200, письмо не у того, тест по API зелёный.
    // Без умолчания та же забывчивость падает на вставке.
    const rows = await db.prisma.$queryRawUnsafe<{ column_default: string | null }[]>(
      `SELECT column_default FROM information_schema.columns
       WHERE table_name = 'notifications' AND column_name = 'addressee_kind'
         AND table_schema = current_schema()`,
    );

    expect(rows[0]?.column_default).toBeNull();
  });

  it('временное ограничение заполненности снято после миграции', async () => {
    // Оно своё дело сделало — сняло скан у SET NOT NULL — и стало платой ни за что:
    // NOT NULL колонки покрывает его полностью.
    const rows = await db.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT COUNT(*)::bigint AS count FROM pg_constraint
       WHERE conname = 'notifications_addressee_kind_present'`,
    );

    expect(Number(rows[0].count)).toBe(0);
  });
});
