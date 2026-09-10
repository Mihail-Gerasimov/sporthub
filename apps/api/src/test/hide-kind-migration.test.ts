// Разметка прошлого миграцией 20260911000000_publication_hide_kind (шаг 36.12).
//
// ⚠️ Зачем отдельный набор. Колонка `hidden_kind` заводится аддитивно и у существующих
// строк оказалась бы пустой — то есть у всех публикаций, скрытых ДО этой фазы, вида
// скрытия не было бы вовсе, и плашка у них не показалась бы ни одна. Разметка делается
// внутри миграции один раз, и проверить её обычным тестом сервиса нельзя: сервис
// работает уже с размеченными данными.
//
// ⚠️ Почему тест исполняет САМ ФАЙЛ миграции, а не свою копию запроса. Копия доказывала
// бы, что верна копия. Здесь читается тот же SQL, который поедет на боевой сервер:
// разойтись им негде.
//
// На живой базе разметку наблюдать было не на чем — скрытых публикаций там ноль
// на момент выкатки. Это не повод не проверять: завтра их не ноль.

import { readFileSync } from 'node:fs';
import path from 'node:path';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { OWNER_ARCHIVE_REASON } from '../publications/publication.service';
import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';
import { API_ROOT } from './repo-root';

/** Запросы разметки из самой миграции — без объявления колонок и индексов. */
function backfillStatements(): string[] {
  const file = path.join(
    API_ROOT,
    'prisma',
    'migrations',
    '20260911000000_publication_hide_kind',
    'migration.sql',
  );
  // Комментарии снимаются ДО разбора: первый UPDATE в файле идёт следом за пояснением,
  // и без этого он опознавался бы как «не UPDATE» — тест зеленел бы, проверив половину.
  const sql = readFileSync(file, 'utf8')
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n');

  // Берём только UPDATE: ALTER и CREATE INDEX уже накачены на схему исполнителя,
  // повторный прогон уронил бы набор по чужой причине.
  return sql
    .split(';')
    .map((statement) => statement.trim())
    .filter((statement) => statement.toUpperCase().startsWith('UPDATE'));
}

describe('миграция размечает вид скрытия у публикаций, скрытых ДО фазы 36', () => {
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
    counter = 0;
  });

  /**
   * Публикация в том виде, в каком она лежала до миграции: вида скрытия нет.
   *
   * Заводится клиентом Prisma, а не сырым `INSERT`: у таблицы есть обязательные
   * служебные колонки (нормализованные имя и адрес-ссылка), и сырой запрос
   * пришлось бы править при каждом их изменении — то есть он разъехался бы молча.
   */
  let counter = 0;

  const insertClub = async (status: string, reason: string | null): Promise<number> => {
    counter += 1;
    const id = counter;
    const created = await db.prisma.club.create({
      data: {
        name: `Клуб ${id}`,
        slug: `club-${id}`,
        slugNormalized: `club-${id}`,
        shortDescription: '',
        description: '',
        city: 'Самара',
        address: 'ул. Тестовая, 1',
        phone: '+7 (900) 000-00-00',
        rating: 0,
        reviewCount: 0,
        priceFrom: 1000,
        distanceKm: 0,
        latitude: 53.2,
        longitude: 50.1,
        source: 'provider',
        status,
        hideReason: reason,
        // Вид скрытия намеренно пуст: именно так строка и выглядела до миграции.
        hiddenKind: null,
      },
    });

    return created.id;
  };

  const run = async (): Promise<void> => {
    for (const statement of backfillStatements()) {
      await db.prisma.$executeRawUnsafe(statement);
    }
  };

  const kindOf = async (id: number): Promise<string | null> => {
    const rows = await db.prisma.$queryRawUnsafe<{ hidden_kind: string | null }[]>(
      'SELECT hidden_kind FROM clubs WHERE id = $1',
      id,
    );

    return rows[0]?.hidden_kind ?? null;
  };

  it('архив владельца опознаётся по служебной причине', async () => {
    const id = await insertClub('hidden', OWNER_ARCHIVE_REASON);
    await run();

    expect(await kindOf(id)).toBe('owner_archive');
  });

  it('всё остальное скрытое — работа модератора', async () => {
    const withReason = await insertClub('hidden', 'Жалоба на содержание');
    const withoutReason = await insertClub('hidden', null);
    await run();

    expect(await kindOf(withReason)).toBe('moderation');
    expect(await kindOf(withoutReason)).toBe('moderation');
  });

  it('опубликованная публикация вида скрытия не получает', async () => {
    // Иначе признак появился бы у живых карточек, и отбор «что скрыто» поехал бы.
    const id = await insertClub('published', null);
    await run();

    expect(await kindOf(id)).toBeNull();
  });

  it('после разметки ни одна скрытая публикация не остаётся без вида', async () => {
    // Главный инвариант: он же держится дальше кодом сервиса.
    await insertClub('hidden', OWNER_ARCHIVE_REASON);
    await insertClub('hidden', 'Реклама');
    await insertClub('published', null);
    await run();

    const rows = await db.prisma.$queryRawUnsafe<{ count: bigint }[]>(
      "SELECT count(*) AS count FROM clubs WHERE status = 'hidden' AND hidden_kind IS NULL",
    );

    expect(Number(rows[0].count)).toBe(0);
  });

  it('разметка идёт по тексту причины ТОЛЬКО здесь и только один раз', () => {
    // ⚠️ Сторож замысла. Текст причины — содержимое поля, а не признак: владелец волен
    // вписать ту же строку руками. Опираться на неё можно ровно один раз — при переносе
    // прошлого, — и этот тест существует, чтобы попытка вернуть такое различение
    // в рабочий код была видна. В самом коде вид скрытия читается из колонки.
    const sql = backfillStatements().join('\n');

    expect(sql).toContain(OWNER_ARCHIVE_REASON);
    expect(backfillStatements()).toHaveLength(2);
  });
});
