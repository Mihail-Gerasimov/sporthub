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

import type {
  BookingsCountFilter,
  BookingsFilter,
  BookingsRepository,
  OwnerBookingCount,
  SportBookingCount,
} from '../bookings.repository';
import type { DailyCount, OwnerIdFilter } from '../crud.repository';
import { Prisma } from '../../storage/prisma-client/client';
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
import { selectDailyCounts, sinceDayCondition } from './crud.repository';
import { fromOwnerRef, toOwnerRef } from './owner-columns';
import { copyErasable, copyPresent, hasKey } from './patch';
import { isUniqueViolation } from './unique-violation';
import { ConflictError } from '../../common/domain-error';

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

/**
 * Принадлежность колонки набору значений для сырых запросов.
 *
 * Пустой набор превращается в `FALSE`, а не в `IN ()`: последнее — синтаксическая
 * ошибка, а по смыслу пустой набор означает «не подходит никто». Ровно так же
 * ведёт себя пустое множество в файловой реализации.
 */
function inValues(column: Prisma.Sql, values: (number | string)[]): Prisma.Sql {
  return values.length === 0
    ? Prisma.sql`FALSE`
    : Prisma.sql`${column} IN (${Prisma.join(values)})`;
}

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

    if (filter.sportId !== undefined) conditions.push({ sportId: filter.sportId });

    if (filter.createdFrom !== undefined) {
      // Граница периода — по ДНЮ создания в UTC, то есть полночь того же дня.
      conditions.push({ createdAt: { gte: fromDateKey(filter.createdFrom) } });
    }

    if (filter.owners !== undefined) {
      // Города у записи нет — она отбирается через свои публикации. Все четыре
      // варианта в ОДНОЙ скобке: клуб и тренер здесь не два условия подряд,
      // а два способа подойти под одно.
      conditions.push(PrismaBookingsRepository.ownerCondition(filter.owners));
    }

    const date: Record<string, Date> = {};

    if (filter.dateFrom !== undefined) date.gte = fromDateKey(filter.dateFrom);
    if (filter.dateTo !== undefined) date.lte = fromDateKey(filter.dateTo);

    if (Object.keys(date).length > 0) conditions.push({ date });

    return conditions.length === 0 ? {} : { AND: conditions };
  }

  /**
   * «Запись относится к одной из перечисленных публикаций» — одной скобкой.
   *
   * Колонок четыре, потому что клуб записи — это владелец ЛИБО площадка, а тренер —
   * владелец ЛИБО ведущий. Пустой набор даёт `IN ()`, то есть условие, которому
   * не отвечает ни одна строка: «в городе никого» — это не «фильтра нет».
   */
  private static ownerCondition(owners: OwnerIdFilter): Record<string, unknown> {
    return {
      OR: [
        { ownerClubId: { in: owners.clubIds } },
        { venueClubId: { in: owners.clubIds } },
        { ownerTrainerId: { in: owners.trainerIds } },
        { conductedByTrainerId: { in: owners.trainerIds } },
      ],
    };
  }

  /**
   * Тот же отбор, но выражением SQL.
   *
   * ⚠️ Второй вид ОДНОГО набора условий, и это осознанная плата. Группировать по дню
   * метки времени построитель запросов Prisma не умеет вовсе — только по колонке,
   * а нужен день, — поэтому три подсчёта уходят в сырой запрос и берут условие
   * отсюда. Оба вида ОБЯЗАНЫ означать одно и то же: правка `toWhere` без правки
   * этого метода — дефект, а не мелочь.
   *
   * Расхождение ловится не глазами: контрактный набор прогоняет один и тот же отбор
   * через `count` (построитель Prisma) и через `countByCreatedDay` (этот метод)
   * и требует, чтобы сумма по дням совпала с общим числом.
   */
  private static toSqlCondition(filter: BookingsCountFilter): Prisma.Sql {
    const parts: Prisma.Sql[] = [];

    if (filter.userId !== undefined) parts.push(Prisma.sql`user_id = ${filter.userId}`);

    if (filter.scheduleId !== undefined) {
      parts.push(Prisma.sql`schedule_id = ${filter.scheduleId}`);
    }

    if (filter.status !== undefined) {
      const statuses = Array.isArray(filter.status) ? filter.status : [filter.status];

      parts.push(inValues(Prisma.sql`status`, statuses));
    }

    if (filter.clubId !== undefined) {
      parts.push(
        Prisma.sql`(owner_club_id = ${filter.clubId} OR venue_club_id = ${filter.clubId})`,
      );
    }

    if (filter.trainerId !== undefined) {
      parts.push(
        Prisma.sql`(owner_trainer_id = ${filter.trainerId} OR conducted_by_trainer_id = ${filter.trainerId})`,
      );
    }

    // День занятия — колонка типа даты; строка приводится у параметра, как и везде.
    if (filter.dateFrom !== undefined) parts.push(Prisma.sql`date >= ${filter.dateFrom}::date`);
    if (filter.dateTo !== undefined) parts.push(Prisma.sql`date <= ${filter.dateTo}::date`);

    if (filter.sportId !== undefined) parts.push(Prisma.sql`sport_id = ${filter.sportId}`);

    if (filter.createdFrom !== undefined) {
      parts.push(sinceDayCondition(filter.createdFrom));
    }

    if (filter.owners !== undefined) {
      const { clubIds, trainerIds } = filter.owners;

      parts.push(
        Prisma.sql`(${inValues(Prisma.sql`owner_club_id`, clubIds)}
                 OR ${inValues(Prisma.sql`venue_club_id`, clubIds)}
                 OR ${inValues(Prisma.sql`owner_trainer_id`, trainerIds)}
                 OR ${inValues(Prisma.sql`conducted_by_trainer_id`, trainerIds)})`,
      );
    }

    return parts.length === 0 ? Prisma.sql`TRUE` : Prisma.join(parts, ' AND ');
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

  count(filter: BookingsCountFilter): Promise<number> {
    // Считает база. Прежде сводка читала ВСЕ записи платформы вместе с историей
    // переходов каждой — ради одного числа на карточке.
    return this.client.booking.count({ where: PrismaBookingsRepository.toWhere(filter) });
  }

  countByCreatedDay(filter: BookingsCountFilter): Promise<DailyCount[]> {
    return selectDailyCounts(
      this.client,
      Prisma.sql`bookings`,
      PrismaBookingsRepository.toSqlCondition(filter),
    );
  }

  async countBySport(filter: BookingsCountFilter): Promise<SportBookingCount[]> {
    // `ORDER BY MIN(id)` — тот самый «порядок первого появления» из контракта:
    // потребитель ранжирует выдачу устойчивой сортировкой по числу записей,
    // и при равных числах порядок решает именно этот ключ.
    const rows = await this.client.$queryRaw<{ sportId: number; count: number }[]>`
      SELECT sport_id AS "sportId", COUNT(*)::int AS count
        FROM bookings
       WHERE ${PrismaBookingsRepository.toSqlCondition(filter)}
       GROUP BY sport_id
       ORDER BY MIN(id)
    `;

    return rows.map((row) => ({ sportId: row.sportId, count: Number(row.count) }));
  }

  async countByOwner(filter: BookingsCountFilter): Promise<OwnerBookingCount[]> {
    const condition = PrismaBookingsRepository.toSqlCondition(filter);
    // Две группировки одной выдачей. Клуб записи — владелец ЛИБО площадка, тренер —
    // владелец ЛИБО ведущий, поэтому счёт идёт по `COALESCE`, а не по одной колонке:
    // иначе записи на тренерские занятия в чужом зале не попали бы в счётчик клуба.
    //
    // Одна запись законно попадает в ОБЕ половины — и к клубу, и к тренеру, — как
    // и в прежнем обходе выдачи. `UNION ALL`, а не `UNION`: снятие дублей здесь
    // склеило бы разные публикации с одинаковым числом записей.
    const rows = await this.client.$queryRaw<
      { ownerType: string; ownerId: number; count: number }[]
    >`
      SELECT owner_type AS "ownerType", owner_id AS "ownerId", count
        FROM (
          SELECT 'club' AS owner_type,
                 COALESCE(owner_club_id, venue_club_id) AS owner_id,
                 COUNT(*)::int AS count,
                 MIN(id) AS first_id
            FROM bookings
           WHERE (${condition}) AND COALESCE(owner_club_id, venue_club_id) IS NOT NULL
           GROUP BY 1, 2
          UNION ALL
          SELECT 'trainer' AS owner_type,
                 COALESCE(owner_trainer_id, conducted_by_trainer_id) AS owner_id,
                 COUNT(*)::int AS count,
                 MIN(id) AS first_id
            FROM bookings
           WHERE (${condition})
             AND COALESCE(owner_trainer_id, conducted_by_trainer_id) IS NOT NULL
           GROUP BY 1, 2
        ) AS grouped
       ORDER BY first_id, owner_type
    `;

    // Порядок задан запросом: сначала номер первой записи, затем вид. «club» перед
    // «trainer» по алфавиту — это и есть правило «в одной записи клуб идёт раньше».
    return rows.map((row) => ({
      type: row.ownerType as OwnerBookingCount['type'],
      id: row.ownerId,
      count: Number(row.count),
    }));
  }

  async insert(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking> {
    try {
      return await this.insertInner(booking);
    } catch (error) {
      // Один код нарушения уникальности — три разных текста наружу. Различить их
      // можно только по контексту операции, поэтому перевод стоит здесь, а не в общем
      // фильтре ошибок: там известен код, но неизвестно, что именно делали.
      if (isUniqueViolation(error)) {
        throw new ConflictError('Пользователь уже записан на это занятие');
      }

      throw error;
    }
  }

  private async insertInner(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking> {
    const owner = PrismaBookingsRepository.requireOwner(booking);
    // Повторную активную запись на то же занятие отбивает база частичным уникальным
    // индексом, а не проверка перед вставкой: проверка проходила при гонке, и один
    // человек получал две записи на одно занятие. Текст прежний.
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
   * Обновление с условием по ожидаемому прежнему статусу — ОДНОЙ операцией.
   *
   * Условие стоит в самом запросе, а не в проверке перед ним: между «прочитал статус»
   * и «записал новый» помещается чужой запрос, и два одновременных решения по одной
   * заявке проходят оба — её и подтверждают, и отклоняют, а счётчик мест уходит на два.
   * Ноль затронутых строк означает «кто-то успел раньше», и это не ошибка, а ответ.
   */
  async updateIfStatus(
    id: number,
    expected: BookingStatus,
    patch: Partial<Booking>,
  ): Promise<Booking | null> {
    const affected = await this.client.$executeRaw`
      UPDATE bookings SET status = ${patch.status ?? expected}
       WHERE id = ${id} AND status = ${expected}
    `;

    if (affected === 0) return null;

    // Статус уже переставлен условно; остальные поля записываются обычной правкой,
    // и гонки на них нет — до сюда доходит только победивший запрос.
    return this.update(id, patch);
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
