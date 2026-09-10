// Пробный прогон уборки публикаций — в транзакции с откатом (шаг 36.37).
//
// ⚠️ Почему тестом, а не разовой печатью. Уборка мусора (этап Э7) необратима
// и делается один раз. Разовый скрипт, напечатавший «до» и «после», доказывает
// ровно один запуск: после него ни повторить проверку, ни поймать поломку
// в самой уборке уже нельзя. Тест доказывает уборку столько раз, сколько его
// запустят, и делает это на СВОИХ данных в тестовой базе — живую он не трогает.
//
// ⚠️ Что именно проверяется. Не «оператор отработал без ошибки», а то, что
// таблица потеряла РОВНО столько строк, сколько назвала опись. Каскад базы
// глаз не имеет: он унесёт строки, которых никто не называл, и промолчит
// (ловушка 20 плана фазы 36). Разница между «удалили названное» и «удалили
// названное и ещё что-то» видна только по общему числу строк в таблице —
// поэтому считаются оба числа.
//
// ⚠️ Транзакция откатывается всегда. Тест ничего не оставляет за собой даже
// в тестовой базе: он сверяет состояние ВНУТРИ транзакции и уходит откатом.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestDatabase, testSchemaName, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';
import { REPO_ROOT } from './repo-root';

/** Строка описи уборки — форма объявлена в `scripts/cleanup-publications.mjs`. */
type CleanupEntry = {
  label: string;
  table: string;
  where: string;
  cascade?: boolean;
  qualified: string;
};

type CleanupModule = {
  publicationCleanupPlan: (options: {
    clubIds: number[];
    trainerIds: number[];
    schema?: string;
  }) => CleanupEntry[];
  cleanupStatements: (plan: CleanupEntry[]) => string[];
  inventorySql: (plan: CleanupEntry[]) => string;
};

/** Счёт по одной таблице описи: сколько подпадает под уборку и сколько всего. */
type InventoryRow = { label: string; scoped: number; total: number; cascade: boolean };

/**
 * Опись живёт в `scripts/`, а не в `apps/api/src`: её второй потребитель —
 * обычный node-скрипт браузерного прогона, у которого нет ни сборки, ни алиасов.
 * Адрес собирается во время прогона, поэтому сборка бэкенда о файле вне `src`
 * не узнаёт и на `rootDir` не спотыкается.
 */
const CLEANUP_MODULE = pathToFileURL(
  path.join(REPO_ROOT, 'scripts', 'cleanup-publications.mjs'),
).href;

let db: TestDatabase;
let cleanup: CleanupModule;
const schema = testSchemaName();

/** Номера всего, что фикстура завела: мусор — под уборку, живое — под контроль. */
type Fixture = {
  garbageClubId: number;
  garbageTrainerId: number;
  liveClubId: number;
  liveTrainerId: number;
  venueBookingId: number;
  liveBookingId: number;
};

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
  cleanup = (await import(CLEANUP_MODULE)) as CleanupModule;
}, 180_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.truncateAll();
});

/**
 * Данные под уборку и контрольная группа рядом.
 *
 * Мусорный клуб и мусорная карточка тренера связаны так, как связаны в живой базе:
 * занятие ведёт тренер, а идёт оно в зале клуба. Ровно эта пара и ловит пропуск
 * колонки `venue_club_id` в отборе.
 *
 * Живой клуб и живая карточка нужны не для симметрии: без них «уборка удалила всё»
 * и «уборка удалила своё» выглядят одинаково.
 */
async function seedFixture(): Promise<Fixture> {
  const sport = await db.prisma.sport.create({
    data: { name: 'Бокс', slug: 'boxing', description: '', icon: '', imageUrl: '' },
  });
  const tag = await db.prisma.tag.create({ data: { name: 'Тег' } });
  const amenity = await db.prisma.amenity.create({ data: { name: 'Душ' } });
  const specialty = await db.prisma.specialty.create({ data: { name: 'ОФП' } });
  const workFormat = await db.prisma.workFormat.create({ data: { name: 'В зале' } });

  const owner = await db.prisma.user.create({
    data: {
      name: 'Владелец',
      email: 'owner@cleanup.test',
      phone: '',
      passwordHash: 'хеш',
      status: 'active',
    },
  });
  const client = await db.prisma.user.create({
    data: {
      name: 'Клиент',
      email: 'client@cleanup.test',
      phone: '',
      passwordHash: 'хеш',
      status: 'active',
    },
  });

  const club = (name: string, slug: string) =>
    db.prisma.club.create({
      data: {
        name,
        slug,
        slugNormalized: slug,
        description: '',
        shortDescription: '',
        city: 'Самара',
        address: '',
        phone: '',
        latitude: 0,
        longitude: 0,
        managedByUserId: owner.id,
      },
    });
  const trainer = (name: string, slug: string) =>
    db.prisma.trainer.create({
      data: {
        name,
        slug,
        slugNormalized: slug,
        bio: '',
        experienceYears: 1,
        managedByUserId: owner.id,
      },
    });

  const garbageClub = await club('Мусорный клуб', 'garbage-club');
  const garbageTrainer = await trainer('Мусорный тренер', 'garbage-trainer');
  const liveClub = await club('Живой клуб', 'live-club');
  const liveTrainer = await trainer('Живой тренер', 'live-trainer');

  // Справочные связки: уходят каскадом, но обязаны быть посчитаны.
  await db.prisma.clubSport.createMany({
    data: [
      { clubId: garbageClub.id, sportId: sport.id },
      { clubId: liveClub.id, sportId: sport.id },
    ],
  });
  await db.prisma.clubTag.create({ data: { clubId: garbageClub.id, tagId: tag.id } });
  await db.prisma.clubAmenity.create({
    data: { clubId: garbageClub.id, amenityId: amenity.id },
  });
  await db.prisma.clubImage.create({
    data: { clubId: garbageClub.id, url: '', position: 0 },
  });
  await db.prisma.userFavoriteClub.create({
    data: { userId: client.id, clubId: garbageClub.id },
  });
  await db.prisma.trainerSport.createMany({
    data: [
      { trainerId: garbageTrainer.id, sportId: sport.id },
      { trainerId: liveTrainer.id, sportId: sport.id },
    ],
  });
  await db.prisma.trainerSpecialty.create({
    data: { trainerId: garbageTrainer.id, specialtyId: specialty.id },
  });
  await db.prisma.trainerWorkFormat.create({
    data: { trainerId: garbageTrainer.id, workFormatId: workFormat.id },
  });
  await db.prisma.userNotificationPreference.create({
    data: {
      userId: owner.id,
      type: 'booking_requested',
      enabled: false,
      faceClubId: garbageClub.id,
    },
  });

  const link = await db.prisma.trainerClubLink.create({
    data: {
      trainerId: garbageTrainer.id,
      clubId: garbageClub.id,
      status: 'confirmed',
      initiatedBy: 'trainer',
    },
  });

  const offering = (data: {
    ownerClubId?: number;
    ownerTrainerId?: number;
    venueClubId?: number;
  }) =>
    db.prisma.offering.create({
      data: {
        ...data,
        sportId: sport.id,
        title: 'Занятие',
        description: '',
        format: 'group',
        price: 1000,
        durationMinutes: 60,
        capacity: 5,
        address: '',
        latitude: 0,
        longitude: 0,
      },
    });

  const garbageClubOffering = await offering({ ownerClubId: garbageClub.id });
  // ⚠️ Тренерская услуга в чужом зале: владелец — тренер, площадка — клуб.
  const venueOffering = await offering({
    ownerTrainerId: garbageTrainer.id,
    venueClubId: garbageClub.id,
  });
  const liveOffering = await offering({ ownerClubId: liveClub.id });

  const slot = (data: {
    offeringId: number;
    ownerClubId?: number;
    ownerTrainerId?: number;
    venueClubId?: number;
  }) =>
    db.prisma.schedule.create({
      data: {
        ...data,
        sportId: sport.id,
        title: 'Занятие',
        date: new Date('2026-09-01T00:00:00.000Z'),
        startTime: new Date('1970-01-01T10:00:00.000Z'),
        endTime: new Date('1970-01-01T11:00:00.000Z'),
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 5,
        bookedCount: 1,
        price: 1000,
      },
    });

  await slot({ offeringId: garbageClubOffering.id, ownerClubId: garbageClub.id });
  const venueSlot = await slot({
    offeringId: venueOffering.id,
    ownerTrainerId: garbageTrainer.id,
    venueClubId: garbageClub.id,
  });
  const liveSlot = await slot({ offeringId: liveOffering.id, ownerClubId: liveClub.id });
  // Занятие живого тренера, которое идёт в зале мусорного клуба.
  const venueOnlySlot = await slot({
    offeringId: liveOffering.id,
    ownerTrainerId: liveTrainer.id,
    venueClubId: garbageClub.id,
  });

  const booking = (data: {
    scheduleId: number;
    offeringId: number;
    ownerClubId?: number;
    ownerTrainerId?: number;
    venueClubId?: number;
  }) =>
    db.prisma.booking.create({
      data: {
        ...data,
        userId: client.id,
        sportId: sport.id,
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: 'confirmed',
        totalPrice: 1000,
      },
    });

  // Запись, ради которой всё и затевалось: владелец — мусорная карточка тренера,
  // зал — мусорный клуб, а человек за ней — живой.
  const venueBooking = await booking({
    scheduleId: venueSlot.id,
    offeringId: venueOffering.id,
    ownerTrainerId: garbageTrainer.id,
    venueClubId: garbageClub.id,
  });
  const liveBooking = await booking({
    scheduleId: liveSlot.id,
    offeringId: liveOffering.id,
    ownerClubId: liveClub.id,
  });
  // ⚠️ Ради этой записи фикстура и заведена именно такой. Владелец — ЖИВАЯ карточка
  // тренера, зал — мусорный клуб. Отбор по владельцу её не видит, а внешний ключ
  // `bookings.venue_club_id` — `ON DELETE CASCADE`: удаление клуба унесёт её молча.
  // Пропуск колонки в отборе не помешает удалить клуб (как считалось раньше) —
  // он сделает потерю НЕВИДИМОЙ, и поймать это можно только по общему числу строк.
  const venueOnlyBooking = await booking({
    scheduleId: venueOnlySlot.id,
    offeringId: liveOffering.id,
    ownerTrainerId: liveTrainer.id,
    venueClubId: garbageClub.id,
  });

  await db.prisma.bookingStatusTransition.createMany({
    data: [
      {
        bookingId: venueBooking.id,
        toStatus: 'pending',
        actor: 'athlete',
        at: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        bookingId: venueBooking.id,
        fromStatus: 'pending',
        toStatus: 'confirmed',
        actor: 'provider',
        at: new Date('2026-08-02T00:00:00.000Z'),
      },
      {
        bookingId: liveBooking.id,
        toStatus: 'pending',
        actor: 'athlete',
        at: new Date('2026-08-01T00:00:00.000Z'),
      },
      {
        bookingId: venueOnlyBooking.id,
        toStatus: 'pending',
        actor: 'athlete',
        at: new Date('2026-08-01T00:00:00.000Z'),
      },
    ],
  });

  const garbageReview = await db.prisma.review.create({
    data: { userId: client.id, clubId: garbageClub.id, rating: 5, text: 'Мусорный отзыв' },
  });
  await db.prisma.review.create({
    data: { userId: client.id, clubId: liveClub.id, rating: 4, text: 'Живой отзыв' },
  });

  await db.prisma.providerClientNote.create({
    data: {
      providerUserId: owner.id,
      clientUserId: client.id,
      faceClubId: garbageClub.id,
      note: 'Заметка о клиенте',
      updatedAt: new Date('2026-08-01T00:00:00.000Z'),
    },
  });

  // Уведомления: ссылка на публикацию живёт числом внутри jsonb, каскад её не видит.
  await db.prisma.notification.createMany({
    data: [
      {
        userId: owner.id,
        type: 'link_requested',
        payload: { linkId: link.id, clubId: garbageClub.id, trainerId: garbageTrainer.id },
      },
      { userId: client.id, type: 'booking_confirmed', payload: { bookingId: venueBooking.id } },
      {
        userId: owner.id,
        type: 'review_received_by_provider',
        payload: {
          reviewId: garbageReview.id,
          entityType: 'club',
          entityId: garbageClub.id,
          rating: 5,
        },
      },
      {
        userId: owner.id,
        type: 'booking_requested',
        addresseeClubId: garbageClub.id,
        payload: { bookingId: venueBooking.id },
      },
      // Контроль: уведомление живого клуба и живой записи остаётся.
      { userId: client.id, type: 'booking_confirmed', payload: { bookingId: liveBooking.id } },
      { userId: owner.id, type: 'link_requested', payload: { clubId: liveClub.id } },
    ],
  });

  // Журнал: `entity_id` полиморфен, отбирается парой с `entity_type`.
  await db.prisma.logEntry.createMany({
    data: [
      {
        action: 'publish_create',
        actorId: owner.id,
        actorRole: 'person',
        entityType: 'club',
        entityId: garbageClub.id,
      },
      {
        action: 'publish_create',
        actorId: owner.id,
        actorRole: 'person',
        entityType: 'trainer',
        entityId: garbageTrainer.id,
      },
      // Контроль: тот же номер, но другой тип сущности. Отбор по одному
      // `entity_id` снёс бы эту строку — она про живую запись.
      {
        action: 'booking_create',
        actorId: client.id,
        actorRole: 'person',
        entityType: 'booking',
        entityId: garbageClub.id,
      },
      {
        action: 'publish_create',
        actorId: owner.id,
        actorRole: 'person',
        entityType: 'club',
        entityId: liveClub.id,
      },
    ],
  });

  return {
    garbageClubId: garbageClub.id,
    garbageTrainerId: garbageTrainer.id,
    liveClubId: liveClub.id,
    liveTrainerId: liveTrainer.id,
    venueBookingId: venueBooking.id,
    liveBookingId: liveBooking.id,
  };
}

/**
 * Пробный прогон: счёт по всей описи, уборка, счёт снова — и всё это в одной
 * транзакции, которая заведомо откатывается.
 */
async function trialRun(
  plan: CleanupEntry[],
): Promise<{ before: InventoryRow[]; after: InventoryRow[]; survivors: Record<string, number> }> {
  const sql = cleanup.inventorySql(plan);
  const marker = 'откат пробного прогона';
  let captured: {
    before: InventoryRow[];
    after: InventoryRow[];
    survivors: Record<string, number>;
  } | null = null;

  try {
    await db.prisma.$transaction(async (tx) => {
      const read = async (): Promise<InventoryRow[]> => {
        const rows =
          await tx.$queryRawUnsafe<
            Array<{ label: string; scoped: bigint; total: bigint; cascade: boolean }>
          >(sql);

        return rows.map((row) => ({
          label: row.label,
          scoped: Number(row.scoped),
          total: Number(row.total),
          cascade: row.cascade,
        }));
      };

      const before = await read();

      for (const statement of cleanup.cleanupStatements(plan)) {
        await tx.$executeRawUnsafe(statement);
      }

      const after = await read();

      // Кто пережил уборку — считаем здесь же: снаружи транзакции этих данных уже нет.
      const survivors: Record<string, number> = {};

      for (const table of ['clubs', 'trainers', 'bookings', 'reviews', 'notifications', 'logs']) {
        const rows = await tx.$queryRawUnsafe<Array<{ count: bigint }>>(
          `SELECT count(*) AS count FROM "${schema}"."${table}"`,
        );

        survivors[table] = Number(rows[0].count);
      }

      captured = { before, after, survivors };

      throw new Error(marker);
    });
  } catch (error) {
    if (!(error instanceof Error) || error.message !== marker) throw error;
  }

  if (!captured) throw new Error('Пробный прогон не собрал счётчики');

  return captured;
}

/** Печать описи «до и после» — то, ради чего шаг и заведён. */
function printInventory(before: InventoryRow[], after: InventoryRow[]): void {
  const lines = before.map((row, index) => {
    const post = after[index];
    const mark = row.cascade ? 'каскад' : 'явно  ';

    return `  ${row.label.padEnd(30)} ${mark}  уйдёт ${String(row.scoped).padStart(3)}  всего ${String(row.total).padStart(3)} → ${String(post.total).padStart(3)}`;
  });

  console.info(
    ['Опись уборки (пробный прогон, транзакция откачена):', ...lines].join('\n') +
      `\n  ИТОГО строк под уборку: ${before.reduce((sum, row) => sum + row.scoped, 0)}`,
  );
}

describe('Пробный прогон уборки публикаций (36.37)', () => {
  let fixture: Fixture;
  let plan: CleanupEntry[];

  beforeEach(async () => {
    fixture = await seedFixture();
    plan = cleanup.publicationCleanupPlan({
      clubIds: [fixture.garbageClubId],
      trainerIds: [fixture.garbageTrainerId],
      schema,
    });
  });

  it('каждая таблица описи теряет ровно столько строк, сколько назвала', async () => {
    const { before, after } = await trialRun(plan);

    printInventory(before, after);

    expect(before.reduce((sum, row) => sum + row.scoped, 0)).toBeGreaterThan(0);

    for (const [index, row] of before.entries()) {
      const post = after[index];

      expect.soft(post.label, `${row.label}: опись съехала`).toBe(row.label);
      // Ничего из названного не осталось.
      expect.soft(post.scoped, `${row.label}: строки под уборку остались`).toBe(0);
      // И ничего сверх названного не унесено: разница ровно та, что обещали.
      expect
        .soft(post.total, `${row.label}: таблица потеряла не столько строк, сколько назвала опись`)
        .toBe(row.total - row.scoped);
    }
  });

  it('опись покрывает и то, что уходит каскадом', async () => {
    const { before } = await trialRun(plan);
    const cascaded = before.filter((row) => row.cascade && row.scoped > 0).map((row) => row.label);

    // Связки справочников и история переходов не удаляются отдельным оператором —
    // их унесёт база. Не назвать их значило бы не увидеть их потери.
    expect(cascaded).toEqual(
      expect.arrayContaining([
        'club_sports',
        'trainer_sports',
        'trainer_specialties',
        'trainer_work_formats',
        'booking_status_transitions',
      ]),
    );
  });

  it('живые публикации, записи и отзывы на месте', async () => {
    const { survivors } = await trialRun(plan);

    expect(survivors.clubs).toBe(1);
    expect(survivors.trainers).toBe(1);
    // Из трёх записей уходят две: своя запись мусорной карточки и запись живого
    // тренера, у которой залом был мусорный клуб. Вторую унесёт каскад — и опись
    // обязана назвать её заранее, иначе потеря останется невидимой.
    expect(survivors.bookings).toBe(1);
    expect(survivors.reviews).toBe(1);
  });

  it('уведомление о живом клубе и журнал о живом клубе остаются', async () => {
    const { before, after } = await trialRun(plan);
    const notifications = before.findIndex((row) => row.label === 'notifications');
    const logs = before.findIndex((row) => row.label === 'logs');

    // Четыре мусорных уведомления из шести.
    expect(before[notifications].scoped).toBe(4);
    expect(after[notifications].total).toBe(2);

    // ⚠️ Строк журнала под уборку стало три, а не две: решение 17 расширено
    // на записи и связи удаляемых публикаций — они ссылаются в никуда так же,
    // как строки про сами публикации. Живой клуб при этом не задет: его строка
    // журнала остаётся, и ради неё проверка и существует.
    expect(before[logs].scoped).toBe(3);
    expect(after[logs].total).toBe(1);
  });

  it('журнал отбирается парой «тип + номер», а не одним номером', async () => {
    const { survivors } = await trialRun(plan);

    // В фикстуре есть строка `entity_type='booking'` с тем же номером, что
    // у мусорного клуба. Отбор по одному `entity_id` снёс бы вместе с ней и строку
    // про ЖИВОЙ клуб того же номера — а она обязана уцелеть.
    expect(survivors.logs).toBe(1);
  });

  it('журнал о записях и связях удалённых публикаций тоже сносится', async () => {
    // ⚠️ Прежде здесь стояло обратное утверждение — «остаётся, это граница
    // решения 17», — и граница была проведена буквально: «журнал ПРО УДАЛЯЕМЫЕ
    // ПУБЛИКАЦИИ». Заказчик уточнил решение: строка журнала про запись, которой
    // после уборки не будет, — такая же ссылка в никуда, и оставить её значит
    // оставить ровно те сироты, ради которых уборка затевалась.
    //
    // Отбор идёт подзапросом, а не списком номеров: записи и связи удаляются
    // в этой же транзакции, и их номера снаружи неизвестны.
    const { after, survivors } = await trialRun(plan);
    const logs = after.find((row) => row.label === 'logs');
    const where = plan.find((entry) => entry.label === 'logs')?.where ?? '';

    expect(logs?.scoped).toBe(0);
    expect(where).toContain("'booking'");
    expect(where).toContain("'link'");
    // И при этом уцелело то, что уцелеть обязано: строка про живой клуб.
    expect(survivors.logs).toBe(1);
  });

  it('пустые списки не удаляют ничего', async () => {
    const empty = cleanup.publicationCleanupPlan({ clubIds: [], trainerIds: [], schema });
    const { before, after } = await trialRun(empty);

    expect(before.every((row) => row.scoped === 0)).toBe(true);
    expect(after.map((row) => row.total)).toEqual(before.map((row) => row.total));
  });

  it('пробный прогон откатывается: в базе всё на месте', async () => {
    await trialRun(plan);

    expect(await db.prisma.club.count()).toBe(2);
    expect(await db.prisma.trainer.count()).toBe(2);
    expect(await db.prisma.booking.count()).toBe(3);
  });
});

/**
 * Сторож общей описи (шаг 36.36).
 *
 * ⚠️ Шаг называется «вынести каскад в общую функцию», и провалить его можно
 * бесшумно: оставить вынесенную опись рядом со СТАРЫМ каскадом на месте.
 * Прогон продолжит убирать за собой, тест уборки останется зелёным, а копий
 * порядка станет две — и разъедутся они молча, потому что второй потребитель
 * (разовая уборка Э7) правит только одну.
 *
 * Поэтому проверяется не «функция существует», а «второй копии нет».
 */
describe('Общая опись уборки — одна на всех (36.36)', () => {
  const fixtureSource = readFileSync(path.join(REPO_ROOT, 'scripts', 'e2e-fixture.mjs'), 'utf8');

  it('фикстура прогона берёт каскад из общей описи', () => {
    expect(fixtureSource).toContain("from './cleanup-publications.mjs'");
    expect(fixtureSource).toContain('publicationCleanupPlan');
  });

  it.each([
    'owner_club_id',
    'owner_trainer_id',
    'venue_club_id',
    'conducted_by_trainer_id',
    'DELETE FROM clubs',
    'DELETE FROM trainers',
    'DELETE FROM schedule',
    'DELETE FROM offerings',
    'DELETE FROM trainer_club_links',
  ])('своей копии каскада у фикстуры не осталось: «%s»', (fragment) => {
    expect(fixtureSource).not.toContain(fragment);
  });

  it('опись сносит уведомления и журнал про публикации, а не только про людей', () => {
    const plan = cleanup.publicationCleanupPlan({ clubIds: [1], trainerIds: [2] });
    const notifications = plan.find((entry) => entry.label === 'notifications');
    const logs = plan.find((entry) => entry.label === 'logs');

    // Ссылка на публикацию живёт внутри jsonb и в полиморфной паре журнала —
    // ни та, ни другая каскадом не уходят (решения заказчика 16 и 17).
    expect(notifications?.where).toContain("payload->>'clubId'");
    expect(notifications?.where).toContain("payload->>'bookingId'");
    expect(logs?.where).toContain("entity_type = 'club'");
    expect(logs?.where).toContain("entity_type = 'trainer'");
  });
});
