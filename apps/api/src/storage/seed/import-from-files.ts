// Перенос данных из `data/*.json` в базу (шаги 33.16–33.19).
//
// Три свойства, которые здесь обязаны выполняться, и как именно они обеспечены:
//
// 1. **Порядок вставки уважает внешние ключи.** Справочники → пользователи →
//    публикации → связи → каталог → записи → всё производное. Иначе первая же
//    вставка услуги упёрлась бы в отсутствующий вид спорта.
// 2. **Повторный запуск не удваивает и не падает.** Записи с собственным номером
//    пишутся «вставить или обновить» по этому номеру. Производные строки
//    (связующие таблицы, история переходов, настройки уведомлений, кадры галереи)
//    сначала снимаются у тех родителей, что есть в файлах, и пишутся заново —
//    так из базы уходит и то, что из файла удалили. Строки, которых в файлах нет
//    вовсе, скрипт не трогает: он переносит файлы, а не подчищает базу.
// 3. **Счётчики номеров подняты выше максимума.** Отдельный случай — записи:
//    их счётчик поднимается выше номеров из ВИСЯЧИХ уведомлений, а не выше
//    максимального номера существующей записи. Иначе следующая созданная запись
//    получила бы номер 33, а вместе с ним — три чужих уведомления в ленте.
//
// Запуск: `npm run db:seed` из корня репозитория.

import type { PrismaClient } from '../prisma-client/client';
import { prepareRows, type ChangeLog, type PreparedRows } from './prepare';
import type { SourceData } from './source-data';

/** Сколько строк было в файле и сколько оказалось в базе. */
export type TableCount = {
  /** Имя коллекции так, как она называется в `data/`. */
  collection: string;
  /** Физическое имя таблицы. */
  table: string;
  inFile: number;
  inDatabase: number;
};

/** С какого номера продолжится нумерация. */
export type SequenceStart = { table: string; next: number; reason?: string };

export type ImportReport = {
  counts: TableCount[];
  sequences: SequenceStart[];
  changes: ChangeLog;
};

/**
 * Счётчик номеров записей.
 *
 * Уведомления и журнал ссылаются на записи БЕЗ внешнего ключа — намеренно:
 * они фиксируют в том числе удаление записи и обязаны его пережить. Побочный
 * эффект: в ленте остались уведомления о записях 33, 1006 и 1007, которых нет.
 * Если новая запись получит один из этих номеров, чужая история станет её историей.
 * Поэтому нумерация продолжается выше самого большого висячего номера.
 */
export function bookingSequenceStart(source: SourceData): number {
  const existing = new Set(source.bookings.map((booking) => booking.id));
  const referenced: number[] = [];

  for (const notification of source.notifications) {
    const bookingId = (notification.payload as { bookingId?: unknown }).bookingId;

    if (typeof bookingId === 'number') referenced.push(bookingId);
  }

  for (const entry of source.logs) {
    if (entry.entityType === 'booking') referenced.push(entry.entityId);
  }

  const dangling = referenced.filter((id) => !existing.has(id));

  return Math.max(0, ...existing, ...dangling) + 1;
}

/** Номер строки, который обязан быть: строки готовит `prepareRows`, и он там всегда есть. */
function requireId(id: number | undefined, table: string): number {
  if (id === undefined) {
    throw new Error(`У строки таблицы ${table} нет номера — перенос требует явных номеров`);
  }

  return id;
}

/** Номера строк коллекции. */
function idsOf(rows: { id?: number }[], table: string): number[] {
  return rows.map((row) => requireId(row.id, table));
}

/**
 * Таблицы с собственным счётчиком номеров и то, откуда берётся следующее значение.
 * Связующие таблицы сюда не входят: у них составной ключ и счётчика нет.
 */
const SEQUENCE_SOURCES: { table: string; rows: keyof PreparedRows }[] = [
  { table: 'cities', rows: 'cities' },
  { table: 'sports', rows: 'sports' },
  { table: 'tags', rows: 'tags' },
  { table: 'amenities', rows: 'amenities' },
  { table: 'specialties', rows: 'specialties' },
  { table: 'work_formats', rows: 'workFormats' },
  { table: 'users', rows: 'users' },
  { table: 'clubs', rows: 'clubs' },
  { table: 'trainers', rows: 'trainers' },
  { table: 'trainer_club_links', rows: 'trainerClubLinks' },
  { table: 'offerings', rows: 'offerings' },
  { table: 'schedule', rows: 'schedule' },
  { table: 'bookings', rows: 'bookings' },
  { table: 'booking_status_transitions', rows: 'bookingStatusTransitions' },
  { table: 'reviews', rows: 'reviews' },
  { table: 'notifications', rows: 'notifications' },
  { table: 'logs', rows: 'logs' },
  { table: 'provider_client_notes', rows: 'providerClientNotes' },
  { table: 'club_images', rows: 'clubImages' },
];

export type ImportOptions = {
  /**
   * Клиент базы.
   *
   * Схема отдельным параметром не передаётся: путь поиска задаёт само соединение
   * (`storage/prisma.service.ts`), и второе место с тем же именем схемы рано или
   * поздно разошлось бы с первым. Что путь действительно настроен — проверяется
   * по месту, при подъёме счётчиков.
   */
  client: PrismaClient;
  /**
   * Применять ли чистку мусорных текстов (таблица 15.2).
   *
   * Словарь починок привязан к номерам записей боевых данных, поэтому включается
   * только переносом из файлов. Сид для разработки идёт без него.
   */
  repairTexts?: boolean;
  /**
   * Пересчитывать ли денормализованные счётчики (занятые места, агрегаты отзывов).
   *
   * По умолчанию да — перенос из файлов чинит счётчики, разъехавшиеся за годы.
   * Тестовая обвязка отключает: она обязана положить в базу ровно то, что объявил
   * набор, иначе та же проверка на файлах и на базе перестанет быть той же проверкой.
   */
  recalculate?: boolean;
  source: SourceData;
};

/** Перенести срез в базу и вернуть отчёт. */
export async function importSourceData({
  client,
  source,
  repairTexts = false,
  recalculate = true,
}: ImportOptions): Promise<ImportReport> {
  const { rows, changes } = prepareRows(source, { repairTexts, recalculate });

  // Вся вставка — одна транзакция: наполовину перенесённая база хуже непере-
  // несённой, потому что выглядит рабочей. Пределы заданы явно — умолчальных
  // пяти секунд на четыре сотни строк не хватает.
  await client.$transaction(
    async (tx) => {
      // --- Справочники ---
      for (const row of rows.cities) {
        await tx.city.upsert({
          where: { id: requireId(row.id, 'cities') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.sports) {
        await tx.sport.upsert({
          where: { id: requireId(row.id, 'sports') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.tags) {
        await tx.tag.upsert({ where: { id: requireId(row.id, 'tags') }, create: row, update: row });
      }
      for (const row of rows.amenities) {
        await tx.amenity.upsert({
          where: { id: requireId(row.id, 'amenities') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.specialties) {
        await tx.specialty.upsert({
          where: { id: requireId(row.id, 'specialties') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.workFormats) {
        await tx.workFormat.upsert({
          where: { id: requireId(row.id, 'work_formats') },
          create: row,
          update: row,
        });
      }

      // --- Люди и публикации ---
      for (const row of rows.users) {
        await tx.user.upsert({
          where: { id: requireId(row.id, 'users') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.clubs) {
        await tx.club.upsert({
          where: { id: requireId(row.id, 'clubs') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.trainers) {
        await tx.trainer.upsert({
          where: { id: requireId(row.id, 'trainers') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.trainerClubLinks) {
        await tx.trainerClubLink.upsert({
          where: { id: requireId(row.id, 'trainer_club_links') },
          create: row,
          update: row,
        });
      }

      // --- Каталог и записи ---
      for (const row of rows.offerings) {
        await tx.offering.upsert({
          where: { id: requireId(row.id, 'offerings') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.schedule) {
        await tx.schedule.upsert({
          where: { id: requireId(row.id, 'schedule') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.bookings) {
        await tx.booking.upsert({
          where: { id: requireId(row.id, 'bookings') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.reviews) {
        await tx.review.upsert({
          where: { id: requireId(row.id, 'reviews') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.notifications) {
        await tx.notification.upsert({
          where: { id: requireId(row.id, 'notifications') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.logs) {
        await tx.logEntry.upsert({
          where: { id: requireId(row.id, 'logs') },
          create: row,
          update: row,
        });
      }
      for (const row of rows.providerClientNotes) {
        await tx.providerClientNote.upsert({
          where: { id: requireId(row.id, 'provider_client_notes') },
          create: row,
          update: row,
        });
      }

      // --- Производные строки: снять у известных родителей и записать заново ---
      //
      // Именно снять, а не «дописать недостающие»: иначе связь, убранная из файла,
      // осталась бы в базе навсегда. Своей истории у этих строк нет — их содержимое
      // целиком определяется родителем, — поэтому пересоздание ничего не теряет.
      const userIds = idsOf(rows.users, 'users');
      const clubIds = idsOf(rows.clubs, 'clubs');
      const trainerIds = idsOf(rows.trainers, 'trainers');
      const bookingIds = idsOf(rows.bookings, 'bookings');

      await tx.userNotificationPreference.deleteMany({ where: { userId: { in: userIds } } });
      await tx.userFavoriteClub.deleteMany({ where: { userId: { in: userIds } } });
      await tx.clubSport.deleteMany({ where: { clubId: { in: clubIds } } });
      await tx.clubTag.deleteMany({ where: { clubId: { in: clubIds } } });
      await tx.clubAmenity.deleteMany({ where: { clubId: { in: clubIds } } });
      await tx.clubImage.deleteMany({ where: { clubId: { in: clubIds } } });
      await tx.trainerSport.deleteMany({ where: { trainerId: { in: trainerIds } } });
      await tx.trainerSpecialty.deleteMany({ where: { trainerId: { in: trainerIds } } });
      await tx.trainerWorkFormat.deleteMany({ where: { trainerId: { in: trainerIds } } });
      await tx.bookingStatusTransition.deleteMany({ where: { bookingId: { in: bookingIds } } });

      if (rows.userNotificationPreferences.length > 0) {
        await tx.userNotificationPreference.createMany({ data: rows.userNotificationPreferences });
      }
      if (rows.userFavoriteClubs.length > 0) {
        await tx.userFavoriteClub.createMany({ data: rows.userFavoriteClubs });
      }
      if (rows.clubSports.length > 0) await tx.clubSport.createMany({ data: rows.clubSports });
      if (rows.clubTags.length > 0) await tx.clubTag.createMany({ data: rows.clubTags });
      if (rows.clubAmenities.length > 0) {
        await tx.clubAmenity.createMany({ data: rows.clubAmenities });
      }
      if (rows.clubImages.length > 0) await tx.clubImage.createMany({ data: rows.clubImages });
      if (rows.trainerSports.length > 0) {
        await tx.trainerSport.createMany({ data: rows.trainerSports });
      }
      if (rows.trainerSpecialties.length > 0) {
        await tx.trainerSpecialty.createMany({ data: rows.trainerSpecialties });
      }
      if (rows.trainerWorkFormats.length > 0) {
        await tx.trainerWorkFormat.createMany({ data: rows.trainerWorkFormats });
      }
      if (rows.bookingStatusTransitions.length > 0) {
        await tx.bookingStatusTransition.createMany({ data: rows.bookingStatusTransitions });
      }
    },
    { maxWait: 15_000, timeout: 180_000 },
  );

  const sequences = await applySequenceStarts(client, rows, bookingSequenceStart(source));
  const counts = await countRows(client, rows);

  return { counts, sequences, changes };
}

/**
 * Поднять счётчики номеров.
 *
 * `setval(..., false)` означает «следующее значение будет ровно таким»: так номер
 * читается в отчёте буквально, без арифметики в уме.
 */
async function applySequenceStarts(
  client: PrismaClient,
  rows: PreparedRows,
  bookingsNext: number,
): Promise<SequenceStart[]> {
  const applied: SequenceStart[] = [];

  for (const { table, rows: key } of SEQUENCE_SOURCES) {
    const ids = (rows[key] as { id?: number }[]).map((row) => row.id ?? 0);
    const fromRows = Math.max(0, ...ids) + 1;
    const isBookings = table === 'bookings';
    const next = isBookings ? Math.max(fromRows, bookingsNext) : fromRows;

    // Результат читается, а не отбрасывается. `pg_get_serial_sequence` для неизвестной
    // таблицы возвращает пустое значение, а `setval` от пустого — тоже пустое И БЕЗ ОШИБКИ.
    // Молчаливый отказ здесь худший из возможных: счётчик остался бы на единице,
    // и первая же созданная запись упала бы на занятом номере.
    const result = await client.$queryRawUnsafe<{ value: string | null }[]>(
      'SELECT setval(pg_get_serial_sequence($1, $2), $3, false) AS value',
      table,
      'id',
      next,
    );

    if (result[0]?.value == null) {
      throw new Error(
        `Не нашёл счётчик номеров таблицы ${table}. ` +
          'Скорее всего соединение открыто без пути поиска схемы — см. storage/prisma.service.ts.',
      );
    }

    applied.push({
      table,
      next,
      reason: isBookings && next > fromRows ? 'выше номеров из висячих уведомлений' : undefined,
    });
  }

  return applied;
}

/** Сколько строк оказалось в базе — считает сама база, а не скрипт. */
async function countRows(client: PrismaClient, rows: PreparedRows): Promise<TableCount[]> {
  const pairs: {
    collection: string;
    table: string;
    key: keyof PreparedRows;
    count: () => Promise<number>;
  }[] = [
    { collection: 'cities', table: 'cities', key: 'cities', count: () => client.city.count() },
    { collection: 'sports', table: 'sports', key: 'sports', count: () => client.sport.count() },
    { collection: 'tags', table: 'tags', key: 'tags', count: () => client.tag.count() },
    {
      collection: 'amenities',
      table: 'amenities',
      key: 'amenities',
      count: () => client.amenity.count(),
    },
    {
      collection: 'specialties',
      table: 'specialties',
      key: 'specialties',
      count: () => client.specialty.count(),
    },
    {
      collection: 'work-formats',
      table: 'work_formats',
      key: 'workFormats',
      count: () => client.workFormat.count(),
    },
    { collection: 'users', table: 'users', key: 'users', count: () => client.user.count() },
    { collection: 'clubs', table: 'clubs', key: 'clubs', count: () => client.club.count() },
    {
      collection: 'trainers',
      table: 'trainers',
      key: 'trainers',
      count: () => client.trainer.count(),
    },
    {
      collection: 'trainer-club-links',
      table: 'trainer_club_links',
      key: 'trainerClubLinks',
      count: () => client.trainerClubLink.count(),
    },
    {
      collection: 'offerings',
      table: 'offerings',
      key: 'offerings',
      count: () => client.offering.count(),
    },
    {
      collection: 'schedule',
      table: 'schedule',
      key: 'schedule',
      count: () => client.schedule.count(),
    },
    {
      collection: 'bookings',
      table: 'bookings',
      key: 'bookings',
      count: () => client.booking.count(),
    },
    {
      collection: 'bookings[].statusHistory',
      table: 'booking_status_transitions',
      key: 'bookingStatusTransitions',
      count: () => client.bookingStatusTransition.count(),
    },
    { collection: 'reviews', table: 'reviews', key: 'reviews', count: () => client.review.count() },
    {
      collection: 'notifications',
      table: 'notifications',
      key: 'notifications',
      count: () => client.notification.count(),
    },
    { collection: 'logs', table: 'logs', key: 'logs', count: () => client.logEntry.count() },
    {
      collection: 'provider-client-notes',
      table: 'provider_client_notes',
      key: 'providerClientNotes',
      count: () => client.providerClientNote.count(),
    },
    {
      collection: 'clubs[].imageUrls',
      table: 'club_images',
      key: 'clubImages',
      count: () => client.clubImage.count(),
    },
    {
      collection: 'clubs[].sportIds',
      table: 'club_sports',
      key: 'clubSports',
      count: () => client.clubSport.count(),
    },
    {
      collection: 'clubs[].tagIds',
      table: 'club_tags',
      key: 'clubTags',
      count: () => client.clubTag.count(),
    },
    {
      collection: 'clubs[].amenityIds',
      table: 'club_amenities',
      key: 'clubAmenities',
      count: () => client.clubAmenity.count(),
    },
    {
      collection: 'trainers[].sportIds',
      table: 'trainer_sports',
      key: 'trainerSports',
      count: () => client.trainerSport.count(),
    },
    {
      collection: 'trainers[].specialtyIds',
      table: 'trainer_specialties',
      key: 'trainerSpecialties',
      count: () => client.trainerSpecialty.count(),
    },
    {
      collection: 'trainers[].workFormatIds',
      table: 'trainer_work_formats',
      key: 'trainerWorkFormats',
      count: () => client.trainerWorkFormat.count(),
    },
    {
      collection: 'users[].favoriteClubIds',
      table: 'user_favorite_clubs',
      key: 'userFavoriteClubs',
      count: () => client.userFavoriteClub.count(),
    },
    {
      collection: 'users[].notificationPreferences',
      table: 'user_notification_preferences',
      key: 'userNotificationPreferences',
      count: () => client.userNotificationPreference.count(),
    },
  ];

  const result: TableCount[] = [];

  for (const pair of pairs) {
    result.push({
      collection: pair.collection,
      table: pair.table,
      inFile: (rows[pair.key] as unknown[]).length,
      inDatabase: await pair.count(),
    });
  }

  return result;
}

/** Подписи отчёта: у переноса и у сида разный источник строк. */
export type ReportLabels = {
  /** Заголовок раздела с количествами. */
  title?: string;
  /** Как называть колонку «сколько строк было на входе». */
  prepared?: string;
};

/** Отчёт для человека: таблица «коллекция → строк на входе → строк в базе» и что изменилось. */
export function formatImportReport(report: ImportReport, labels: ReportLabels = {}): string {
  const { title = 'ПЕРЕНЕСЕНО', prepared = 'в файле' } = labels;
  const lines: string[] = [];
  const width = Math.max(...report.counts.map((row) => row.collection.length), 'коллекция'.length);
  const tableWidth = Math.max(...report.counts.map((row) => row.table.length), 'таблица'.length);

  lines.push(title);
  lines.push(
    `  ${'коллекция'.padEnd(width)}  ${'таблица'.padEnd(tableWidth)}  ${prepared.padStart(7)}   в базе`,
  );

  let mismatched = 0;

  for (const row of report.counts) {
    const mark = row.inFile === row.inDatabase ? ' ' : '!';

    if (row.inFile !== row.inDatabase) mismatched += 1;

    lines.push(
      `${mark} ${row.collection.padEnd(width)}  ${row.table.padEnd(tableWidth)}  ${String(row.inFile).padStart(7)}  ${String(row.inDatabase).padStart(7)}`,
    );
  }

  const total = report.counts.reduce((sum, row) => sum + row.inDatabase, 0);

  lines.push(`  Всего строк в базе: ${total}`);

  if (mismatched > 0) {
    lines.push(
      `  ⚠ Расхождений по количеству: ${mismatched}. Строки, помеченные «!», в базе есть сверх исходного набора — скрипт их не удаляет.`,
    );
  }

  const section = (title: string, items: string[]): void => {
    lines.push('');
    lines.push(`${title} (${items.length})`);

    if (items.length === 0) {
      lines.push('  — нечего');

      return;
    }

    for (const item of items) lines.push(`  · ${item}`);
  };

  section('ПОЧИНЕНО', report.changes.repairs);
  section('СПАСЕНО ИЗ ПОЛЕЙ ВНЕ ТИПОВ', report.changes.rescues);

  lines.push('');
  lines.push(`ПЕРЕСЧИТАНО (${report.changes.recalculations.length})`);

  if (report.changes.recalculations.length === 0) {
    lines.push('  — расхождений с исходным набором нет');
  } else {
    for (const item of report.changes.recalculations) {
      lines.push(`  · ${item.subject}: было ${item.was}, стало ${item.now}`);
    }
  }

  section('ОТМЕЧЕНО', report.changes.notes);

  lines.push('');
  lines.push('НУМЕРАЦИЯ ПРОДОЛЖИТСЯ С');

  for (const item of report.sequences) {
    lines.push(`  · ${item.table}: ${item.next}${item.reason ? ` (${item.reason})` : ''}`);
  }

  return lines.join('\n');
}
