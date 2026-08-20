// Записи на тренировки поверх базы.
//
// Три места, где представление в базе отличается от контракта, и все три собираются
// обратно ЗДЕСЬ — сервисы и 139 использований `ownerType` в коде не меняются:
//
// 1. **Владелец и площадка.** Вместо пары «тип владельца + номер» в базе лежат две
//    взаимоисключающие ссылки (`ownerClubId` / `ownerTrainerId`) ПЛЮС отдельная
//    `venueClubId` — зал, в котором идёт занятие. Это разные сведения: тренерское
//    занятие в зале клуба принадлежит тренеру, а проходит у клуба, и владелец зала
//    обязан его видеть. Перевод пары владельца — общий (`./owner-columns`), площадку
//    каждая таблица собирает по-своему.
// 2. **История переходов.** Массив внутри записи стал таблицей. Причина не в
//    аккуратности: массив переписывался целиком из объекта, прочитанного ДО
//    транзакции, — два одновременных перехода теряли один бесследно, а по этой
//    истории считаются надёжность и карантин. Здесь дописывание истории —
//    вставка только новых строк, а не перезапись набора.
// 3. **День занятия.** Колонка типа даты, на границе — прежняя строка `YYYY-MM-DD`.
//
// Отдельно про отбор. До этого шага 14 страниц фронта тянули полный срез записей
// платформы, а автопереходы по времени читали всю таблицу ради двух статусов.
// Поэтому фильтр здесь умеет всё, что нужно этим страницам, и каждое его поле
// становится условием запроса, а не проверкой в цикле.

import { Injectable } from '@nestjs/common';
import type { Booking, BookingStatus, BookingStatusTransition } from '@sporthub/types';

import type { BookingsFilter, BookingsRepository } from '../bookings.repository';
import type { Prisma } from '../../storage/prisma-client/client';
import type { DatabaseClient } from '../../storage/prisma-transaction';
import { PrismaTransactionRunner } from '../../storage/prisma-transaction';
import {
  fromDateKey,
  fromOptionalIsoString,
  omitEmptyArrays,
  omitNulls,
  toDateKey,
  toIsoString,
  toNullable,
} from '../prisma-mappers';
import { fromOwnerRef, toOwnerRef } from './owner-columns';
import { copyErasable, copyPresent, hasKey } from './patch';

type TransitionRow = {
  id: number;
  fromStatus: string | null;
  toStatus: string;
  actor: string;
  actorUserId: number | null;
  at: Date;
  reason: string | null;
};

type BookingRow = {
  id: number;
  createdAt: Date;
  scheduleId: number;
  offeringId: number | null;
  ownerClubId: number | null;
  ownerTrainerId: number | null;
  venueClubId: number | null;
  conductedByTrainerId: number | null;
  userId: number;
  sportId: number;
  date: Date;
  status: string;
  paymentStatus: string;
  totalPrice: number;
  cancellationPolicySnapshot: string | null;
  cancelledBy: string | null;
  cancelReason: string | null;
  completedAt: Date | null;
  statusTransitions?: TransitionRow[];
};

/**
 * История читается вместе с записью и в явном порядке.
 *
 * Порядок — время перехода, вторым ключом номер строки. Без тай-брейкера два
 * перехода одной миллисекунды (создание и немедленное подтверждение — обычное
 * дело в тестах и в автопереходах) вставали бы в произвольном порядке, а по
 * последнему элементу истории считается причина отмены.
 */
const HISTORY_RELATION = {
  statusTransitions: { orderBy: [{ at: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.BookingInclude;

/** Поля записи, которые правятся как есть: колонки NOT NULL. */
const BOOKING_PLAIN_FIELDS = [
  'scheduleId',
  'userId',
  'sportId',
  'status',
  'paymentStatus',
  'totalPrice',
] as const satisfies readonly (keyof Booking & string)[];

/** Поля записи, которые правка вправе СТЕРЕТЬ пустым значением. */
const BOOKING_ERASABLE_FIELDS = [
  'offeringId',
  'cancellationPolicySnapshot',
  'cancelledBy',
  'cancelReason',
] as const satisfies readonly (keyof Booking & string)[];

@Injectable()
export class PrismaBookingsRepository implements BookingsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  /** Строка перехода → элемент истории. */
  private static toTransition(row: TransitionRow): BookingStatusTransition {
    return {
      // ⚠️ `from` у самой первой записи РАВЕН пустому значению и обязан таким остаться:
      // эталон контрактов содержит `"from": null` явным ключом. Снимать пустые здесь
      // можно только у двух полей ниже.
      from: row.fromStatus as BookingStatus | null,
      to: row.toStatus as BookingStatus,
      actor: row.actor as BookingStatusTransition['actor'],
      at: toIsoString(row.at),
      ...omitNulls({ actorUserId: row.actorUserId, reason: row.reason }),
      // Приведение нужно из-за `omitNulls`: он снимает пустые значения на деле,
      // но в типе они остаются — вычислить это в системе типов нечем.
    } as BookingStatusTransition;
  }

  private static toBooking(row: BookingRow): Booking {
    const owner = toOwnerRef(row);

    return omitEmptyArrays(
      omitNulls({
        id: row.id,
        createdAt: toIsoString(row.createdAt),
        scheduleId: row.scheduleId,
        offeringId: row.offeringId,
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        userId: row.userId,
        // Клуб записи — владелец либо зал. Собирается так же, как у слота
        // расписания: у клубной записи зал и владелец — один и тот же клуб.
        // Клуб и тренер занятия собираются из двух источников каждый: либо владелец,
        // либо участник другой роли — площадка у клуба, ведущий у тренера.
        clubId: row.ownerClubId ?? row.venueClubId,
        trainerId: row.ownerTrainerId ?? row.conductedByTrainerId,
        sportId: row.sportId,
        date: toDateKey(row.date),
        status: row.status,
        paymentStatus: row.paymentStatus,
        totalPrice: row.totalPrice,
        // Пустая история — это отсутствие ключа: файловое хранилище пустой массив
        // не писало, и сверка контрактов видит разницу.
        statusHistory: (row.statusTransitions ?? []).map((transition) =>
          PrismaBookingsRepository.toTransition(transition),
        ),
        cancellationPolicySnapshot: row.cancellationPolicySnapshot,
        cancelledBy: row.cancelledBy,
        cancelReason: row.cancelReason,
        completedAt: row.completedAt === null ? null : toIsoString(row.completedAt),
      }),
    ) as unknown as Booking;
  }

  /**
   * Фильтр контракта → условие запроса.
   *
   * Условия складываются списком, а не одним объектом: отбор по клубу сам по себе
   * состоит из двух вариантов (владелец или площадка), и вместе с любым вторым
   * условием он обязан остаться отдельной скобкой.
   */
  private static toWhere(filter: BookingsFilter): Record<string, unknown> {
    const conditions: Record<string, unknown>[] = [];

    if (filter.userId !== undefined) conditions.push({ userId: filter.userId });
    if (filter.scheduleId !== undefined) conditions.push({ scheduleId: filter.scheduleId });

    if (filter.status !== undefined) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];

      conditions.push({ status: { in: statuses } });
    }

    if (filter.clubId !== undefined) {
      // Клуб-владелец ИЛИ клуб-площадка: владелец зала обязан видеть записи
      // на тренерские занятия, которые идут у него.
      conditions.push({
        OR: [{ ownerClubId: filter.clubId }, { venueClubId: filter.clubId }],
      });
    }

    if (filter.trainerId !== undefined) {
      // Тот же приём, что и с клубом: тренер записи — это либо владелец, либо ведущий.
      conditions.push({
        OR: [{ ownerTrainerId: filter.trainerId }, { conductedByTrainerId: filter.trainerId }],
      });
    }

    const date: Record<string, Date> = {};

    if (filter.dateFrom !== undefined) date.gte = fromDateKey(filter.dateFrom);
    if (filter.dateTo !== undefined) date.lte = fromDateKey(filter.dateTo);

    if (Object.keys(date).length > 0) conditions.push({ date });

    return conditions.length === 0 ? {} : { AND: conditions };
  }

  /** Порядок выдачи — всегда явный, иначе страница зависела бы от плана запроса. */
  private static toOrderBy(filter: BookingsFilter): Record<string, 'asc'>[] {
    return filter.order === 'slotDate'
      ? [{ date: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }]
      : [{ id: 'asc' }];
  }

  async findAll(): Promise<Booking[]> {
    const rows = await this.client.booking.findMany({
      include: HISTORY_RELATION,
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaBookingsRepository.toBooking(row as BookingRow));
  }

  async findById(id: number): Promise<Booking | null> {
    const row = await this.client.booking.findUnique({ where: { id }, include: HISTORY_RELATION });

    return row === null ? null : PrismaBookingsRepository.toBooking(row as BookingRow);
  }

  async findMany(filter: BookingsFilter): Promise<Booking[]> {
    const rows = await this.client.booking.findMany({
      where: PrismaBookingsRepository.toWhere(filter),
      include: HISTORY_RELATION,
      orderBy: PrismaBookingsRepository.toOrderBy(filter),
      skip: filter.offset ?? 0,
      ...(filter.limit === undefined ? {} : { take: filter.limit }),
    });

    return rows.map((row) => PrismaBookingsRepository.toBooking(row as BookingRow));
  }

  async insert(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking> {
    const owner = PrismaBookingsRepository.requireOwner(booking);
    const created = await this.client.booking.create({
      data: {
        scheduleId: booking.scheduleId,
        offeringId: toNullable(booking.offeringId),
        ...fromOwnerRef(owner.ownerType, owner.ownerId),
        // ⚠️ Площадка заполняется только у тренерской записи. У клубной зал —
        // это сам клуб-владелец, и вторая ссылка на него дала бы второе место,
        // где эти сведения можно рассинхронизировать.
        venueClubId: owner.ownerType === 'trainer' ? toNullable(booking.clubId) : null,
        conductedByTrainerId: owner.ownerType === 'club' ? toNullable(booking.trainerId) : null,
        userId: booking.userId,
        sportId: booking.sportId,
        date: fromDateKey(booking.date),
        status: booking.status,
        paymentStatus: booking.paymentStatus,
        totalPrice: booking.totalPrice,
        cancellationPolicySnapshot: toNullable(booking.cancellationPolicySnapshot),
        cancelledBy: toNullable(booking.cancelledBy),
        cancelReason: toNullable(booking.cancelReason),
        completedAt: fromOptionalIsoString(booking.completedAt),
        statusTransitions: {
          create: (booking.statusHistory ?? []).map((transition) =>
            PrismaBookingsRepository.fromTransition(transition),
          ),
        },
      },
      include: HISTORY_RELATION,
    });

    return PrismaBookingsRepository.toBooking(created as BookingRow);
  }

  async update(id: number, patch: Partial<Booking>): Promise<Booking> {
    const existing = await this.client.booking.findUnique({
      where: { id },
      include: HISTORY_RELATION,
    });

    if (existing === null) {
      // Текст перенесён из db.ts дословно: роуты маппят его в 404.
      throw new Error('Запись не найдена');
    }

    const data: Record<string, unknown> = {};

    copyPresent(patch, BOOKING_PLAIN_FIELDS, data);
    copyErasable(patch, BOOKING_ERASABLE_FIELDS, data);

    if (hasKey(patch, 'date') && patch.date !== undefined) data.date = fromDateKey(patch.date);
    if (hasKey(patch, 'completedAt')) {
      data.completedAt = fromOptionalIsoString(patch.completedAt);
    }

    // Владелец правится только целиком: половина пары оставила бы строку
    // с двумя заполненными ссылками, а это запрещено CHECK-ограничением.
    if (patch.ownerType !== undefined && patch.ownerId !== undefined) {
      Object.assign(data, fromOwnerRef(patch.ownerType, patch.ownerId));
      data.venueClubId = patch.ownerType === 'trainer' ? toNullable(patch.clubId) : null;
      data.conductedByTrainerId = patch.ownerType === 'club' ? toNullable(patch.trainerId) : null;
    }

    await this.client.booking.update({ where: { id }, data });

    if (hasKey(patch, 'statusHistory')) {
      await this.appendHistory(id, existing.statusTransitions.length, patch.statusHistory ?? []);
    }

    const updated = await this.client.booking.findUnique({
      where: { id },
      include: HISTORY_RELATION,
    });

    return PrismaBookingsRepository.toBooking(updated as BookingRow);
  }

  /**
   * Дописывание истории.
   *
   * Сервис отдаёт историю целиком — прежний массив плюс новый переход, — но
   * записывается только хвост. Перезапись набора стёрла бы строки и завела их
   * заново, а вместе с ними исчез бы переход, добавленный параллельным вызовом.
   */
  private async appendHistory(
    bookingId: number,
    storedCount: number,
    history: BookingStatusTransition[],
  ): Promise<void> {
    const appended = history.slice(storedCount);

    if (appended.length === 0) return;

    await this.client.bookingStatusTransition.createMany({
      data: appended.map((transition) => ({
        bookingId,
        ...PrismaBookingsRepository.fromTransition(transition),
      })),
    });
  }

  async updateDateByScheduleId(scheduleId: number, date: string): Promise<number> {
    // Одним запросом: условие «дата уже другая» уходит в базу, поэтому счётчик
    // затронутых строк совпадает с прежним — записи с той же датой не считаются.
    const { count } = await this.client.booking.updateMany({
      where: { scheduleId, date: { not: fromDateKey(date) } },
      data: { date: fromDateKey(date) },
    });

    return count;
  }

  async remove(id: number): Promise<void> {
    // Удаление отсутствующей записи ошибкой не считается — так же вела себя
    // файловая реализация, отфильтровывавшая по номеру.
    await this.client.booking.deleteMany({ where: { id } });
  }

  async removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number> {
    const targets: Record<string, unknown>[] = [];

    if (filter.clubId !== undefined) {
      // ⚠️ И владелец, и площадка. Прежнее условие смотрело в одно поле, а у
      // тренерского занятия в зале клуба клуб — это именно площадка: удаление
      // клуба такие записи не забирало.
      targets.push({ ownerClubId: filter.clubId }, { venueClubId: filter.clubId });
    }

    if (filter.trainerId !== undefined) {
      targets.push(
        { ownerTrainerId: filter.trainerId },
        { conductedByTrainerId: filter.trainerId },
      );
    }

    // Пустой фильтр означает «никого», а не «всех»: `deleteMany` без условия
    // вычистил бы таблицу целиком.
    if (targets.length === 0) return 0;

    const { count } = await this.client.booking.deleteMany({ where: { OR: targets } });

    return count;
  }

  /** Владелец записи обязателен: в базе это колонка, а не необязательное поле. */
  private static requireOwner(booking: Omit<Booking, 'id' | 'createdAt'>): {
    ownerType: NonNullable<Booking['ownerType']>;
    ownerId: number;
  } {
    if (booking.ownerType === undefined || booking.ownerId === undefined) {
      throw new Error('У записи не указан владелец');
    }

    return { ownerType: booking.ownerType, ownerId: booking.ownerId };
  }

  /** Элемент истории → строка перехода. */
  private static fromTransition(transition: BookingStatusTransition): {
    fromStatus: string | null;
    toStatus: string;
    actor: string;
    actorUserId: number | null;
    at: Date;
    reason: string | null;
  } {
    return {
      fromStatus: transition.from ?? null,
      toStatus: transition.to,
      actor: transition.actor,
      actorUserId: toNullable(transition.actorUserId),
      at: new Date(transition.at),
      reason: toNullable(transition.reason),
    };
  }

  /** Метка времени строкой → значение колонки. */
}
