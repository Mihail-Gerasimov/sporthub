// Запись демонстрационного набора в базу по ЕСТЕСТВЕННЫМ ключам (шаг 36.33).
//
// Зачем понадобился отдельный писатель. Перенос `importSourceData` пишет строки
// «вставить или обновить» ПО НОМЕРУ: он переносил файлы, у которых номера были
// источником правды, и обязан был их сохранить. Сид решает обратную задачу —
// дописать недостающее в базу, номера в которой раздаёт сама база. На живой базе
// прежний путь ломался двумя разными способами, и оба замерены 10.09.2026
// на копии `sporthub`:
//
//   1. **Падал.** Номер 1 принадлежит другому человеку, а почта, которую сид
//      собирался ему выдать, занята третьим номером — уникальный индекс почты
//      отбивал вставку, и вся транзакция откатывалась.
//   2. **Затирал.** Когда конфликта почты не случалось, сид доходил до конца
//      и переписывал живые строки своими: «Алексей Смирнов» превращался
//      в «Администратора SportHub», клуб «Самарская федерация Айкидо ёшинкан» —
//      в «Фитнес-центр «Ритм»». Это хуже падения: падение видно, затирание — нет.
//
// Правило писателя одно: **строку с таким естественным ключом не трогаем вовсе.**
// Вставка идёт `ON CONFLICT DO NOTHING` (в Prisma — `createMany({ skipDuplicates })`),
// номера выдаёт база, а номера из набора служат ЛОКАЛЬНЫМИ метками: перед вставкой
// каждая ссылка пересчитывается в тот номер, который база действительно выдала.
//
// Что считается естественным ключом — решает БАЗА, а не этот файл: у каждого ключа
// ниже есть уникальный индекс в схеме (`users.email`, `clubs.slug_normalized`,
// `cities.name_normalized`, частичный `links_active_pair_uq` и так далее). Строки
// без собственного ключа — услуги, занятия, связующие таблицы — пишутся ТОЛЬКО
// для публикаций, заведённых этим прогоном: у чужой публикации свой каталог,
// и дописывать в него сид не вправе.
//
// Подготовку строк писатель НЕ дублирует: её делает общий `prepareRows` — тот же,
// что и у переноса. Разойтись двум писателям можно только в стратегии вставки,
// и она здесь единственное, что своё.

import { ACTIVE_LINK_STATUSES } from '@sporthub/domain';

import type { Prisma, PrismaClient } from '../prisma-client/client';
import { countRows, type ImportReport } from './import-from-files';
import { prepareRows, type ChangeLog } from './prepare';
import type { SourceData } from './source-data';

/** Любая подготовленная строка: номер в наборе — локальная метка, а не номер в базе. */
type SeedRow = { id?: number };

/** Итог вставки одной таблицы. */
type Insertion = {
  /** Номер в наборе → номер, который выдала база. */
  ids: Map<number, number>;
  /** Номера строк набора, которые сид завёл именно этим прогоном. */
  created: Set<number>;
};

/** Пустой итог — для таблиц, которых в наборе нет. */
const NOTHING: Insertion = { ids: new Map(), created: new Set() };

/** Номер строки набора. Строки готовит `prepareRows`, и там он всегда есть. */
function requireLocalId(id: number | undefined, what: string): number {
  if (id === undefined) {
    throw new Error(`У строки таблицы ${what} нет номера — писателю нужна локальная метка`);
  }

  return id;
}

/**
 * Строка без номера.
 *
 * Номер снимается намеренно: его выдаёт база. Опора на «нумерация начнётся
 * с единицы» — ровно то, на чём сид ломался на живой базе.
 */
function withoutId<TRow extends SeedRow>(row: TRow): Omit<TRow, 'id'> {
  const { id: _local, ...rest } = row;

  return rest;
}

/** Ссылка на строку набора → ссылка на строку базы. Отсутствие остаётся отсутствием. */
function remap(
  insertion: Insertion,
  local: number | null | undefined,
  what: string,
): number | null {
  if (local === null || local === undefined) return null;

  const real = insertion.ids.get(local);

  if (real === undefined) {
    throw new Error(`Набор ссылается на ${what} ${local}, которого писатель не завёл и не нашёл`);
  }

  return real;
}

/** То же для обязательной ссылки: `null` здесь означал бы битую строку. */
function remapRequired(insertion: Insertion, local: number, what: string): number {
  const real = remap(insertion, local, what);

  if (real === null) throw new Error(`Обязательная ссылка на ${what} пуста`);

  return real;
}

/**
 * Вставить недостающие строки таблицы и вернуть соответствие номеров.
 *
 * Три шага, и каждый нужен:
 *   1. спросить базу, какие естественные ключи она уже знает;
 *   2. вставить только недостающие, и всё равно `skipDuplicates` — гонку с чужим
 *      прогоном решает база, а не наша выборка;
 *   3. спросить базу ещё раз — так номера приходят от неё, а не из набора.
 */
async function insertMissing<TRow extends SeedRow>(options: {
  /** Как называется таблица в сообщениях об ошибке. */
  what: string;
  rows: TRow[];
  /** Естественный ключ строки набора. */
  keyOf: (row: TRow) => string;
  /** Что база уже знает про эти ключи: ключ → номер. */
  lookup: (rows: TRow[]) => Promise<Map<string, number>>;
  /** Вставка пачкой с пропуском конфликтов. */
  insert: (data: Omit<TRow, 'id'>[]) => Promise<unknown>;
}): Promise<Insertion> {
  const { what, rows, keyOf, lookup, insert } = options;

  if (rows.length === 0) return NOTHING;

  const before = await lookup(rows);
  const missing = rows.filter((row) => !before.has(keyOf(row)));

  if (missing.length > 0) await insert(missing.map(withoutId));

  const after = await lookup(rows);
  const ids = new Map<number, number>();
  const created = new Set<number>();

  for (const row of rows) {
    const key = keyOf(row);
    const real = after.get(key);

    if (real === undefined) {
      // Молчать здесь нельзя. Такое бывает у таблиц с ДВУМЯ уникальными полями:
      // строка не вставилась из-за конфликта по второму, а ищем мы по первому.
      // Тихо пропущенная строка утащила бы за собой все ссылки на неё.
      throw new Error(
        `${what}: строка «${key}» не вставилась и не нашлась по естественному ключу. ` +
          'Скорее всего в базе уже есть строка, конфликтующая по другому уникальному полю.',
      );
    }

    const local = requireLocalId(row.id, what);

    ids.set(local, real);
    if (!before.has(key)) created.add(local);
  }

  return { ids, created };
}

export type WriteDevSeedOptions = {
  client: PrismaClient;
  source: SourceData;
  /** Окружение процесса — аргументом, чтобы отказ проверялся тестом без подмены глобального. */
  env?: NodeJS.ProcessEnv;
};

/** Переменная, которой боевой запуск сида разрешается ЯВНО — чистая установка по §5.3. */
export const DEMO_SEED_OVERRIDE = 'SPORTHUB_ALLOW_DEMO_SEED';

/**
 * Демонстрационный набор на боевой базе — подделка: знаки «проверено» и отзывы в нём
 * синтетические (38.115), и тот же `db:seed` на сервере дал бы фальшивые знаки живым
 * посетителям. Писатель отказывается работать при `NODE_ENV=production` (так собран
 * боевой образ, `docker/api.Dockerfile`), если запуск не разрешён явно переменной
 * `SPORTHUB_ALLOW_DEMO_SEED=1` — единственный законный случай: чистая установка (§5.3).
 */
export function assertDemoSeedAllowed(env: NodeJS.ProcessEnv = process.env): void {
  if (env.NODE_ENV === 'production' && env[DEMO_SEED_OVERRIDE] !== '1') {
    throw new Error(
      `Сид не запускается при NODE_ENV=production: набор демонстрационный, знаки «проверено» ` +
        `и отзывы в нём синтетические. Для чистой установки (docker/PRODUCTION.md, §5.3) ` +
        `запуск разрешается явно: ${DEMO_SEED_OVERRIDE}=1.`,
    );
  }
}

/**
 * Записать демонстрационный набор, ничего не затирая.
 *
 * Вся вставка — одна транзакция: наполовину наполненная база хуже пустой,
 * потому что выглядит рабочей.
 */
export async function writeDevSeed({
  client,
  source,
  env = process.env,
}: WriteDevSeedOptions): Promise<ImportReport> {
  // Боевое окружение — отказ ДО подготовки строк и до транзакции: ничего не пишется.
  assertDemoSeedAllowed(env);

  // Починка текстов сиду не положена (её словарь привязан к номерам боевых записей),
  // пересчёт агрегатов положен: у набора нет отзывов, и рейтинги обязаны быть нулями.
  const { rows, changes } = prepareRows(source, { repairTexts: false, recalculate: true });

  // Набор объявляет только справочники и минимальный работающий каталог. Если однажды
  // он объявит записи, отзывы, уведомления или журнал — писатель обязан сказать это
  // вслух, а не записать половину: у этих таблиц естественного ключа нет.
  assertNotSeeded(rows.bookings, 'записи');
  assertNotSeeded(rows.bookingStatusTransitions, 'переходы записей');
  assertNotSeeded(rows.notifications, 'уведомления');
  assertNotSeeded(rows.logs, 'журнал');
  assertNotSeeded(rows.providerClientNotes, 'заметки о клиентах');

  const notes: string[] = [];

  await client.$transaction(
    async (tx) => {
      // --- Справочники: ключ — нормализованное имя, имя или адресная строка ---

      const cities = await insertMissing({
        what: 'cities',
        rows: rows.cities,
        keyOf: (row) => row.nameNormalized,
        lookup: async (list) => {
          const found = await tx.city.findMany({
            where: { nameNormalized: { in: list.map((row) => row.nameNormalized) } },
            select: { id: true, nameNormalized: true },
          });

          return new Map(found.map((row) => [row.nameNormalized, row.id]));
        },
        insert: (data) => tx.city.createMany({ data, skipDuplicates: true }),
      });

      // Города ни на что не ссылаются и на них не ссылаются номером: город
      // публикации — текст. Соответствие всё равно вычисляется — оно и есть
      // доказательство, что вторых «Самар» сид не завёл.
      void cities;

      const sports = await insertMissing({
        what: 'sports',
        rows: rows.sports,
        keyOf: (row) => row.slug,
        lookup: async (list) => {
          const found = await tx.sport.findMany({
            where: { slug: { in: list.map((row) => row.slug) } },
            select: { id: true, slug: true },
          });

          return new Map(found.map((row) => [row.slug, row.id]));
        },
        insert: (data) => tx.sport.createMany({ data, skipDuplicates: true }),
      });

      const tags = await insertMissing({
        what: 'tags',
        rows: rows.tags,
        keyOf: (row) => row.name,
        lookup: async (list) => {
          const found = await tx.tag.findMany({
            where: { name: { in: list.map((row) => row.name) } },
            select: { id: true, name: true },
          });

          return new Map(found.map((row) => [row.name, row.id]));
        },
        insert: (data) => tx.tag.createMany({ data, skipDuplicates: true }),
      });

      const amenities = await insertMissing({
        what: 'amenities',
        rows: rows.amenities,
        keyOf: (row) => row.name,
        lookup: async (list) => {
          const found = await tx.amenity.findMany({
            where: { name: { in: list.map((row) => row.name) } },
            select: { id: true, name: true },
          });

          return new Map(found.map((row) => [row.name, row.id]));
        },
        insert: (data) => tx.amenity.createMany({ data, skipDuplicates: true }),
      });

      const specialties = await insertMissing({
        what: 'specialties',
        rows: rows.specialties,
        keyOf: (row) => row.name,
        lookup: async (list) => {
          const found = await tx.specialty.findMany({
            where: { name: { in: list.map((row) => row.name) } },
            select: { id: true, name: true },
          });

          return new Map(found.map((row) => [row.name, row.id]));
        },
        insert: (data) => tx.specialty.createMany({ data, skipDuplicates: true }),
      });

      const workFormats = await insertMissing({
        what: 'work_formats',
        rows: rows.workFormats,
        keyOf: (row) => row.name,
        lookup: async (list) => {
          const found = await tx.workFormat.findMany({
            where: { name: { in: list.map((row) => row.name) } },
            select: { id: true, name: true },
          });

          return new Map(found.map((row) => [row.name, row.id]));
        },
        insert: (data) => tx.workFormat.createMany({ data, skipDuplicates: true }),
      });

      // --- Люди: ключ — почта, она же логин ---

      const users = await insertMissing({
        what: 'users',
        rows: rows.users,
        keyOf: (row) => row.email,
        lookup: async (list) => {
          const found = await tx.user.findMany({
            where: { email: { in: list.map((row) => row.email) } },
            select: { id: true, email: true },
          });

          return new Map(found.map((row) => [row.email, row.id]));
        },
        insert: (data) => tx.user.createMany({ data, skipDuplicates: true }),
      });

      // --- Публикации: ключ — нормализованный адресный кусок ---

      const clubs = await insertMissing({
        what: 'clubs',
        rows: rows.clubs.map((row) => ({
          ...row,
          managedByUserId: remap(users, row.managedByUserId, 'пользователя'),
          hiddenByUserId: remap(users, row.hiddenByUserId, 'пользователя'),
        })),
        keyOf: (row) => row.slugNormalized,
        lookup: async (list) => {
          const found = await tx.club.findMany({
            where: { slugNormalized: { in: list.map((row) => row.slugNormalized) } },
            select: { id: true, slugNormalized: true },
          });

          return new Map(found.map((row) => [row.slugNormalized, row.id]));
        },
        insert: (data) => tx.club.createMany({ data, skipDuplicates: true }),
      });

      const trainers = await insertMissing({
        what: 'trainers',
        rows: rows.trainers.map((row) => ({
          ...row,
          sportId: remap(sports, row.sportId, 'вид спорта'),
          managedByUserId: remap(users, row.managedByUserId, 'пользователя'),
          hiddenByUserId: remap(users, row.hiddenByUserId, 'пользователя'),
        })),
        keyOf: (row) => row.slugNormalized,
        lookup: async (list) => {
          const found = await tx.trainer.findMany({
            where: { slugNormalized: { in: list.map((row) => row.slugNormalized) } },
            select: { id: true, slugNormalized: true },
          });

          return new Map(found.map((row) => [row.slugNormalized, row.id]));
        },
        insert: (data) => tx.trainer.createMany({ data, skipDuplicates: true }),
      });

      // --- Связь тренер ↔ клуб: ключ — пара номеров среди ДЕЙСТВУЮЩИХ статусов ---
      //
      // Уникальность пары обеспечивает частичный индекс `links_active_pair_uq`,
      // а не этот код: `ON CONFLICT DO NOTHING` без цели ловит и частичный индекс.
      // Набор статусов берётся из общего словаря — второй список разошёлся бы
      // с индексом молча.
      for (const link of rows.trainerClubLinks) {
        if (!ACTIVE_LINK_STATUSES.includes(link.status as never)) {
          throw new Error(
            `Связь ${link.id} объявлена со статусом «${link.status}»: у недействующих связей ` +
              'нет уникальности в базе, и повторный сид завёл бы вторую такую же.',
          );
        }
      }

      // Связь заводится только для карточки, которую сид завёл сам: чужой карточке
      // дописывать аффилиации он не вправе.
      const linkRows = rows.trainerClubLinks
        .filter((row) => trainers.created.has(row.trainerId))
        .map((row) => ({
          ...row,
          trainerId: remapRequired(trainers, row.trainerId, 'карточку тренера'),
          clubId: remapRequired(clubs, row.clubId, 'клуб'),
          initiatedByUserId: remap(users, row.initiatedByUserId, 'пользователя'),
          approvedByUserId: remap(users, row.approvedByUserId, 'пользователя'),
          rejectedByUserId: remap(users, row.rejectedByUserId, 'пользователя'),
          revokedByUserId: remap(users, row.revokedByUserId, 'пользователя'),
        }));

      const links = await insertMissing({
        what: 'trainer_club_links',
        rows: linkRows,
        keyOf: (row) => `${row.trainerId}:${row.clubId}`,
        lookup: async (list) => {
          const found = await tx.trainerClubLink.findMany({
            where: {
              status: { in: [...ACTIVE_LINK_STATUSES] },
              OR: list.map((row) => ({ trainerId: row.trainerId, clubId: row.clubId })),
            },
            select: { id: true, trainerId: true, clubId: true },
          });

          return new Map(found.map((row) => [`${row.trainerId}:${row.clubId}`, row.id]));
        },
        insert: (data) => tx.trainerClubLink.createMany({ data, skipDuplicates: true }),
      });

      // --- Каталог: своего ключа нет, поэтому пишем только своим публикациям ---
      //
      // У услуги и занятия уникального индекса в базе нет и быть не может: у клуба
      // законно бывают два одинаковых занятия. Значит «вставить, если такого ещё нет»
      // здесь невыразимо — и единственный честный признак «это уже записано»
      // даёт родитель: публикацию сид либо завёл сейчас, либо застал.
      const offeringIds = new Map<number, number>();

      for (const row of rows.offerings) {
        const local = requireLocalId(row.id, 'offerings');
        const ownerCreated =
          (row.ownerClubId !== null &&
            row.ownerClubId !== undefined &&
            clubs.created.has(row.ownerClubId)) ||
          (row.ownerTrainerId !== null &&
            row.ownerTrainerId !== undefined &&
            trainers.created.has(row.ownerTrainerId));

        if (!ownerCreated) {
          notes.push(`услуга «${row.title}» пропущена: её публикация уже была в базе`);
          continue;
        }

        // Связь могла не завестись (карточка чужая) — тогда услуга остаётся частной.
        // Это говорится вслух: молча потерянная площадка убрала бы услугу
        // со страницы клуба, и заметить это было бы нечем.
        let trainerClubLinkId: number | null = null;

        if (row.trainerClubLinkId !== null && row.trainerClubLinkId !== undefined) {
          trainerClubLinkId = links.ids.get(row.trainerClubLinkId) ?? null;

          if (trainerClubLinkId === null) {
            notes.push(`услуга «${row.title}» записана частной: подтверждённой связи в базе нет`);
          }
        }

        const created = await tx.offering.create({
          data: {
            ...withoutId(row),
            ownerClubId: remap(clubs, row.ownerClubId, 'клуб'),
            ownerTrainerId: remap(trainers, row.ownerTrainerId, 'карточку тренера'),
            venueClubId: remap(clubs, row.venueClubId, 'клуб'),
            trainerClubLinkId,
            sportId: remapRequired(sports, row.sportId, 'вид спорта'),
          },
          select: { id: true },
        });

        offeringIds.set(local, created.id);
      }

      const scheduleRows: Prisma.ScheduleCreateManyInput[] = [];

      for (const row of rows.schedule) {
        if (row.offeringId === null || row.offeringId === undefined) {
          throw new Error(
            `Занятие «${row.title}» объявлено без услуги — писателю не за что взяться`,
          );
        }

        const offeringId = offeringIds.get(row.offeringId);

        if (offeringId === undefined) {
          notes.push(`занятие «${row.title}» пропущено: его услуги сид не заводил`);
          continue;
        }

        scheduleRows.push({
          ...withoutId(row),
          offeringId,
          ownerClubId: remap(clubs, row.ownerClubId, 'клуб'),
          ownerTrainerId: remap(trainers, row.ownerTrainerId, 'карточку тренера'),
          venueClubId: remap(clubs, row.venueClubId, 'клуб'),
          conductedByTrainerId: remap(trainers, row.conductedByTrainerId, 'карточку тренера'),
          sportId: remapRequired(sports, row.sportId, 'вид спорта'),
        });
      }

      if (scheduleRows.length > 0) await tx.schedule.createMany({ data: scheduleRows });

      // --- Отзывы: у публикаций и от людей, заведённых сейчас (38.115) ---
      //
      // Отзыв к чужой публикации или от живого человека — правка живых данных;
      // отзыв, чей автор или предмет не заводились этим прогоном, пропускается вслух.
      const reviewRows: Prisma.ReviewCreateManyInput[] = [];

      for (const row of rows.reviews) {
        const ownAuthor = users.created.has(row.userId);
        const ownSubject =
          (row.clubId !== null && row.clubId !== undefined && clubs.created.has(row.clubId)) ||
          (row.trainerId !== null &&
            row.trainerId !== undefined &&
            trainers.created.has(row.trainerId));

        if (!ownAuthor || !ownSubject) {
          notes.push(`отзыв ${row.id} пропущен: автор или публикация заведены не этим прогоном`);
          continue;
        }

        reviewRows.push({
          ...withoutId(row),
          userId: remapRequired(users, row.userId, 'пользователя'),
          clubId: remap(clubs, row.clubId, 'клуб'),
          trainerId: remap(trainers, row.trainerId, 'карточку тренера'),
        });
      }

      if (reviewRows.length > 0) await tx.review.createMany({ data: reviewRows });

      // --- Связующие строки: только у публикаций и людей, заведённых сейчас ---
      //
      // У них составной первичный ключ, то есть `skipDuplicates` их и так защищает.
      // Отбор по «завели сами» защищает не от дублей, а от вмешательства: дописать
      // чужому клубу свои виды спорта и теги — это правка живых данных.
      const ownClub = <TRow extends { clubId: number }>(list: TRow[]): TRow[] =>
        list.filter((row) => clubs.created.has(row.clubId));
      const ownTrainer = <TRow extends { trainerId: number }>(list: TRow[]): TRow[] =>
        list.filter((row) => trainers.created.has(row.trainerId));

      const clubSports = ownClub(rows.clubSports).map((row) => ({
        clubId: remapRequired(clubs, row.clubId, 'клуб'),
        sportId: remapRequired(sports, row.sportId, 'вид спорта'),
      }));
      const clubTags = ownClub(rows.clubTags).map((row) => ({
        clubId: remapRequired(clubs, row.clubId, 'клуб'),
        tagId: remapRequired(tags, row.tagId, 'тег'),
      }));
      const clubAmenities = ownClub(rows.clubAmenities).map((row) => ({
        clubId: remapRequired(clubs, row.clubId, 'клуб'),
        amenityId: remapRequired(amenities, row.amenityId, 'удобство'),
      }));
      const clubImages = ownClub(rows.clubImages).map((row) => ({
        ...withoutId(row),
        clubId: remapRequired(clubs, row.clubId, 'клуб'),
      }));
      const trainerSports = ownTrainer(rows.trainerSports).map((row) => ({
        trainerId: remapRequired(trainers, row.trainerId, 'карточку тренера'),
        sportId: remapRequired(sports, row.sportId, 'вид спорта'),
      }));
      const trainerSpecialties = ownTrainer(rows.trainerSpecialties).map((row) => ({
        trainerId: remapRequired(trainers, row.trainerId, 'карточку тренера'),
        specialtyId: remapRequired(specialties, row.specialtyId, 'специализацию'),
      }));
      const trainerWorkFormats = ownTrainer(rows.trainerWorkFormats).map((row) => ({
        trainerId: remapRequired(trainers, row.trainerId, 'карточку тренера'),
        workFormatId: remapRequired(workFormats, row.workFormatId, 'формат работы'),
      }));

      // Избранное и настройки уведомлений — строки САМОГО человека, поэтому
      // отбираются по нему: клуб в избранном может быть и чужим, живым.
      const favorites = rows.userFavoriteClubs
        .filter((row) => users.created.has(row.userId))
        .map((row) => ({
          ...row,
          userId: remapRequired(users, row.userId, 'пользователя'),
          clubId: remapRequired(clubs, row.clubId, 'клуб'),
        }));
      const preferences = rows.userNotificationPreferences
        .filter((row) => users.created.has(row.userId))
        .map((row) => ({ ...row, userId: remapRequired(users, row.userId, 'пользователя') }));

      const batches: [unknown[], () => Promise<unknown>][] = [
        [clubSports, () => tx.clubSport.createMany({ data: clubSports, skipDuplicates: true })],
        [clubTags, () => tx.clubTag.createMany({ data: clubTags, skipDuplicates: true })],
        [
          clubAmenities,
          () => tx.clubAmenity.createMany({ data: clubAmenities, skipDuplicates: true }),
        ],
        [clubImages, () => tx.clubImage.createMany({ data: clubImages, skipDuplicates: true })],
        [
          trainerSports,
          () => tx.trainerSport.createMany({ data: trainerSports, skipDuplicates: true }),
        ],
        [
          trainerSpecialties,
          () => tx.trainerSpecialty.createMany({ data: trainerSpecialties, skipDuplicates: true }),
        ],
        [
          trainerWorkFormats,
          () => tx.trainerWorkFormat.createMany({ data: trainerWorkFormats, skipDuplicates: true }),
        ],
        [
          favorites,
          () => tx.userFavoriteClub.createMany({ data: favorites, skipDuplicates: true }),
        ],
        [
          preferences,
          () =>
            tx.userNotificationPreference.createMany({ data: preferences, skipDuplicates: true }),
        ],
      ];

      for (const [list, write] of batches) {
        if (list.length > 0) await write();
      }
    },
    { maxWait: 15_000, timeout: 180_000 },
  );

  const counts = await countRows(client, rows);

  return {
    counts,
    // Счётчиков номеров писатель не трогает: номера раздаёт база, и поднимать
    // ей нечего. Пустой список здесь — не пропуск, а свойство способа записи.
    sequences: [],
    changes: withNotes(changes, notes),
  };
}

/** Таблица, которую сид не умеет наполнять: сказать вслух, а не записать половину. */
function assertNotSeeded(list: unknown[], what: string): void {
  if (list.length > 0) {
    throw new Error(
      `Набор сида объявил ${what} (${list.length}). У этих таблиц нет естественного ключа, ` +
        'и писатель по ключам их не берёт: повторный прогон завёл бы вторые такие же.',
    );
  }
}

/** Журнал изменений плюс то, что писатель решил по дороге. */
function withNotes(changes: ChangeLog, notes: string[]): ChangeLog {
  return { ...changes, notes: [...changes.notes, ...notes] };
}
