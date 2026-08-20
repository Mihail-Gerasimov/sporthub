// Проверка переноса данных из файлов в базу (шаг 33.20).
//
// Что здесь доказывается и почему именно это.
//
// Перенос — операция, которую делают один раз и на боевых данных. Ошибку в нём
// видно не сразу: страницы открываются, ответы приходят, а расходится одно поле
// у одной услуги. Поэтому проверяется не «скрипт отработал без исключения», а три
// разных свойства:
//
// 1. **Ничего не потеряно** — количество строк по каждой коллекции сходится.
// 2. **Ничего не искажено** — обратная выгрузка совпадает с исходником с точностью
//    до согласованных изменений, и каждое из них перечислено здесь явным списком.
//    Именно явным: пересчитай тест те же значения тем же кодом, что и перенос, —
//    и он подтвердил бы любую ошибку вместе с самим переносом.
// 3. **Ловушки типов закрыты** — отсутствие ключа против пустого значения, порядок
//    массивов НА РЕАЛЬНЫХ данных, точность дробных, вид записи даты и времени.
//
// Данные берутся из настоящего каталога `data/`, а не из фикстур: перетасовку
// порядка в массивах ссылок дают именно боевые записи, а в фикстурах все массивы
// отсортированы, и проверка прошла бы вхолостую.

import path from 'node:path';

import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { exportSourceShape } from '../storage/seed/export-source-shape';
import { bookingSequenceStart, importSourceData } from '../storage/seed/import-from-files';
import { readSourceData, type SourceData } from '../storage/seed/source-data';

import { createTestDatabase, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

/**
 * Настоящий каталог данных, а не тот, что подставляет изоляция тестов.
 *
 * Путь считается явно, минуя `resolveDataDirectory`: та функция уважает переменную
 * окружения, которой другие тесты подменяют каталог на временную копию. Здесь нужен
 * именно исходник переноса.
 */
const DATA_DIRECTORY = path.join(__dirname, '..', '..', '..', '..', 'data');

/** Согласованные изменения, разложенные по номерам записей. */
const CLUB_RATINGS = new Map([
  [1, { rating: 3, reviewCount: 2 }],
  [2, { rating: 5, reviewCount: 1 }],
]);
const REPAIRED_ROOMS = new Map([
  [7, 'Малый зал'],
  [9, 'Основной зал'],
  [10, 'Основной зал'],
]);
const REPAIRED_REASONS = new Map([
  [27, 'Изменились планы'],
  [28, 'Не смогу прийти'],
  [29, 'Отмена по просьбе клиента'],
  [30, 'Ошибочная запись'],
]);
/** Слоты, у которых площадка была спрятана в поле вне типов. */
const RESCUED_VENUE = new Map([
  [4, 2],
  [5, 2],
]);

let db: TestDatabase;
let source: SourceData;

/** Исходник с наложенными согласованными изменениями — то, что обязано лежать в базе. */
function withAgreedChanges(original: SourceData): SourceData {
  const expected = structuredClone(original);

  // 1. Почищенные тексты (таблица 15.2).
  const eighth = expected.users.find((user) => user.id === 8);

  expect(eighth, 'пользователь 8 обязан быть в данных').toBeDefined();
  eighth!.name = 'Сергей Кузнецов';
  eighth!.email = 'sergey@sporthub.local';

  for (const slot of expected.schedule) {
    const room = REPAIRED_ROOMS.get(slot.id);

    if (room !== undefined) slot.room = room;
  }

  for (const booking of expected.bookings) {
    const reason = REPAIRED_REASONS.get(booking.id);

    if (reason === undefined) continue;

    // У всех четырёх записей история из двух переходов, и мусор лежит во втором —
    // в отказе провайдера. Индекс проставлен числом намеренно: так тест сломается,
    // если история этих записей изменится, а не подстроится под неё молча.
    expect(booking.statusHistory).toHaveLength(2);
    booking.statusHistory![1].reason = reason;
  }

  // 2. Пересчитанные агрегаты отзывов.
  for (const club of expected.clubs) {
    const aggregate = CLUB_RATINGS.get(club.id) ?? { rating: 0, reviewCount: 0 };

    club.rating = aggregate.rating;
    club.reviewCount = aggregate.reviewCount;
  }

  for (const trainer of expected.trainers) {
    trainer.rating = 0;
    trainer.reviewCount = 0;
  }

  // 3. Пересчитанные занятые места: действующих записей в данных нет вовсе.
  for (const slot of expected.schedule) slot.bookedCount = 0;

  // 4. Порядок в массивах ссылок — по возрастанию номера: колонки позиции в связующих
  //    таблицах нет, и восстановить прежний порядок записи не из чего.
  const ascending = (values: number[]): number[] => [...values].sort((a, b) => a - b);

  for (const club of expected.clubs) {
    club.sportIds = ascending(club.sportIds);
    club.tagIds = ascending(club.tagIds);
    club.amenityIds = ascending(club.amenityIds);
  }

  for (const trainer of expected.trainers) {
    trainer.sportIds = ascending(trainer.sportIds);
    trainer.specialtyIds = ascending(trainer.specialtyIds);
    trainer.workFormatIds = ascending(trainer.workFormatIds);
    // 5. Поля, удалённые из типов в фазе 25: источник правды связи — таблица связей.
    delete trainer.affiliatedClubId;
    delete trainer.clubId;
  }

  // 6. Спасённые сведения из полей вне типов.
  for (const offering of expected.offerings) delete offering.affiliatedClubId;

  const third = expected.offerings.find((offering) => offering.id === 3);

  expect(third, 'услуга 3 обязана быть в данных').toBeDefined();
  third!.trainerClubLinkId = 1;

  for (const slot of expected.schedule) {
    delete slot.affiliatedClubId;

    const venue = RESCUED_VENUE.get(slot.id);

    if (venue !== undefined) slot.clubId = venue;
  }

  return expected;
}

/** Коллекции сравниваются по номеру: порядок строк в базе без сортировки не гарантирован. */
function byId<TItem extends { id: number }>(items: TItem[]): TItem[] {
  return [...items].sort((left, right) => left.id - right.id);
}

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
  source = await readSourceData(DATA_DIRECTORY);

  await db.truncateAll();
  await importSourceData({ client: db.prisma, source, repairTexts: true });
}, 180_000);

afterAll(async () => {
  await db?.close();
});

describe('Количество строк', () => {
  it('по каждой коллекции совпадает с файлом', async () => {
    const counts = {
      cities: [source.cities.length, await db.prisma.city.count()],
      sports: [source.sports.length, await db.prisma.sport.count()],
      tags: [source.tags.length, await db.prisma.tag.count()],
      amenities: [source.amenities.length, await db.prisma.amenity.count()],
      specialties: [source.specialties.length, await db.prisma.specialty.count()],
      workFormats: [source.workFormats.length, await db.prisma.workFormat.count()],
      users: [source.users.length, await db.prisma.user.count()],
      clubs: [source.clubs.length, await db.prisma.club.count()],
      trainers: [source.trainers.length, await db.prisma.trainer.count()],
      trainerClubLinks: [source.trainerClubLinks.length, await db.prisma.trainerClubLink.count()],
      offerings: [source.offerings.length, await db.prisma.offering.count()],
      schedule: [source.schedule.length, await db.prisma.schedule.count()],
      bookings: [source.bookings.length, await db.prisma.booking.count()],
      reviews: [source.reviews.length, await db.prisma.review.count()],
      notifications: [source.notifications.length, await db.prisma.notification.count()],
      logs: [source.logs.length, await db.prisma.logEntry.count()],
      providerClientNotes: [
        source.providerClientNotes.length,
        await db.prisma.providerClientNote.count(),
      ],
    };

    for (const [collection, [inFile, inDatabase]] of Object.entries(counts)) {
      expect(inDatabase, `коллекция ${collection}`).toBe(inFile);
    }
  });

  it('вложенные структуры разложены по таблицам без потерь', async () => {
    const sum = (values: number[]): number => values.reduce((total, value) => total + value, 0);

    expect(await db.prisma.bookingStatusTransition.count()).toBe(
      sum(source.bookings.map((booking) => booking.statusHistory?.length ?? 0)),
    );
    expect(await db.prisma.clubSport.count()).toBe(
      sum(source.clubs.map((club) => club.sportIds.length)),
    );
    expect(await db.prisma.clubTag.count()).toBe(
      sum(source.clubs.map((club) => club.tagIds.length)),
    );
    expect(await db.prisma.clubAmenity.count()).toBe(
      sum(source.clubs.map((club) => club.amenityIds.length)),
    );
    expect(await db.prisma.clubImage.count()).toBe(
      sum(source.clubs.map((club) => club.imageUrls.length)),
    );
    expect(await db.prisma.trainerSport.count()).toBe(
      sum(source.trainers.map((trainer) => trainer.sportIds.length)),
    );
    expect(await db.prisma.trainerSpecialty.count()).toBe(
      sum(source.trainers.map((trainer) => trainer.specialtyIds.length)),
    );
    expect(await db.prisma.trainerWorkFormat.count()).toBe(
      sum(source.trainers.map((trainer) => trainer.workFormatIds.length)),
    );
    expect(await db.prisma.userFavoriteClub.count()).toBe(
      sum(source.users.map((user) => user.favoriteClubIds.length)),
    );
    expect(await db.prisma.userNotificationPreference.count()).toBe(
      sum(source.users.map((user) => Object.keys(user.notificationPreferences ?? {}).length)),
    );
  });
});

describe('Обратная выгрузка', () => {
  it('совпадает с исходником по каждой коллекции', async () => {
    const exported = await exportSourceShape(db.prisma);
    const expected = withAgreedChanges(source);

    // Сравнение строгое: `toEqual` считает отсутствующий ключ равным ключу
    // со значением `undefined`, а ровно эта разница и уезжает при переезде хранилища.
    expect(byId(exported.cities)).toStrictEqual(byId(expected.cities));
    expect(byId(exported.sports)).toStrictEqual(byId(expected.sports));
    expect(byId(exported.tags)).toStrictEqual(byId(expected.tags));
    expect(byId(exported.amenities)).toStrictEqual(byId(expected.amenities));
    expect(byId(exported.specialties)).toStrictEqual(byId(expected.specialties));
    expect(byId(exported.workFormats)).toStrictEqual(byId(expected.workFormats));
    expect(byId(exported.users)).toStrictEqual(byId(expected.users));
    expect(byId(exported.clubs)).toStrictEqual(byId(expected.clubs));
    expect(byId(exported.trainers)).toStrictEqual(byId(expected.trainers));
    expect(byId(exported.trainerClubLinks)).toStrictEqual(byId(expected.trainerClubLinks));
    expect(byId(exported.offerings)).toStrictEqual(byId(expected.offerings));
    expect(byId(exported.schedule)).toStrictEqual(byId(expected.schedule));
    expect(byId(exported.bookings)).toStrictEqual(byId(expected.bookings));
    expect(byId(exported.reviews)).toStrictEqual(byId(expected.reviews));
    expect(byId(exported.notifications)).toStrictEqual(byId(expected.notifications));
    expect(byId(exported.logs)).toStrictEqual(byId(expected.logs));
    expect(exported.providerClientNotes).toStrictEqual(expected.providerClientNotes);
  });
});

describe('Ловушки типов', () => {
  it('отсутствие ключа и пустое значение остаются разными вещами', async () => {
    const exported = await exportSourceShape(db.prisma);
    const withoutCity = exported.users.find((user) => user.id === 3)!;
    const withEmptyAvatar = exported.users.find((user) => user.id === 8)!;
    const withoutAvatar = exported.users.find((user) => user.id === 4)!;

    // В файле у пользователя 3 нет ключа города вовсе — и не должно появиться.
    expect(source.users.find((user) => user.id === 3)).not.toHaveProperty('city');
    expect(withoutCity).not.toHaveProperty('city');

    // А у пользователя 8 ключ есть, и значение у него — пустая строка.
    expect(source.users.find((user) => user.id === 8)?.avatarUrl).toBe('');
    expect(withEmptyAvatar).toHaveProperty('avatarUrl');
    expect(withEmptyAvatar.avatarUrl).toBe('');

    expect(withoutAvatar).not.toHaveProperty('avatarUrl');
  });

  it('пустая коллекция остаётся пустой коллекцией, а не пропадает', async () => {
    const exported = await exportSourceShape(db.prisma);

    for (const club of exported.clubs) {
      expect(club).toHaveProperty('imageUrls');
      expect(club.imageUrls).toEqual([]);
    }

    for (const user of exported.users) {
      expect(user).toHaveProperty('favoriteClubIds');
    }
  });

  it('порядок массивов восстанавливается по возрастанию — проверено на данных, где он был иным', async () => {
    const sourceClub3 = source.clubs.find((club) => club.id === 3)!;
    const sourceClub4 = source.clubs.find((club) => club.id === 4)!;

    // Сторож самой проверки: если в данных все массивы окажутся отсортированы,
    // она перестанет что-либо доказывать — и об этом надо узнать сразу.
    expect(sourceClub3.sportIds, 'в файле порядок иной').toEqual([1, 8, 5]);
    expect(sourceClub4.tagIds, 'в файле порядок иной').toEqual([10, 6, 12]);

    const exported = await exportSourceShape(db.prisma);

    expect(exported.clubs.find((club) => club.id === 3)!.sportIds).toEqual([1, 5, 8]);
    expect(exported.clubs.find((club) => club.id === 4)!.tagIds).toEqual([6, 10, 12]);
  });

  it('дробные значения переносятся без потери разрядов', async () => {
    const club = await db.prisma.club.findUniqueOrThrow({ where: { id: 1 } });
    const sourceClub = source.clubs.find((item) => item.id === 1)!;

    expect(club.latitude).toBe(sourceClub.coordinates.lat);
    expect(club.longitude).toBe(sourceClub.coordinates.lng);
    // Среднее из оценок 2 и 4 — ровно три, без «2.9999999999999996».
    expect(club.rating).toBe(3);

    const city = await db.prisma.city.findUniqueOrThrow({ where: { id: 1 } });

    expect(city.latitude).toBe(53.195878);
    expect(city.longitude).toBe(50.100202);
  });

  it('день и время слота лежат раздельными типами и читаются прежними строками', async () => {
    const row = await db.prisma.schedule.findUniqueOrThrow({ where: { id: 1 } });
    const sourceSlot = source.schedule.find((slot) => slot.id === 1)!;

    // В базе это объекты даты — день полуночью по UTC, время первым января 1970-го.
    expect(row.date).toBeInstanceOf(Date);
    expect(row.startTime).toBeInstanceOf(Date);
    expect(row.date.toISOString()).toBe(`${sourceSlot.date}T00:00:00.000Z`);
    expect(row.startTime.toISOString()).toBe(`1970-01-01T${sourceSlot.startTime}:00.000Z`);

    const exported = await exportSourceShape(db.prisma);
    const slot = exported.schedule.find((item) => item.id === 1)!;

    expect(slot.date).toBe(sourceSlot.date);
    expect(slot.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(slot.startTime).toBe(sourceSlot.startTime);
    expect(slot.startTime).toMatch(/^\d{2}:\d{2}$/);
    expect(slot.endTime).toBe(sourceSlot.endTime);
  });

  it('метки времени остаются строками того же вида', async () => {
    const exported = await exportSourceShape(db.prisma);

    expect(exported.users[0].createdAt).toBe(source.users[0].createdAt);
    expect(exported.users[0].createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('Спасённые сведения из полей вне типов', () => {
  it('услуга тренера в зале клуба получила и площадку, и ссылку на подтверждённую связь', async () => {
    // В файле у услуги 3 клуб записан полем `affiliatedClubId`, которого нет в типе.
    expect(source.offerings.find((offering) => offering.id === 3)).toHaveProperty(
      'affiliatedClubId',
      2,
    );

    const offering = await db.prisma.offering.findUniqueOrThrow({ where: { id: 3 } });

    expect(offering.venueClubId).toBe(2);
    expect(offering.trainerClubLinkId).toBe(1);

    // Связь, на которую сослались, действительно подтверждена и соединяет ту же пару.
    const link = await db.prisma.trainerClubLink.findUniqueOrThrow({ where: { id: 1 } });

    expect(link).toMatchObject({ trainerId: 1, clubId: 2, status: 'confirmed' });
  });

  it('площадка двух тренерских слотов восстановлена', async () => {
    for (const [slotId, clubId] of RESCUED_VENUE) {
      const sourceSlot = source.schedule.find((slot) => slot.id === slotId)!;

      expect(sourceSlot.clubId, 'в файле клуба у слота нет').toBeUndefined();

      const row = await db.prisma.schedule.findUniqueOrThrow({ where: { id: slotId } });

      expect(row.venueClubId, `слот ${slotId}`).toBe(clubId);
      expect(row.ownerTrainerId).toBe(1);
      expect(row.ownerClubId).toBeNull();
    }
  });

  it('площадка клубного слота не дублирует владельца', async () => {
    const row = await db.prisma.schedule.findUniqueOrThrow({ where: { id: 1 } });

    expect(row.ownerClubId).toBe(1);
    expect(row.venueClubId).toBeNull();
  });

  it('инициатор связи, которого нет в типе, сохранён', async () => {
    const withInitiator = source.trainerClubLinks.filter(
      (link) => link.initiatedByUserId !== undefined,
    );

    expect(withInitiator.length).toBeGreaterThan(0);

    for (const link of withInitiator) {
      const row = await db.prisma.trainerClubLink.findUniqueOrThrow({ where: { id: link.id } });

      expect(row.initiatedByUserId, `связь ${link.id}`).toBe(link.initiatedByUserId);
    }
  });
});

describe('Пересчитанные счётчики', () => {
  it('занятые места совпадают с фактическими действующими записями', async () => {
    const slots = await db.prisma.schedule.findMany({ orderBy: { id: 'asc' } });

    for (const slot of slots) {
      const actual = await db.prisma.booking.count({
        where: { scheduleId: slot.id, status: { in: [...ACTIVE_BOOKING_STATUSES] } },
      });

      expect(slot.bookedCount, `слот ${slot.id}`).toBe(actual);
    }

    // Сторож проверки: в файле счётчики были ненулевыми, значит она что-то ловит.
    const staleInFile = source.schedule.filter((slot) => slot.bookedCount > 0);

    expect(staleInFile.map((slot) => slot.id).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 8]);
  });

  it('рейтинги и число отзывов совпадают с фактическими отзывами', async () => {
    for (const club of await db.prisma.club.findMany({ orderBy: { id: 'asc' } })) {
      const reviews = await db.prisma.review.findMany({ where: { clubId: club.id } });
      const expectedRating =
        reviews.length === 0
          ? 0
          : reviews.reduce((sum, review) => sum + review.rating, 0) / reviews.length;

      expect(club.reviewCount, `клуб ${club.id}`).toBe(reviews.length);
      expect(club.rating, `клуб ${club.id}`).toBeCloseTo(expectedRating, 10);
    }

    for (const trainer of await db.prisma.trainer.findMany({ orderBy: { id: 'asc' } })) {
      const reviews = await db.prisma.review.findMany({ where: { trainerId: trainer.id } });

      expect(trainer.reviewCount, `тренер ${trainer.id}`).toBe(reviews.length);
    }

    // Ожидания из отчёта о состоянии данных — числами, а не пересчётом.
    expect((await db.prisma.club.findUniqueOrThrow({ where: { id: 1 } })).rating).toBe(3);
    expect((await db.prisma.club.findUniqueOrThrow({ where: { id: 1 } })).reviewCount).toBe(2);
    expect((await db.prisma.club.findUniqueOrThrow({ where: { id: 2 } })).rating).toBe(5);
    expect((await db.prisma.club.findUniqueOrThrow({ where: { id: 2 } })).reviewCount).toBe(1);
  });
});

describe('История переходов', () => {
  it('нулевая точка истории у записи ровно одна', async () => {
    const initial = await db.prisma.bookingStatusTransition.groupBy({
      by: ['bookingId'],
      where: { fromStatus: null },
      _count: { _all: true },
    });

    expect(initial).toHaveLength(source.bookings.length);

    for (const group of initial) {
      expect(group._count._all, `запись ${group.bookingId}`).toBe(1);
    }
  });

  it('машинные причины автопереходов не тронуты', async () => {
    const machine = await db.prisma.bookingStatusTransition.count({
      where: { reason: 'auto_cancel_pending_expired' },
    });
    const inFile = source.bookings
      .flatMap((booking) => booking.statusHistory ?? [])
      .filter((transition) => transition.reason === 'auto_cancel_pending_expired').length;

    expect(inFile).toBeGreaterThan(0);
    expect(machine).toBe(inFile);
  });
});

describe('Повторный запуск', () => {
  it('не удваивает строки', async () => {
    const before = await countEverything();

    await importSourceData({ client: db.prisma, source, repairTexts: true });

    expect(await countEverything()).toEqual(before);
  });

  it('не меняет содержимое', async () => {
    const exported = await exportSourceShape(db.prisma);

    await importSourceData({ client: db.prisma, source, repairTexts: true });

    expect(byId((await exportSourceShape(db.prisma)).bookings)).toStrictEqual(
      byId(exported.bookings),
    );
  });
});

// Этот блок ПИШЕТ в базу, поэтому стоит последним: он ломает счётчики строк
// для всех, кто идёт после него.
describe('Нумерация после переноса', () => {
  it('следующая созданная запись получает номер выше номеров из висячих уведомлений', async () => {
    // 33, 1006 и 1007 — записи, которых нет, но уведомления о них остались.
    expect(bookingSequenceStart(source)).toBe(1008);

    const created = await db.prisma.booking.create({
      data: {
        scheduleId: 1,
        offeringId: 1,
        ownerClubId: 1,
        userId: 1,
        sportId: 7,
        date: new Date('2026-08-14T00:00:00.000Z'),
        status: 'pending',
        paymentStatus: 'unpaid',
        totalPrice: 1000,
      },
    });

    expect(created.id).toBeGreaterThan(1007);

    const orphanNotifications = await db.prisma.notification.count({
      where: { id: { in: [123, 126, 137, 138, 139] } },
    });

    // Уведомления остались историей пользователя, но новой записи они не достались.
    expect(orphanNotifications).toBe(5);

    await db.prisma.booking.delete({ where: { id: created.id } });
  });

  it('остальные счётчики продолжают нумерацию с максимума плюс один', async () => {
    const city = await db.prisma.city.create({
      data: { name: 'Проверка', nameNormalized: 'проверка', latitude: 0, longitude: 0 },
    });

    expect(city.id).toBe(Math.max(...source.cities.map((item) => item.id)) + 1);

    await db.prisma.city.delete({ where: { id: city.id } });
  });
});

/** Снимок количеств по всем таблицам — для сравнения «до и после». */
async function countEverything(): Promise<Record<string, number>> {
  return {
    cities: await db.prisma.city.count(),
    sports: await db.prisma.sport.count(),
    tags: await db.prisma.tag.count(),
    amenities: await db.prisma.amenity.count(),
    specialties: await db.prisma.specialty.count(),
    workFormats: await db.prisma.workFormat.count(),
    users: await db.prisma.user.count(),
    clubs: await db.prisma.club.count(),
    trainers: await db.prisma.trainer.count(),
    trainerClubLinks: await db.prisma.trainerClubLink.count(),
    offerings: await db.prisma.offering.count(),
    schedule: await db.prisma.schedule.count(),
    bookings: await db.prisma.booking.count(),
    bookingStatusTransitions: await db.prisma.bookingStatusTransition.count(),
    reviews: await db.prisma.review.count(),
    notifications: await db.prisma.notification.count(),
    logs: await db.prisma.logEntry.count(),
    providerClientNotes: await db.prisma.providerClientNote.count(),
    clubImages: await db.prisma.clubImage.count(),
    clubSports: await db.prisma.clubSport.count(),
    clubTags: await db.prisma.clubTag.count(),
    clubAmenities: await db.prisma.clubAmenity.count(),
    trainerSports: await db.prisma.trainerSport.count(),
    trainerSpecialties: await db.prisma.trainerSpecialty.count(),
    trainerWorkFormats: await db.prisma.trainerWorkFormat.count(),
    userFavoriteClubs: await db.prisma.userFavoriteClub.count(),
    userNotificationPreferences: await db.prisma.userNotificationPreference.count(),
  };
}
