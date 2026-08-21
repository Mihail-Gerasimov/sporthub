// Тесты репозитория записей. Проверяем только доступ к данным: отбор,
// постраничность, порядок, точечные правки, историю переходов и каскадное
// удаление. Правила переходов сюда не входят — они чистые и живут
// в @sporthub/domain со своими тестами.
//
// Набор один и прогоняется ДВАЖДЫ: по файловой реализации и по реализации
// на базе. Это и есть проверка обещания фазы — контракт репозитория не изменился,
// значит сервис записей можно не трогать.
//
// Чего в этом наборе намеренно НЕТ:
//
// - проверок «номер равен единице»: в базе номера выдаёт последовательность;
// - двух ДЕЙСТВУЮЩИХ записей одного человека на одно занятие: в базе это запрещено
//   частичным уникальным индексом, и прежний набор такую пару создавал;
// - сравнения файла побайтно: у базы файла нет, и «не тронул хранилище» проверяется
//   числом затронутых строк.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Booking } from '@sporthub/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import { JsonBookingsRepository, type BookingsRepository } from './bookings.repository';
import { PrismaBookingsRepository } from './prisma/bookings.repository';

/** Клубная запись: владелец-клуб, зал у неё — он же. */
const base: Omit<Booking, 'id' | 'createdAt'> = {
  scheduleId: 1001,
  userId: 1,
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  sportId: 1,
  date: '2026-03-20',
  status: 'pending',
  paymentStatus: 'unpaid',
  totalPrice: 1000,
};

/** Тренерская запись в зале клуба 1: владелец — тренер, клуб указан площадкой. */
const trainerBooking: Omit<Booking, 'id' | 'createdAt'> = {
  ...base,
  scheduleId: 3003,
  userId: 2,
  ownerType: 'trainer',
  ownerId: 5,
  clubId: 1,
  trainerId: 5,
};

// ═════════════════════════════════════════════════════════════════════════════
// КОНТРАКТНЫЙ НАБОР
// ═════════════════════════════════════════════════════════════════════════════

const bookingsContract = (createRepository: () => Promise<BookingsRepository>) => {
  it('отбирает по пользователю, слоту и статусу', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2, status: 'confirmed' });
    await bookings.insert({ ...base, scheduleId: 2002, status: 'completed' });

    expect(await bookings.findMany({ userId: 1 })).toHaveLength(2);
    expect(await bookings.findMany({ scheduleId: 1001 })).toHaveLength(2);
    expect(await bookings.findMany({ status: 'pending' })).toHaveLength(1);
  });

  it('отбор по набору статусов принимает массив', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2, status: 'confirmed' });
    await bookings.insert({ ...base, scheduleId: 2002, status: 'completed' });

    expect(await bookings.findMany({ status: ['pending', 'confirmed'] })).toHaveLength(2);
  });

  it('отбор по клубу покрывает И владельца, И площадку', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...trainerBooking });
    await bookings.insert({ ...base, scheduleId: 4004, ownerId: 2, clubId: 2 });

    // ⚠️ У тренерского занятия в зале клуба клуб — это площадка, а не владелец.
    // Условие по одному полю такую запись пропускало.
    expect(await bookings.findMany({ clubId: 1 })).toHaveLength(2);
    expect(await bookings.findMany({ clubId: 2 })).toHaveLength(1);
    expect(await bookings.findMany({ trainerId: 5 })).toHaveLength(1);
  });

  it('отбирает по периоду дня занятия, границы включительны', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base, date: '2026-03-19' });
    await bookings.insert({ ...base, scheduleId: 2002, date: '2026-03-20' });
    await bookings.insert({ ...base, scheduleId: 4004, date: '2026-03-21' });

    expect(await bookings.findMany({ dateFrom: '2026-03-20' })).toHaveLength(2);
    expect(await bookings.findMany({ dateTo: '2026-03-20' })).toHaveLength(2);
    expect(await bookings.findMany({ dateFrom: '2026-03-20', dateTo: '2026-03-20' })).toHaveLength(
      1,
    );
  });

  it('постраничность режет выдачу в самом запросе', async () => {
    const bookings = await createRepository();
    const first = await bookings.insert({ ...base });
    const second = await bookings.insert({ ...base, scheduleId: 2002 });
    const third = await bookings.insert({ ...base, scheduleId: 4004 });

    expect((await bookings.findMany({ limit: 2 })).map((item) => item.id)).toEqual([
      first.id,
      second.id,
    ]);
    expect((await bookings.findMany({ offset: 2 })).map((item) => item.id)).toEqual([third.id]);
  });

  it('порядок по дню занятия ставит ранние первыми', async () => {
    const bookings = await createRepository();
    const late = await bookings.insert({ ...base, date: '2026-03-25' });
    const early = await bookings.insert({ ...base, scheduleId: 2002, date: '2026-03-19' });

    const ordered = await bookings.findMany({ userId: 1, order: 'slotDate' });

    expect(ordered.map((item) => item.id)).toEqual([early.id, late.id]);
  });

  it('правка несуществующей записи бросает дословный текст', async () => {
    const bookings = await createRepository();

    await expect(bookings.update(999, { status: 'confirmed' })).rejects.toThrow(
      'Запись не найдена',
    );
  });

  it('перенос даты слота меняет даты его записей и считает затронутые', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2 });
    await bookings.insert({ ...base, scheduleId: 2002 });

    const updated = await bookings.updateDateByScheduleId(1001, '2026-04-01');

    expect(updated).toBe(2);
    const moved = await bookings.findMany({ scheduleId: 1001 });
    expect(moved.every((booking) => booking.date === '2026-04-01')).toBe(true);
    const untouched = await bookings.findMany({ scheduleId: 2002 });
    expect(untouched[0].date).toBe('2026-03-20');
  });

  it('перенос на ту же дату не трогает ни одной строки', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });

    // У базы файла нет, поэтому «не тронул хранилище» проверяется числом
    // затронутых строк: условие «дата уже другая» стоит в самом запросе.
    expect(await bookings.updateDateByScheduleId(1001, '2026-03-20')).toBe(0);
  });

  it('каскадное удаление забирает записи и владельца, и площадки', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...trainerBooking });
    await bookings.insert({ ...base, scheduleId: 4004, ownerId: 2, clubId: 2 });

    const removed = await bookings.removeMany({ clubId: 1 });

    expect(removed).toBe(2);
    expect(await bookings.findAll()).toHaveLength(1);
  });

  it('пустой фильтр удаления не забирает НИЧЕГО', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });

    // ⚠️ На базе это ловушка: удаление без условия вычистило бы таблицу целиком.
    expect(await bookings.removeMany({})).toBe(0);
    expect(await bookings.findAll()).toHaveLength(1);
  });

  it('точечное удаление убирает одну запись', async () => {
    const bookings = await createRepository();
    const created = await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2 });

    await bookings.remove(created.id);

    expect(await bookings.findById(created.id)).toBeNull();
    expect(await bookings.findAll()).toHaveLength(1);
  });

  it('день занятия остаётся строкой YYYY-MM-DD', async () => {
    const bookings = await createRepository();

    const created = await bookings.insert({ ...base });

    expect(created.date).toBe('2026-03-20');
    expect((await bookings.findById(created.id))?.date).toBe('2026-03-20');
  });

  it('пустая история переходов не даёт ключа вовсе', async () => {
    const bookings = await createRepository();

    const created = await bookings.insert({ ...base });

    // Файловое хранилище пустой массив не писало, и сверка контрактов видит разницу.
    expect('statusHistory' in created).toBe(false);
  });

  it('история переходов дописывается, а не переписывается', async () => {
    const bookings = await createRepository();
    const created = await bookings.insert({
      ...base,
      statusHistory: [
        {
          from: null,
          to: 'pending',
          actor: 'athlete',
          actorUserId: 1,
          at: '2026-03-18T10:00:00.000Z',
        },
      ],
    });

    // ⚠️ Первая точка истории обязана сохранить пустое «откуда» ЯВНЫМ ключом:
    // эталон контрактов содержит `"from": null`.
    expect(created.statusHistory?.[0]).toMatchObject({ from: null, to: 'pending', actorUserId: 1 });
    // Причины у неё нет — и ключа тоже быть не должно.
    expect('reason' in created.statusHistory![0]).toBe(false);

    const updated = await bookings.update(created.id, {
      status: 'confirmed',
      statusHistory: [
        ...created.statusHistory!,
        {
          from: 'pending',
          to: 'confirmed',
          actor: 'provider',
          actorUserId: 2,
          at: '2026-03-18T11:00:00.000Z',
          reason: 'Подтверждено',
        },
      ],
    });

    expect(updated.status).toBe('confirmed');
    expect(updated.statusHistory?.map((item) => item.to)).toEqual(['pending', 'confirmed']);
    expect(updated.statusHistory?.[1].reason).toBe('Подтверждено');
  });

  it('владелец и площадка собираются обратно в поля контракта', async () => {
    const bookings = await createRepository();

    const created = await bookings.insert({ ...trainerBooking });
    const read = await bookings.findById(created.id);

    expect(read).toMatchObject({ ownerType: 'trainer', ownerId: 5, clubId: 1, trainerId: 5 });
  });

  // --- Подсчёты сводки --------------------------------------------------------

  it('счётчик понимает тот же отбор, что и выдача', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...trainerBooking });
    await bookings.insert({
      ...base,
      scheduleId: 4004,
      ownerId: 2,
      clubId: 2,
      status: 'confirmed',
    });

    expect(await bookings.count({})).toBe(3);
    expect(await bookings.count({ clubId: 1 })).toBe(2);
    expect(await bookings.count({ status: 'pending' })).toBe(2);
    expect(await bookings.count({ trainerId: 5 })).toBe(1);
  });

  it('отбирает по виду спорта и по дню создания', async () => {
    const bookings = await createRepository();
    const created = await bookings.insert({ ...base, sportId: 1 });
    await bookings.insert({ ...base, scheduleId: 2002, sportId: 2 });
    const today = created.createdAt.slice(0, 10);

    expect(await bookings.count({ sportId: 1 })).toBe(1);
    // День создания — не день занятия: занятие стоит на 2026-03-20, а запись сделана
    // сейчас, и границу периода сводка отсчитывает именно от момента записи.
    expect(await bookings.count({ createdFrom: today })).toBe(2);
    expect(await bookings.count({ createdFrom: '2999-01-01' })).toBe(0);
    expect(await bookings.findMany({ sportId: 2 })).toHaveLength(1);
  });

  it('отбор по публикациям — одно условие на два набора', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...trainerBooking });
    await bookings.insert({ ...base, scheduleId: 4004, ownerId: 2, clubId: 2 });

    // Тренерская запись подходит и по клубу-площадке, и по тренеру: это ОДНО
    // условие, а не два подряд, поэтому достаточно совпасть с любой половиной.
    expect(await bookings.count({ owners: { clubIds: [1], trainerIds: [] } })).toBe(2);
    expect(await bookings.count({ owners: { clubIds: [], trainerIds: [5] } })).toBe(1);
    expect(await bookings.count({ owners: { clubIds: [2], trainerIds: [5] } })).toBe(2);
    // ⚠️ Пустые наборы означают «никто не подошёл», а не «фильтра нет».
    expect(await bookings.count({ owners: { clubIds: [], trainerIds: [] } })).toBe(0);
  });

  it('график по дням сворачивает записи в строку на день', async () => {
    const bookings = await createRepository();
    const created = await bookings.insert({ ...base });
    await bookings.insert({ ...base, scheduleId: 2002 });
    const today = created.createdAt.slice(0, 10);

    expect(await bookings.countByCreatedDay({})).toEqual([{ date: today, count: 2 }]);
  });

  it('сумма по дням совпадает с общим числом при ЛЮБОМ отборе', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...trainerBooking, sportId: 2 });
    await bookings.insert({
      ...base,
      scheduleId: 4004,
      ownerId: 2,
      clubId: 2,
      status: 'confirmed',
    });

    // ⚠️ Сторож двух видов одного условия. Счётчик строит условие построителем
    // запросов, а график по дням — выражением SQL: группировать по дню метки
    // времени построитель не умеет. Разойдясь, эти два вида дадут правдоподобные,
    // но разные числа на одной карточке. Отбор берётся насыщенный — по всем полям
    // сразу, чтобы сторож смотрел на каждое.
    const filters = [
      {},
      { clubId: 1 },
      { status: ['pending' as const, 'confirmed' as const] },
      { sportId: 2 },
      { owners: { clubIds: [1], trainerIds: [5] } },
      { userId: 1, dateFrom: '2026-03-01', dateTo: '2026-12-31', sportId: 1 },
    ];

    for (const filter of filters) {
      const byDay = await bookings.countByCreatedDay(filter);
      const total = await bookings.count(filter);

      expect(byDay.reduce((sum, day) => sum + day.count, 0)).toBe(total);
    }
  });

  it('группировка по видам спорта идёт в порядке первой записи вида', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base, sportId: 2 });
    await bookings.insert({ ...base, scheduleId: 2002, sportId: 1 });
    await bookings.insert({ ...base, scheduleId: 4004, ownerId: 2, clubId: 2, sportId: 1 });

    // Порядок — по номеру ПЕРВОЙ записи вида, а не по числу записей: ранжирует
    // потребитель, и делает это устойчивой сортировкой поверх этого порядка.
    expect(await bookings.countBySport({})).toEqual([
      { sportId: 2, count: 1 },
      { sportId: 1, count: 2 },
    ]);
  });

  it('одна запись считается И клубу, И тренеру, клуб идёт раньше', async () => {
    const bookings = await createRepository();
    // Тренерское занятие в зале клуба 1: относится к обоим.
    await bookings.insert({ ...trainerBooking });
    await bookings.insert({ ...base, scheduleId: 4004, ownerId: 2, clubId: 2 });

    expect(await bookings.countByOwner({})).toEqual([
      // В одной записи клуб идёт раньше тренера — тот же порядок, в котором
      // складывала счётчики сводка.
      { type: 'club', id: 1, count: 1 },
      { type: 'trainer', id: 5, count: 1 },
      { type: 'club', id: 2, count: 1 },
    ]);
  });

  it('группировка по публикациям видит клуб и через владельца, и через площадку', async () => {
    const bookings = await createRepository();
    await bookings.insert({ ...base });
    await bookings.insert({ ...trainerBooking });

    // ⚠️ У клубной записи клуб стоит владельцем, у тренерской — площадкой.
    // Счёт по одной колонке потерял бы половину.
    expect(await bookings.countByOwner({})).toEqual([
      { type: 'club', id: 1, count: 2 },
      { type: 'trainer', id: 5, count: 1 },
    ]);
  });
};

// ═════════════════════════════════════════════════════════════════════════════
// ПРОГОН НА ФАЙЛОВОЙ РЕАЛИЗАЦИИ
// ═════════════════════════════════════════════════════════════════════════════

describe('BookingsRepository — файловая реализация', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-bookings-'));
    await writeFile(path.join(dataDirectory, 'bookings.json'), '[]\n', 'utf8');
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  bookingsContract(async () => new JsonBookingsRepository(new JsonStorage(dataDirectory)));
});

// ═════════════════════════════════════════════════════════════════════════════
// ТОТ ЖЕ НАБОР НА БАЗЕ
// ═════════════════════════════════════════════════════════════════════════════

describe('BookingsRepository — реализация на базе', () => {
  let db: TestDatabase;

  beforeAll(async () => {
    await ensureTestSchema();
    db = await createTestDatabase();
  }, 120_000);

  afterAll(async () => {
    await db?.close();
  });

  /**
   * Мир под внешние ключи записи: вид спорта, атлеты, клубы, тренер и слоты.
   * У файла таких связей не было вовсе — здесь они обязательны, иначе вставка
   * не пройдёт. Номера проставляются явно, чтобы набор проверок был общим.
   */
  const seedWorld = async (): Promise<void> => {
    await db.truncateAll();

    // Видов спорта два: группировка по видам на одном ничего не показала бы.
    await db.prisma.sport.createMany({
      data: [
        {
          id: 1,
          name: 'Плавание',
          slug: 'plavanie',
          description: 'Описание',
          icon: '🏊',
          imageUrl: '',
        },
        {
          id: 2,
          name: 'Бокс',
          slug: 'boks',
          description: 'Описание',
          icon: '🥊',
          imageUrl: '',
        },
      ],
    });

    for (const id of [1, 2]) {
      await db.prisma.user.create({
        data: {
          id,
          role: 'athlete',
          name: `Атлет ${id}`,
          email: `athlete${id}@test.local`,
          phone: '+7 (900) 000-00-00',
          passwordHash: 'hash',
        },
      });
    }

    for (const id of [1, 2]) {
      await db.prisma.club.create({
        data: {
          id,
          name: `Клуб ${id}`,
          slug: `club-${id}`,
          slugNormalized: `club-${id}`,
          description: 'Описание',
          shortDescription: 'Кратко',
          city: 'Самара',
          address: 'Ленина 1',
          phone: '+7 (900) 000-00-00',
          latitude: 53.2,
          longitude: 50.1,
        },
      });
    }

    await db.prisma.trainer.create({
      data: {
        id: 5,
        name: 'Тренер 5',
        slug: 'trainer-5',
        slugNormalized: 'trainer-5',
        bio: 'Био',
        experienceYears: 5,
      },
    });

    const slots = [
      { id: 1001, ownerClubId: 1, ownerTrainerId: null, venueClubId: null },
      { id: 2002, ownerClubId: 1, ownerTrainerId: null, venueClubId: null },
      { id: 3003, ownerClubId: null, ownerTrainerId: 5, venueClubId: 1 },
      { id: 4004, ownerClubId: 2, ownerTrainerId: null, venueClubId: null },
    ];

    for (const slot of slots) {
      await db.prisma.schedule.create({
        data: {
          ...slot,
          sportId: 1,
          title: `Слот ${slot.id}`,
          date: new Date('2026-03-20T00:00:00.000Z'),
          startTime: new Date('1970-01-01T10:00:00.000Z'),
          endTime: new Date('1970-01-01T11:00:00.000Z'),
          durationMinutes: 60,
          level: 'all_levels',
          capacity: 10,
          price: 1000,
        },
      });
    }
  };

  bookingsContract(async () => {
    await seedWorld();

    return new PrismaBookingsRepository(new PrismaTransactionRunner(db.service));
  });
});
