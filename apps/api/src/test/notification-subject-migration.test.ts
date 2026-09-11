// Перевод прежних форм ссылки миграцией 20260911120000_notification_subject (шаг 36.51).
//
// ⚠️ Зачем отдельный набор. Строки, написанные до этого шага, называют предмет
// одной из ЧЕТЫРЁХ прежних форм, и новый читатель их не понимает. Проверить
// перевод обычным тестом сервиса нельзя: сервис работает уже с переведёнными
// данными, а прежних форм он больше не пишет вовсе.
//
// ⚠️ Почему тест исполняет САМ ФАЙЛ миграции, а не свою копию запроса. Копия
// доказывала бы, что верна копия. Здесь читается тот же SQL, который поедет
// на боевой сервер: разойтись им негде (образец — `hide-kind-migration.test.ts`).
//
// ⚠️ Главная проверка набора — последняя: после перевода в базе не остаётся
// НИ ОДНОЙ строки прежних форм. Именно это, а не отдельные удачные примеры,
// снимает с читателей обязанность разбирать вторую форму.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { NOTIFICATION_SUBJECT_TYPES } from '@sporthub/types';

import type { Prisma } from '../storage/prisma-client/client';
import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';
import { API_ROOT } from './repo-root';

/** Запросы перевода из самой миграции. */
function migrationStatements(): string[] {
  const file = path.join(
    API_ROOT,
    'prisma',
    'migrations',
    '20260911120000_notification_subject',
    'migration.sql',
  );
  // Комментарии снимаются ДО разбора: первый UPDATE идёт следом за пояснением,
  // и без этого он опознавался бы как «не UPDATE» — набор зеленел бы, проверив ничего.
  const sql = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.toUpperCase().startsWith('UPDATE'));
}

describe('миграция переводит прежние формы ссылки на предмет в одну (36.51)', () => {
  let db: TestDatabase;
  let counter = 0;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  });

  afterAll(async () => {
    await db.close();
  });

  beforeEach(async () => {
    await db.truncateAll();
    counter = 0;
  });

  /** Человек-адресат: у уведомления колонка владельца обязательна. */
  const insertUser = async (): Promise<number> => {
    counter += 1;
    const created = await db.prisma.user.create({
      data: {
        name: `Человек ${counter}`,
        email: `subject-${counter}@test.local`,
        phone: '+7 (900) 000-00-00',
        passwordHash: 'x',
        accountKind: 'person',
        status: 'active',
      },
    });

    return created.id;
  };

  /** Уведомление в том виде, в каком оно лежало до миграции. */
  const insertNotification = async (
    type: string,
    payload: Record<string, unknown>,
  ): Promise<number> => {
    const userId = await insertUser();
    const created = await db.prisma.notification.create({
      // Приведение — то же, что в самом хранилище: `payload` полиморфен,
      // и у клиента базы для него свой тип значения.
      data: { userId, type, payload: payload as Prisma.InputJsonValue },
    });

    return created.id;
  };

  const run = async (): Promise<void> => {
    for (const statement of migrationStatements()) {
      await db.prisma.$executeRawUnsafe(statement);
    }
  };

  const payloadOf = async (id: number): Promise<Record<string, unknown>> => {
    const rows = await db.prisma.$queryRawUnsafe<{ payload: Record<string, unknown> }[]>(
      'SELECT payload FROM notifications WHERE id = $1',
      id,
    );

    return rows[0].payload;
  };

  it('прямая форма: номер клуба становится парой «вид + номер»', async () => {
    const id = await insertNotification('link_requested', { clubId: 7, initiatedBy: 'trainer' });
    await run();

    // Предмет назван парой, прежний ключ снят, а всё остальное — на месте:
    // `initiatedBy` читает текст уведомления, и потерять его нельзя.
    expect(await payloadOf(id)).toEqual({
      subjectType: 'club',
      subjectId: 7,
      initiatedBy: 'trainer',
    });
  });

  it('парная форма отзыва: предмет — сам отзыв, а не лицо, о котором он написан', async () => {
    // ⚠️ Строка несёт ОБЕ прежние формы сразу: и `reviewId`, и пару
    // `entityType` + `entityId`. Порядок ветвей решает, какая победит.
    const id = await insertNotification('review_received_by_provider', {
      reviewId: 12,
      entityType: 'club',
      entityId: 7,
      rating: 5,
      entityName: 'Волна',
    });
    await run();

    expect(await payloadOf(id)).toEqual({
      subjectType: 'review',
      subjectId: 12,
      rating: 5,
      entityName: 'Волна',
    });
  });

  it('форма шага 36.21: публикация названа своим видом', async () => {
    const club = await insertNotification('publication_recheck_requested', {
      publicationType: 'club',
      publicationId: 3,
      publicationName: 'Волна',
    });
    const trainer = await insertNotification('publication_recheck_requested', {
      publicationType: 'trainer',
      publicationId: 4,
      publicationName: 'Марина',
    });
    await run();

    expect(await payloadOf(club)).toEqual({
      subjectType: 'club',
      subjectId: 3,
      publicationName: 'Волна',
    });
    expect(await payloadOf(trainer)).toEqual({
      subjectType: 'trainer',
      subjectId: 4,
      publicationName: 'Марина',
    });
  });

  it('косвенная форма: запись и связь остаются предметом сами', async () => {
    const booking = await insertNotification('booking_confirmed', { bookingId: 21 });
    const link = await insertNotification('link_revoked', {
      linkId: 9,
      clubId: 7,
      trainerId: 8,
      revokedBy: 'club',
    });
    await run();

    expect(await payloadOf(booking)).toEqual({ subjectType: 'booking', subjectId: 21 });
    // У связи прежняя форма несла ТРИ номера сразу; предмет — сама связь.
    expect(await payloadOf(link)).toEqual({
      subjectType: 'link',
      subjectId: 9,
      revokedBy: 'club',
    });
  });

  it('строка без ссылки на предмет переживает миграцию нетронутой', async () => {
    // `payload` полиморфен, и CASE без совпавшей ветви вернул бы NULL.
    // Такая строка обязана остаться собой, а не потерять содержимое.
    const id = await insertNotification('booking_completed', { note: 'без ссылки' });
    await run();

    expect(await payloadOf(id)).toEqual({ note: 'без ссылки' });
  });

  it('после миграции в базе не остаётся ни одной прежней формы', async () => {
    // Главный инвариант набора: именно он снимает с читателей обязанность
    // разбирать вторую форму «на всякий случай».
    await insertNotification('link_requested', { clubId: 7, initiatedBy: 'club' });
    await insertNotification('link_requested', { trainerId: 8, initiatedBy: 'trainer' });
    await insertNotification('booking_no_show', { bookingId: 21 });
    await insertNotification('review_published_for_athlete', {
      reviewId: 12,
      entityType: 'trainer',
      entityId: 8,
    });
    await insertNotification('publication_recheck_requested', {
      publicationType: 'trainer',
      publicationId: 4,
    });
    await run();

    const rows = await db.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      `SELECT count(*) AS count FROM notifications
       WHERE payload ?| ARRAY['clubId','trainerId','entityType','entityId',
                              'publicationType','publicationId','bookingId','reviewId','linkId']`,
    );

    expect(Number(rows[0].count)).toBe(0);

    // И каждая переведённая строка называет предмет видом из словаря.
    const subjects = await db.prisma.$queryRawUnsafe<{ subject_type: string | null }[]>(
      "SELECT payload->>'subjectType' AS subject_type FROM notifications",
    );

    for (const row of subjects) {
      expect(NOTIFICATION_SUBJECT_TYPES).toContain(row.subject_type);
    }
  });
});
