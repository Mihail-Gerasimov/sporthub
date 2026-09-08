// Одновременный доступ.
//
// Единственный вид проверок, который на файловом хранилище был невозможен в принципе:
// там между «прочитал» и «записал» всегда есть щель, и закрыть её нечем. Именно ради
// этих сценариев фаза и затевалась.
//
// Проверяется не скорость, а КОРРЕКТНОСТЬ: десять одновременных запросов на одно
// свободное место обязаны дать ровно одну запись, а не десять.

import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { Test } from '@nestjs/testing';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { BookingService } from '../bookings/booking.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import { PrismaBookingsRepository } from '../repositories/prisma/bookings.repository';
import { PrismaUsersRepository } from '../repositories/prisma/crud.repository';
import {
  PrismaClubsRepository,
  PrismaScheduleRepository,
} from '../repositories/prisma/entities.repository';
import { SlotContextService } from '../schedule/slot-context.service';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { StorageModule } from '../storage/storage.module';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from './db-harness';
import { ensureTestSchema } from './db-setup';

let db: TestDatabase;

beforeAll(async () => {
  await ensureTestSchema();
  db = await createTestDatabase();
}, 120_000);

afterAll(async () => {
  await db?.close();
});

beforeEach(async () => {
  await db.truncateAll();
});

/** Минимальный набор: вид спорта, клуб, услуга, слот с одним местом и десять участников. */
async function seedSlotWithOneSeat(): Promise<{ scheduleId: number; userIds: number[] }> {
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

  const offering = await db.prisma.offering.create({
    data: {
      ownerClubId: club.id,
      sportId: sport.id,
      title: 'Занятие',
      description: '',
      format: 'group',
      price: 1000,
      durationMinutes: 60,
      capacity: 1,
      address: '',
      latitude: 0,
      longitude: 0,
    },
  });

  const slot = await db.prisma.schedule.create({
    data: {
      offeringId: offering.id,
      ownerClubId: club.id,
      sportId: sport.id,
      title: 'Занятие',
      date: new Date('2026-09-01T00:00:00.000Z'),
      startTime: new Date('1970-01-01T10:00:00.000Z'),
      endTime: new Date('1970-01-01T11:00:00.000Z'),
      durationMinutes: 60,
      level: 'all_levels',
      capacity: 1,
      bookedCount: 0,
      price: 1000,
    },
  });

  const userIds: number[] = [];

  for (let index = 0; index < 10; index += 1) {
    const user = await db.prisma.user.create({
      data: {
        name: `Участник ${index}`,
        email: `race-${index}@test.local`,
        phone: '+7 (900) 000-00-00',
        passwordHash: 'хеш-заглушка',
        role: 'athlete',
        status: 'active',
      },
    });

    userIds.push(user.id);
  }

  return { scheduleId: slot.id, userIds };
}

/**
 * Попытка занять место одним условным обновлением.
 *
 * Ровно то выражение, которое стоит в реализации расписания: увеличение счётчика
 * с условием «мест ещё хватает». Ноль затронутых строк означает «мест нет» —
 * и означает это надёжно, потому что проверка и запись сделаны одной операцией.
 */
async function tryTakeSeat(scheduleId: number): Promise<boolean> {
  const affected = await db.prisma.$executeRaw`
    UPDATE schedule
       SET booked_count = booked_count + 1
     WHERE id = ${scheduleId}
       AND booked_count < capacity
  `;

  return affected === 1;
}

describe('Гонка за последним местом', () => {
  it('десять одновременных попыток дают ровно один успех', async () => {
    const { scheduleId } = await seedSlotWithOneSeat();

    const results = await Promise.all(Array.from({ length: 10 }, () => tryTakeSeat(scheduleId)));

    expect(results.filter(Boolean)).toHaveLength(1);

    const slot = await db.prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } });

    // Овербукинга нет: счётчик не ушёл выше вместимости.
    expect(slot.bookedCount).toBe(1);
  });

  it('счётчик не уходит ниже нуля при одновременном освобождении', async () => {
    const { scheduleId } = await seedSlotWithOneSeat();
    await tryTakeSeat(scheduleId);

    const release = () => db.prisma.$executeRaw`
      UPDATE schedule
         SET booked_count = booked_count - 1
       WHERE id = ${scheduleId}
         AND booked_count > 0
    `;

    const results = await Promise.all(Array.from({ length: 5 }, release));

    expect(results.filter((affected) => affected === 1)).toHaveLength(1);

    const slot = await db.prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } });

    expect(slot.bookedCount).toBe(0);
  });
});

describe('Ограничения уникальности под нагрузкой', () => {
  it('второй активной записи на пару «слот и участник» не появляется', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const userId = userIds[0];

    const create = (status: string) =>
      db.prisma.booking.create({
        data: {
          scheduleId,
          userId,
          sportId: 1,
          ownerClubId: 1,
          date: new Date('2026-09-01T00:00:00.000Z'),
          status,
          totalPrice: 1000,
        },
      });

    const outcomes = await Promise.allSettled([...ACTIVE_BOOKING_STATUSES].map(create));

    // Оба статуса действующие, значит вторая запись обязана быть отбита базой.
    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
  });

  it('закрытые состояния уникальностью не ограничены — история остаётся полной', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const userId = userIds[0];

    for (const status of ['cancelled_by_athlete', 'cancelled_by_provider', 'completed']) {
      await db.prisma.booking.create({
        data: {
          scheduleId,
          userId,
          sportId: 1,
          ownerClubId: 1,
          date: new Date('2026-09-01T00:00:00.000Z'),
          status,
          totalPrice: 1000,
        },
      });
    }

    expect(await db.prisma.booking.count({ where: { scheduleId, userId } })).toBe(3);
  });
});

describe('Каскады', () => {
  it('удаление клуба не оставляет висящих услуг, слотов и записей', async () => {
    const { scheduleId } = await seedSlotWithOneSeat();
    const slot = await db.prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } });

    await db.prisma.schedule.delete({ where: { id: scheduleId } });
    await db.prisma.club.delete({ where: { id: slot.ownerClubId as number } });

    expect(await db.prisma.offering.count()).toBe(0);
    expect(await db.prisma.schedule.count()).toBe(0);
    expect(await db.prisma.booking.count()).toBe(0);
  });

  it('удаление слота не стирает запись — у неё обнуляется ссылка', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();

    const booking = await db.prisma.booking.create({
      data: {
        scheduleId,
        userId: userIds[0],
        sportId: 1,
        ownerClubId: 1,
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: 'completed',
        totalPrice: 1000,
      },
    });

    // Провайдер вправе убрать занятие из расписания. Каскад стёр бы историю атлета,
    // `Restrict` не дал бы убрать вовсе — обнуление ссылки сохраняет и то и другое.
    await db.prisma.schedule.delete({ where: { id: scheduleId } });

    const survivor = await db.prisma.booking.findUniqueOrThrow({ where: { id: booking.id } });

    expect(survivor.scheduleId).toBeNull();
    // Снимки на месте: по ним запись и показывается атлету.
    expect(survivor.status).toBe('completed');
    expect(survivor.totalPrice).toBe(1000);
  });
});

describe('Атомарный счётчик мест в реализации расписания', () => {
  it('десять одновременных попыток занять одно место дают одну запись', async () => {
    const { scheduleId } = await seedSlotWithOneSeat();
    const schedule = new PrismaScheduleRepository(new PrismaTransactionRunner(db.service));

    const results = await Promise.allSettled(
      Array.from({ length: 10 }, () => schedule.changeBookedCount(scheduleId, 1)),
    );

    expect(results.filter((item) => item.status === 'fulfilled')).toHaveLength(1);
    // Остальные получают прежний текст ошибки, а не пятисотку.
    for (const item of results) {
      if (item.status === 'rejected') {
        expect(String(item.reason)).toContain('Свободных мест нет');
      }
    }

    expect((await schedule.findById(scheduleId))?.bookedCount).toBe(1);
  });

  it('одновременное освобождение не уводит счётчик в минус', async () => {
    const { scheduleId } = await seedSlotWithOneSeat();
    const schedule = new PrismaScheduleRepository(new PrismaTransactionRunner(db.service));

    await schedule.changeBookedCount(scheduleId, 1);
    await Promise.all(Array.from({ length: 5 }, () => schedule.changeBookedCount(scheduleId, -1)));

    expect((await schedule.findById(scheduleId))?.bookedCount).toBe(0);
  });
});

describe('Ограничения базы отдают ПРЕЖНИЕ тексты ошибок', () => {
  it('занятая почта — «Email уже зарегистрирован»', async () => {
    const users = new PrismaUsersRepository(new PrismaTransactionRunner(db.service));
    const user = {
      role: 'athlete',
      status: 'active',
      name: 'Первый',
      email: 'duplicate@test.local',
      phone: '+7 (900) 000-00-00',
      passwordHash: 'хеш-заглушка',
      favoriteClubIds: [],
    } as never;

    await users.insert(user);

    // Текст обязан совпадать дословно: на него завязан маршрут регистрации.
    await expect(users.insert(user)).rejects.toThrow('Email уже зарегистрирован');
  });

  it('повторная активная запись — «Пользователь уже записан на это занятие»', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const bookings = new PrismaBookingsRepository(new PrismaTransactionRunner(db.service));
    const booking = {
      scheduleId,
      userId: userIds[0],
      ownerType: 'club',
      ownerId: 1,
      sportId: 1,
      date: '2026-09-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
      statusHistory: [],
    } as never;

    await bookings.insert(booking);

    await expect(bookings.insert(booking)).rejects.toThrow(
      'Пользователь уже записан на это занятие',
    );
  });
});

describe('Гонка переходов записи', () => {
  it('два одновременных решения по одной заявке проходят не оба', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const bookings = new PrismaBookingsRepository(new PrismaTransactionRunner(db.service));

    const created = await bookings.insert({
      scheduleId,
      userId: userIds[0],
      ownerType: 'club',
      ownerId: 1,
      sportId: 1,
      date: '2026-09-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
      statusHistory: [],
    } as never);

    // Провайдер нажал «подтвердить», и в ту же секунду — «отклонить».
    const results = await Promise.all([
      bookings.updateIfStatus(created.id, 'pending', { status: 'confirmed' }),
      bookings.updateIfStatus(created.id, 'pending', { status: 'rejected_by_provider' }),
    ]);

    expect(results.filter((item) => item !== null)).toHaveLength(1);

    const fresh = await bookings.findById(created.id);

    // Состояние ровно одно — не «и подтверждена, и отклонена».
    expect(['confirmed', 'rejected_by_provider']).toContain(fresh?.status);
  });

  it('переход из уже изменённого состояния не выполняется', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const bookings = new PrismaBookingsRepository(new PrismaTransactionRunner(db.service));

    const created = await bookings.insert({
      scheduleId,
      userId: userIds[0],
      ownerType: 'club',
      ownerId: 1,
      sportId: 1,
      date: '2026-09-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
      statusHistory: [],
    } as never);

    await bookings.updateIfStatus(created.id, 'pending', { status: 'confirmed' });

    expect(
      await bookings.updateIfStatus(created.id, 'pending', { status: 'cancelled_by_athlete' }),
    ).toBeNull();
  });
});

describe('Каскадное удаление публикации на базе', () => {
  it('удаление клуба через сервис не оставляет висящих строк', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const slot = await db.prisma.schedule.findUniqueOrThrow({ where: { id: scheduleId } });
    const clubId = slot.ownerClubId as number;

    await db.prisma.booking.create({
      data: {
        scheduleId,
        userId: userIds[0],
        sportId: 1,
        ownerClubId: clubId,
        date: new Date('2026-09-01T00:00:00.000Z'),
        status: 'completed',
        totalPrice: 1000,
      },
    });

    // Порядок обязателен: запись держит слот внешним ключом `Restrict`,
    // и удаление слота раньше записи упирается в него.
    await db.prisma.booking.deleteMany({ where: { ownerClubId: clubId } });
    await db.prisma.schedule.deleteMany({ where: { ownerClubId: clubId } });
    await db.prisma.club.delete({ where: { id: clubId } });

    expect(await db.prisma.offering.count()).toBe(0);
    expect(await db.prisma.schedule.count()).toBe(0);
    expect(await db.prisma.booking.count()).toBe(0);
  });
});

describe('Занятый адрес-ссылка', () => {
  it('второй клуб с тем же названием отбивается внятной ошибкой, а не пятисоткой', async () => {
    const clubs = new PrismaClubsRepository(new PrismaTransactionRunner(db.service));
    const club = {
      name: 'Клуб с занятым именем',
      slug: 'club-taken',
      description: '',
      shortDescription: '',
      city: 'Самара',
      address: '',
      phone: '',
      coordinates: { lat: 0, lng: 0 },
      sportIds: [],
      tagIds: [],
      amenityIds: [],
      imageUrls: [],
      rating: 0,
      reviewCount: 0,
      priceFrom: 0,
      source: 'provider',
      status: 'published',
    } as never;

    await clubs.insert(club);

    // ⚠️ До фазы 33 второй клуб просто получал ту же ссылку, и его карточка
    // становилась недостижимой — молча.
    await expect(clubs.insert(club)).rejects.toThrow(
      'Клуб с таким названием уже есть — измените название',
    );
  });
});

/**
 * Гонка решений по одной заявке — через СЕРВИС, а не через репозиторий.
 *
 * Проверка выше («два одновременных решения проходят не оба») дёргает
 * `bookings.updateIfStatus` напрямую. Она доказывает, что условное обновление
 * работает, — и только это. Что делает сервис, когда условное обновление вернуло
 * пусто, она не видит вовсе: у репозитория этой ветки просто нет.
 *
 * А ветка есть, и она несёт обещание: проигравший узнаёт НАСТОЯЩУЮ причину отказа —
 * ту же, что получил бы, нажми он кнопку секундой позже, — а не безличное «состояние
 * изменилось». Ради этого сервис перечитывает запись и прогоняет по ней те же правила
 * переходов. Здесь проверяется именно этот текст: подмена его общим отказом означала бы,
 * что проигравшая ветка выродилась, а провайдер вместо «заявка уже подтверждена»
 * видит «повторите действие» — и повторяет, снова и снова.
 */
describe('Гонка переходов записи через сервис', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  /**
   * Сервис записей со всеми зависимостями, поднятый на базе.
   *
   * Собирается тем же модулем данных, что и рабочий сервер: подменять хранилище
   * заглушкой здесь нельзя вовсе — гонка живёт именно в базе.
   */
  async function createBookingService(): Promise<BookingService> {
    const previousUrl = process.env.DATABASE_URL;

    // Приложение читает адрес базы из окружения — направляем его в схему прогона.
    process.env.DATABASE_URL = testDatabaseUrl();

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
      providers: [SlotContextService, NotificationService, LogService, BookingService],
    }).compile();

    cleanup = async () => {
      await moduleRef.close();

      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;
    };

    return moduleRef.get(BookingService);
  }

  it('проигравший получает дословную причину отказа, а не безличный конфликт', async () => {
    const { scheduleId, userIds } = await seedSlotWithOneSeat();
    const bookings = new PrismaBookingsRepository(new PrismaTransactionRunner(db.service));
    const service = await createBookingService();

    const created = await bookings.insert({
      scheduleId,
      userId: userIds[0],
      ownerType: 'club',
      ownerId: 1,
      sportId: 1,
      date: '2026-09-01',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1000,
      statusHistory: [],
    } as never);

    // Провайдер нажал «подтвердить» дважды — например, с двух вкладок сразу.
    const confirm = () =>
      service.transition({
        bookingId: created.id,
        to: 'confirmed',
        actor: 'provider',
        actorUserId: userIds[1],
      });

    const outcomes = await Promise.allSettled([confirm(), confirm()]);

    expect(outcomes.filter((item) => item.status === 'fulfilled')).toHaveLength(1);

    const rejected = outcomes.filter(
      (item): item is PromiseRejectedResult => item.status === 'rejected',
    );

    expect(rejected).toHaveLength(1);
    // Дословно тот же текст, что отдают правила переходов: заявка уже подтверждена,
    // и подтвердить её второй раз нельзя.
    expect((rejected[0].reason as Error).message).toBe(
      'Недопустимый переход booking: confirmed → confirmed',
    );

    // Состояние ровно одно, история не раздвоилась.
    expect((await bookings.findById(created.id))?.status).toBe('confirmed');
  });
});
