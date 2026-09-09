// Простые домены поверх базы: журнал, отзывы, пользователи, заметки провайдера.
//
// Устройство — как у справочников (`dictionaries.repository.ts`): клиент берётся
// у бегунка транзакций при каждом запросе, порядок выдачи задаётся явно, значения
// на границе переводятся мапперами. Здесь то же самое, но домены уже пишущие,
// поэтому добавляется третье правило: **правка меняет только то, что пришло**.
// Ключ, которого в правке нет, не трогается; ключ с пустым значением СТИРАЕТ поле —
// на этом держится, например, очистка города или аватара.
//
// Три места, где файловая реализация делала лишнюю работу, здесь превращаются
// в запрос — это не оптимизация «заодно», а требование Главного правила:
//
// 1. Вход искал пользователя перебором всей таблицы ради одной строки. Стало —
//    поиск по почте с уникальным индексом.
// 2. Журнал читался целиком, фильтровался в памяти и резался срезом массива.
//    Стало — `WHERE` и `LIMIT/OFFSET`, а общее число считается `count`, а не
//    длиной материализованного массива.
// 3. Избранные клубы и настройки уведомлений — отдельные таблицы. Их правка идёт
//    диффом (`diffIdSets`), а не «стереть всё и записать заново»: переписывание
//    целиком плодит новые строки при каждом сохранении и теряет всё, что к ним
//    когда-нибудь прицепится.

import { Injectable } from '@nestjs/common';
import type {
  LogEntry,
  NotificationType,
  PasswordResetToken,
  ProviderClientNote,
  Review,
  ServiceFaceRef,
  Session,
  User,
} from '@sporthub/types';

import type {
  DailyCount,
  LogsPage,
  LogsQuery,
  LogsRepository,
  OwnerIdFilter,
  PasswordResetTokensRepository,
  ProviderClientNotesFilter,
  ProviderClientNotesRepository,
  ReviewsCountFilter,
  ReviewsFilter,
  ReviewsRepository,
  SessionsRepository,
  UsersRepository,
} from '../crud.repository';
import { Prisma } from '../../storage/prisma-client/client';
import type { DatabaseClient } from '../../storage/prisma-transaction';
import { PrismaTransactionRunner } from '../../storage/prisma-transaction';
import { PrismaBookingsRepository } from './bookings.repository';
import { fromDateKey, omitNulls, toIsoString } from '../prisma-mappers';
import { copyErasable, copyPresent, hasKey, idsOf, syncIdLinks } from './patch';
import { ConflictError } from '../../common/domain-error';
import { isUniqueViolation } from './unique-violation';

/**
 * Метка времени строкой → значение колонки.
 *
 * Отсутствие метки означает пустое поле. Разбор строгий: молча записанное
 * `Invalid Date` не отличить от честной метки, пока оно не всплывёт при чтении.
 */

/** Поля пользователя, которые правятся как есть: колонки NOT NULL. */
const USER_PLAIN_FIELDS = [
  'role',
  'status',
  'name',
  'email',
  'phone',
  'passwordHash',
] as const satisfies readonly (keyof User & string)[];

/** Поля пользователя, которые правка вправе СТЕРЕТЬ пустым значением. */
const USER_ERASABLE_FIELDS = ['avatarUrl', 'city'] as const satisfies readonly (keyof User &
  string)[];

// --- Суточная группировка ------------------------------------------------------

/**
 * Нижняя граница дня как условие запроса.
 *
 * День берётся в UTC, поэтому граница — это полночь UTC того же дня, а сравнение
 * идёт по самой колонке, а не по её преобразованию: выражение вокруг колонки
 * отключило бы индекс по метке времени. Приведение стоит у ПАРАМЕТРА (`::timestamp`),
 * а не у колонки, и это не косметика: колонка объявлена без пояса, а драйвер
 * сериализует объект даты в пояс процесса — приведи мы значение на стороне
 * драйвера, граница уехала бы на часы.
 */
export function sinceDayCondition(fromDate: string | undefined): Prisma.Sql {
  return fromDate === undefined
    ? Prisma.sql`TRUE`
    : Prisma.sql`created_at >= ${fromDate}::timestamp`;
}

/**
 * Группировка по дню создания — ОДНИМ запросом, по строке на день.
 *
 * Prisma не умеет группировать по выражению над колонкой, а группировать надо
 * именно по дню метки времени. Поэтому здесь сырой запрос: он вернёт десятки строк
 * там, где чтение коллекции возвращало сотни тысяч.
 *
 * Три решения в этих шести строках, и каждое проверялось планом:
 *
 * 1. **Группировка идёт по значению ДАТЫ, а перевод в строку — уже над результатом.**
 *    Группировка сразу по `to_char` складывает строки переменной длины: сортировка
 *    не влезает в память и уходит на диск (внешнее слияние, временные файлы) —
 *    на полумиллионе строк это вдвое дороже. По дате ключ фиксированный, сортировка
 *    остаётся в памяти, а форматируются только сами дни, которых десятки.
 * 2. **Наружу отдаётся строка, а не дата.** Колонка типа даты вернулась бы объектом
 *    даты, и драйвер разобрал бы её в поясе процесса — день уехал бы на сутки для
 *    любого пояса западнее UTC. Нужен ровно тот же вид, что и первые десять символов
 *    метки, поэтому перевод в строку делает база.
 * 3. **`COUNT(*)::int`.** Без приведения счётчик приходит длинным целым, то есть
 *    `BigInt`, и молча ломает сериализацию ответа.
 *
 * Отбор стоит условием по самой колонке, поэтому ложится на индекс по метке времени
 * и берётся из него без обращения к таблице.
 *
 * Экспортируется вместе с `sinceDayCondition`, потому что тем же способом считает
 * свой график записей репозиторий записей: формула дня одна на проект.
 */
export async function selectDailyCounts(
  client: DatabaseClient,
  table: Prisma.Sql,
  condition: Prisma.Sql,
): Promise<DailyCount[]> {
  const rows = await client.$queryRaw<{ date: string; count: number }[]>`
    SELECT to_char(day, 'YYYY-MM-DD') AS date, count
      FROM (
        SELECT created_at::date AS day, COUNT(*)::int AS count
          FROM ${table}
         WHERE ${condition}
         GROUP BY 1
      ) AS grouped
     ORDER BY day
  `;

  return rows.map((row) => ({ date: row.date, count: Number(row.count) }));
}

// --- Журнал -------------------------------------------------------------------

type LogRow = {
  id: number;
  createdAt: Date;
  action: string;
  actorId: number;
  actorRole: string;
  entityType: string;
  entityId: number;
  meta: unknown;
};

@Injectable()
export class PrismaLogsRepository implements LogsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toEntry(row: LogRow): LogEntry {
    // `meta` в файле не хранилось вовсе, когда его не было; в базе это пустое
    // значение. Разницу видит сверка контрактов, поэтому ключ снимается.
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      action: row.action,
      actorId: row.actorId,
      actorRole: row.actorRole,
      entityType: row.entityType,
      entityId: row.entityId,
      meta: row.meta,
    }) as unknown as LogEntry;
  }

  /** Условие отбора — одно на выдачу и на счётчик, чтобы они не разошлись. */
  private static toWhere(query: LogsQuery): Record<string, unknown> {
    const createdAt: Record<string, Date> = {};

    if (query.from !== undefined) createdAt.gte = new Date(query.from);
    if (query.to !== undefined) createdAt.lte = new Date(query.to);

    return {
      ...(query.action !== undefined ? { action: query.action } : {}),
      ...(query.actorId !== undefined ? { actorId: query.actorId } : {}),
      ...(Object.keys(createdAt).length > 0 ? { createdAt } : {}),
    };
  }

  async findAll(): Promise<LogEntry[]> {
    const rows = await this.client.logEntry.findMany({ orderBy: { id: 'asc' } });

    return rows.map((row) => PrismaLogsRepository.toEntry(row as LogRow));
  }

  async findPage(query: LogsQuery): Promise<LogsPage> {
    const where = PrismaLogsRepository.toWhere(query);

    // Две задачи параллельно: страница и общее число подошедших записей.
    // Счёт делает база — материализовать всю выдачу ради её длины незачем.
    const [rows, total] = await Promise.all([
      this.client.logEntry.findMany({
        where,
        // Тай-брейкер по номеру обязателен: в журнал пишут пачками, метки совпадают
        // до миллисекунды, и без него страница 2 повторила бы строку со страницы 1.
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        skip: query.offset ?? 0,
        ...(query.limit === undefined ? {} : { take: query.limit }),
      }),
      this.client.logEntry.count({ where }),
    ]);

    return { items: rows.map((row) => PrismaLogsRepository.toEntry(row as LogRow)), total };
  }

  countByDate(query: { fromDate?: string }): Promise<DailyCount[]> {
    // Прежде сводка читала ВЕСЬ журнал и группировала его в памяти. Журнал растёт
    // быстрее всех таблиц и не чистится, так что ломалась бы сводка первой — не от
    // числа пользователей, а от времени работы системы. Теперь наружу выходит
    // по строке на день, а отбор по периоду ложится на индекс по метке времени.
    return selectDailyCounts(this.client, Prisma.sql`logs`, sinceDayCondition(query.fromDate));
  }

  async insert(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry> {
    const created = await this.client.logEntry.create({
      data: {
        action: entry.action,
        actorId: entry.actorId,
        actorRole: entry.actorRole,
        entityType: entry.entityType,
        entityId: entry.entityId,
        // Форма содержимого зависит от действия, запросов по его внутренностям нет.
        meta: (entry.meta ?? undefined) as never,
      },
    });

    return PrismaLogsRepository.toEntry(created as LogRow);
  }
}

// --- Отзывы -------------------------------------------------------------------

type ReviewRow = {
  id: number;
  createdAt: Date;
  userId: number;
  clubId: number | null;
  trainerId: number | null;
  rating: number;
  text: string;
};

/**
 * «Отзыв относится к одной из перечисленных публикаций» — одной скобкой.
 *
 * Адресат у отзыва ровно один, но какой именно — заранее неизвестно, поэтому
 * условие остаётся объединением по двум колонкам. Пустой набор даёт `IN ()`,
 * то есть условие, которому не отвечает ни одна строка, — ровно как пустое
 * множество в файловой реализации.
 */
function reviewOwnerCondition(owners: OwnerIdFilter): Prisma.ReviewWhereInput {
  return {
    OR: [{ clubId: { in: owners.clubIds } }, { trainerId: { in: owners.trainerIds } }],
  };
}

@Injectable()
export class PrismaReviewsRepository implements ReviewsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toReview(row: ReviewRow & { user?: { name: string } | null }): Review {
    // Адресат ровно один, второй ключ в файле отсутствовал — снимаем пустой.
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      userId: row.userId,
      clubId: row.clubId,
      trainerId: row.trainerId,
      rating: row.rating,
      text: row.text,
      // Имя автора приезжает связью в том же запросе. Отдельным походом за
      // пользователями это стало бы «плюс один запрос на каждый отзыв», а
      // списком всех пользователей — тем самым, что фаза и закрывает.
      authorName: row.user?.name ?? null,
    }) as unknown as Review;
  }

  /** Автор нужен только именем: остальные его поля к отзыву отношения не имеют. */
  private static readonly AUTHOR = { user: { select: { name: true } } } as const;

  async findAll(): Promise<Review[]> {
    const rows = await this.client.review.findMany({
      orderBy: { id: 'asc' },
      include: PrismaReviewsRepository.AUTHOR,
    });

    return rows.map((row) => PrismaReviewsRepository.toReview(row));
  }

  async findMany(filter: ReviewsFilter): Promise<Review[]> {
    const rows = await this.client.review.findMany({
      where: {
        ...(filter.clubId !== undefined ? { clubId: filter.clubId } : {}),
        ...(filter.trainerId !== undefined ? { trainerId: filter.trainerId } : {}),
      },
      // Порядок «свежие первыми» уходит в запрос: под него уже есть индексы
      // `[clubId, createdAt desc]` и `[trainerId, createdAt desc]`, и до этого
      // работал только их префикс. Тай-брейкер по номеру обязателен: при равных
      // метках времени `ORDER BY` в базе неустойчив.
      orderBy: filter.order === 'newest' ? [{ createdAt: 'desc' }, { id: 'desc' }] : { id: 'asc' },
      include: PrismaReviewsRepository.AUTHOR,
    });

    return rows.map((row) => PrismaReviewsRepository.toReview(row));
  }

  count(filter: ReviewsCountFilter): Promise<number> {
    const conditions: Prisma.ReviewWhereInput[] = [];

    // Граница периода — по дню в UTC, то есть полночь того же дня.
    if (filter.fromDate !== undefined) {
      conditions.push({ createdAt: { gte: fromDateKey(filter.fromDate) } });
    }

    // Города у отзыва нет — он отбирается через свои публикации. Пустые наборы
    // дают условие, которому не отвечает никто: это «в городе никого», а не
    // «фильтра нет».
    if (filter.owners !== undefined) {
      conditions.push(reviewOwnerCondition(filter.owners));
    }

    // Автор и адресат — отдельные условия, а не пара: адресат спрашивается
    // и без автора (сводка), автор без адресата смысла пока не имеет, но и
    // запрещать его тут нечем — это отбор, а не правило.
    if (filter.userId !== undefined) {
      conditions.push({ userId: filter.userId });
    }

    if (filter.clubId !== undefined) {
      conditions.push({ clubId: filter.clubId });
    }

    if (filter.trainerId !== undefined) {
      conditions.push({ trainerId: filter.trainerId });
    }

    return this.client.review.count({
      where: conditions.length === 0 ? {} : { AND: conditions },
    });
  }

  async insert(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    const created = await this.client.review.create({
      data: {
        userId: review.userId,
        clubId: review.clubId ?? null,
        trainerId: review.trainerId ?? null,
        rating: review.rating,
        text: review.text,
      },
    });

    return PrismaReviewsRepository.toReview(created);
  }

  async removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number> {
    const targets: Record<string, number>[] = [];

    if (filter.clubId !== undefined) targets.push({ clubId: filter.clubId });
    if (filter.trainerId !== undefined) targets.push({ trainerId: filter.trainerId });

    // ⚠️ Пустой фильтр означает «никого», а не «всех». В файловой реализации это
    // выходило само собой, а `deleteMany` с пустым условием вычистил бы таблицу.
    if (targets.length === 0) return 0;

    const { count } = await this.client.review.deleteMany({ where: { OR: targets } });

    return count;
  }
}

// --- Пользователи -------------------------------------------------------------

type UserRow = {
  id: number;
  createdAt: Date;
  role: string;
  accountKind: string;
  status: string;
  name: string;
  email: string;
  phone: string;
  passwordHash: string;
  avatarUrl: string | null;
  city: string | null;
  favoriteClubs?: { clubId: number }[];
  notificationPreferences?: { type: string; enabled: boolean }[];
};

/** Связанные таблицы читаются вместе с пользователем — иначе выйдет запрос на строку. */
const USER_RELATIONS = {
  // Позиции у избранного нет (решение 6.4), порядок восстанавливается по номеру клуба.
  favoriteClubs: { orderBy: { clubId: 'asc' } },
  notificationPreferences: { orderBy: { type: 'asc' } },
} as const;

@Injectable()
export class PrismaUsersRepository implements UsersRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toUser(row: UserRow): User {
    const preferences: Partial<Record<NotificationType, boolean>> = {};

    for (const preference of row.notificationPreferences ?? []) {
      preferences[preference.type as NotificationType] = preference.enabled;
    }

    return {
      ...omitNulls({
        id: row.id,
        createdAt: toIsoString(row.createdAt),
        role: row.role,
        // Вид учётной записи (шаг 35.18). Колонка обязательная со значением
        // по умолчанию, поэтому пустой она не бывает.
        accountKind: row.accountKind,
        status: row.status,
        name: row.name,
        email: row.email,
        phone: row.phone,
        passwordHash: row.passwordHash,
        avatarUrl: row.avatarUrl,
        city: row.city,
        // Отсутствие строк означает «настроек нет» — в файле ключа тоже не было.
        // Пустой объект здесь и `?? {}` у потребителя дают один и тот же ответ.
        notificationPreferences: Object.keys(preferences).length > 0 ? preferences : null,
      }),
      // ⚠️ Избранное снимать нельзя даже пустым: эталон контрактов ждёт ключ
      // с пустым массивом, и тип объявляет его обязательным. Здесь `omitEmptyArrays`
      // не применяется намеренно.
      favoriteClubIds: (row.favoriteClubs ?? []).map((favorite) => favorite.clubId),
    } as unknown as User;
  }

  async findAll(): Promise<User[]> {
    const rows = await this.client.user.findMany({
      include: USER_RELATIONS,
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaUsersRepository.toUser(row as UserRow));
  }

  async findClientsOf(owners: OwnerIdFilter): Promise<User[]> {
    // ⚠️ Отбор делает база: «у этого человека есть хоть одна запись к моим
    // публикациям». Набор клиентов не материализуется ни списком номеров,
    // ни фильтром после чтения — иначе страница провайдера дорожала бы вместе
    // со всей площадкой, а не со своей выдачей.
    const rows = await this.client.user.findMany({
      where: { bookings: { some: PrismaBookingsRepository.ownerCondition(owners) } },
      include: USER_RELATIONS,
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaUsersRepository.toUser(row as UserRow));
  }

  async findById(id: number): Promise<User | null> {
    const row = await this.client.user.findUnique({ where: { id }, include: USER_RELATIONS });

    return row === null ? null : PrismaUsersRepository.toUser(row as UserRow);
  }

  async findByEmail(email: string): Promise<User | null> {
    // Раньше вход перебирал ВСЮ таблицу ради одной строки. Сравнение точное,
    // без приведения регистра, — обычный уникальный индекс ему и соответствует.
    const row = await this.client.user.findUnique({ where: { email }, include: USER_RELATIONS });

    return row === null ? null : PrismaUsersRepository.toUser(row as UserRow);
  }

  async countPlatformUsers(): Promise<{ total: number; providers: number; admins: number }> {
    // ⚠️ Шаг 35.19e. Считает база — тремя запросами вместо выгрузки таблицы.
    //
    // «Провайдер» после фазы 35 — это не роль, а владелец лиц услуг. Отбор идёт
    // по индексам `clubs_managed_by_user_id_idx` и `trainers_managed_by_user_id_idx`,
    // а `distinct` не даёт посчитать дважды того, у кого и клуб, и карточка, —
    // теперь это обычный случай, а не исключение.
    const [total, admins, clubOwners, cardOwners] = await Promise.all([
      this.client.user.count(),
      this.client.user.count({ where: { accountKind: 'admin' } }),
      this.client.club.findMany({
        where: { managedByUserId: { not: null } },
        distinct: ['managedByUserId'],
        select: { managedByUserId: true },
      }),
      this.client.trainer.findMany({
        where: { managedByUserId: { not: null } },
        distinct: ['managedByUserId'],
        select: { managedByUserId: true },
      }),
    ]);

    // Объединение двух наборов: человек с клубом И карточкой — один провайдер.
    const providerIds = new Set<number>();

    for (const row of [...clubOwners, ...cardOwners]) {
      if (row.managedByUserId !== null) providerIds.add(row.managedByUserId);
    }

    return { total, admins, providers: providerIds.size };
  }

  async insert(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    try {
      return await this.insertInner(user);
    } catch (error) {
      // Уникальность почты держит база, а не проверка перед вставкой: между «проверил»
      // и «записал» всегда есть щель, и две одновременные регистрации проходили обе.
      // Текст прежний — на него завязан маршрут регистрации и его тесты.
      if (isUniqueViolation(error, 'email')) {
        throw new ConflictError('Email уже зарегистрирован');
      }

      throw error;
    }
  }

  private async insertInner(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    const created = await this.client.user.create({
      data: {
        role: user.role,
        // Вид учётной записи: не задан — заводим человека. Администратора
        // назначают отдельно, регистрацией он не создаётся.
        ...(user.accountKind === undefined ? {} : { accountKind: user.accountKind }),
        // Колонка обязательная с дефолтом: «нет значения» и «active» — одно и то же.
        ...(user.status === undefined ? {} : { status: user.status }),
        name: user.name,
        email: user.email,
        phone: user.phone,
        passwordHash: user.passwordHash,
        avatarUrl: user.avatarUrl ?? null,
        city: user.city ?? null,
        favoriteClubs: {
          create: idsOf(user.favoriteClubIds).map((clubId) => ({ clubId })),
        },
        notificationPreferences: {
          create: Object.entries(user.notificationPreferences ?? {})
            .filter(([, enabled]) => enabled !== undefined)
            .map(([type, enabled]) => ({ type, enabled: enabled as boolean })),
        },
      },
      include: USER_RELATIONS,
    });

    return PrismaUsersRepository.toUser(created as UserRow);
  }

  async update(id: number, patch: Partial<User>): Promise<User> {
    const existing = await this.client.user.findUnique({ where: { id }, include: USER_RELATIONS });

    if (existing === null) {
      // Текст обязан совпадать дословно: на него завязаны роуты и тесты.
      throw new Error('Пользователь не найден');
    }

    const data: Record<string, unknown> = {};

    // Обязательные колонки принимают только заданное значение: пустое здесь
    // означало бы не «стереть», а нарушение схемы.
    copyPresent(patch, USER_PLAIN_FIELDS, data);
    // Необязательные — наоборот: ключ с пустым значением СТИРАЕТ поле.
    copyErasable(patch, USER_ERASABLE_FIELDS, data);

    await this.client.user.update({ where: { id }, data });

    await this.syncFavorites(id, existing.favoriteClubs, patch.favoriteClubIds);
    await this.syncPreferences(id, existing.notificationPreferences, patch.notificationPreferences);

    const updated = await this.client.user.findUnique({ where: { id }, include: USER_RELATIONS });

    return PrismaUsersRepository.toUser(updated as UserRow);
  }

  /** Избранное: правится диффом, а не переписыванием набора целиком. */
  private async syncFavorites(
    userId: number,
    previous: { clubId: number }[],
    next: number[] | undefined,
  ): Promise<void> {
    if (next === undefined) return;

    await syncIdLinks({
      previous: previous.map((favorite) => favorite.clubId),
      next: idsOf(next),
      remove: (clubIds) =>
        this.client.userFavoriteClub.deleteMany({ where: { userId, clubId: { in: clubIds } } }),
      add: (clubIds) =>
        this.client.userFavoriteClub.createMany({
          data: clubIds.map((clubId) => ({ userId, clubId })),
        }),
    });
  }

  /**
   * Настройки уведомлений: тот же дифф, но ключ строковый, а значение — признак.
   *
   * `diffIdSets` здесь не подходит (он про числовые ссылки), поэтому разбор
   * написан рядом: убрать пропавшие типы, записать новые и изменившиеся,
   * не трогая те, у которых значение осталось прежним.
   */
  private async syncPreferences(
    userId: number,
    previous: { type: string; enabled: boolean }[],
    next: Partial<Record<NotificationType, boolean>> | undefined,
  ): Promise<void> {
    if (next === undefined) return;

    const before = new Map(previous.map((row) => [row.type, row.enabled]));
    const after = new Map(
      Object.entries(next).filter(([, enabled]) => enabled !== undefined) as [string, boolean][],
    );

    const removed = [...before.keys()].filter((type) => !after.has(type));

    if (removed.length > 0) {
      await this.client.userNotificationPreference.deleteMany({
        where: { userId, type: { in: removed } },
      });
    }

    for (const [type, enabled] of after) {
      if (before.get(type) === enabled) continue;

      await this.client.userNotificationPreference.upsert({
        where: { userId_type: { userId, type } },
        create: { userId, type, enabled },
        update: { enabled },
      });
    }
  }
}

// --- Заметки провайдера о клиентах ---------------------------------------------

type NoteRow = {
  id: number;
  createdAt: Date;
  updatedAt: Date;
  providerUserId: number;
  clientUserId: number;
  note: string;
  bookingId: number | null;
  faceClubId: number | null;
  faceTrainerId: number | null;
};

/**
 * Условие «заметки этого лица» — ОДИН строитель на все запросы (шаг 35.27a).
 *
 * В базе лицо лежит двумя колонками ради внешнего ключа и каскада, а бизнес-код
 * знает пару «вид + номер». Перевод между формами живёт здесь и только здесь:
 * вторая копия этого `if` разошлась бы с первой при появлении третьего вида лица,
 * причём молча — запрос просто перестал бы находить часть строк.
 */
function noteFaceCondition(
  face: ServiceFaceRef,
): { faceClubId: number } | { faceTrainerId: number } {
  return face.type === 'club' ? { faceClubId: face.id } : { faceTrainerId: face.id };
}

/** Та же пара в виде полей записи: `undefined` там, где лица нет. */
function noteFaceColumns(note: { faceType?: ServiceFaceRef['type']; faceId?: number }): {
  faceClubId: number | null;
  faceTrainerId: number | null;
} {
  if (note.faceType === undefined || note.faceId === undefined) {
    return { faceClubId: null, faceTrainerId: null };
  }

  return note.faceType === 'club'
    ? { faceClubId: note.faceId, faceTrainerId: null }
    : { faceClubId: null, faceTrainerId: note.faceId };
}

@Injectable()
export class PrismaProviderClientNotesRepository implements ProviderClientNotesRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toNote(row: NoteRow): ProviderClientNote {
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
      providerUserId: row.providerUserId,
      clientUserId: row.clientUserId,
      note: row.note,
      bookingId: row.bookingId,
      // Две колонки схлопываются в пару: наружу лицо едет тем же видом,
      // каким его называет запрос, — `{ type, id }`, а не «одно из двух полей».
      faceType: row.faceClubId !== null ? 'club' : row.faceTrainerId !== null ? 'trainer' : null,
      faceId: row.faceClubId ?? row.faceTrainerId,
    }) as unknown as ProviderClientNote;
  }

  async findAll(): Promise<ProviderClientNote[]> {
    const rows = await this.client.providerClientNote.findMany({ orderBy: { id: 'asc' } });

    return rows.map((row) => PrismaProviderClientNotesRepository.toNote(row));
  }

  async findById(id: number): Promise<ProviderClientNote | null> {
    const row = await this.client.providerClientNote.findUnique({ where: { id } });

    return row === null ? null : PrismaProviderClientNotesRepository.toNote(row);
  }

  async findMany(filter: ProviderClientNotesFilter): Promise<ProviderClientNote[]> {
    const rows = await this.client.providerClientNote.findMany({
      where: {
        // Отбор по лицу ложится на индексы `provider_client_notes_face_club_idx`
        // и `..._face_trainer_idx`; отбор по автору — на прежний индекс по паре
        // «автор + клиент». Ни того ни другого нет только у полного среза,
        // которого у этого маршрута не бывает.
        ...(filter.providerUserId === undefined ? {} : { providerUserId: filter.providerUserId }),
        ...(filter.face === undefined ? {} : noteFaceCondition(filter.face)),
        ...(filter.clientUserId !== undefined ? { clientUserId: filter.clientUserId } : {}),
      },
      // «Свежие первыми» с тай-брейкером по номеру — то же, что даёт общий
      // компаратор домена файловой реализации.
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    });

    return rows.map((row) => PrismaProviderClientNotesRepository.toNote(row));
  }

  async insert(
    note: Omit<ProviderClientNote, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProviderClientNote> {
    // Момент берётся один раз на обе метки: два обращения к часам подряд давали
    // расхождение в миллисекунду, и «только что созданная» заметка выглядела правленой.
    const now = new Date();
    const created = await this.client.providerClientNote.create({
      data: {
        createdAt: now,
        updatedAt: now,
        providerUserId: note.providerUserId,
        clientUserId: note.clientUserId,
        note: note.note,
        bookingId: note.bookingId ?? null,
        ...noteFaceColumns(note),
      },
    });

    return PrismaProviderClientNotesRepository.toNote(created);
  }

  async update(
    id: number,
    patch: { note?: string; bookingId?: number },
  ): Promise<ProviderClientNote> {
    const existing = await this.client.providerClientNote.findUnique({ where: { id } });

    if (existing === null) {
      // Текст перенесён дословно: роут маппит его в 404.
      throw new Error('Заметка провайдера не найдена');
    }

    const updated = await this.client.providerClientNote.update({
      where: { id },
      data: {
        ...(patch.note === undefined ? {} : { note: patch.note }),
        // Ключ с пустым значением отвязывает заметку от записи; отсутствие ключа
        // оставляет привязку прежней.
        ...(hasKey(patch, 'bookingId') ? { bookingId: patch.bookingId ?? null } : {}),
        updatedAt: new Date(),
      },
    });

    return PrismaProviderClientNotesRepository.toNote(updated);
  }

  async remove(id: number): Promise<void> {
    // Удаление отсутствующей заметки не считается ошибкой — так же вела себя
    // файловая реализация, отфильтровывавшая по номеру.
    await this.client.providerClientNote.deleteMany({ where: { id } });
  }
}

/** Строка сессии из базы. */
type SessionRow = {
  id: number;
  createdAt: Date;
  tokenHash: string;
  userId: number;
  impersonatedUserId: number | null;
  lastSeenAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  userAgent: string | null;
  ip: string | null;
};

/**
 * Сессии входа поверх базы.
 *
 * Все обращения идут по индексам и ни одно не читает таблицу целиком: проверка
 * сессии случается на КАЖДОМ запросе к закрытому маршруту, и перебор здесь стоил бы
 * дороже всей остальной работы запроса.
 */
@Injectable()
export class PrismaSessionsRepository implements SessionsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toSession(row: SessionRow): Session {
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      tokenHash: row.tokenHash,
      userId: row.userId,
      impersonatedUserId: row.impersonatedUserId,
      lastSeenAt: toIsoString(row.lastSeenAt),
      expiresAt: toIsoString(row.expiresAt),
      revokedAt: row.revokedAt === null ? undefined : toIsoString(row.revokedAt),
      userAgent: row.userAgent,
      ip: row.ip,
    }) as unknown as Session;
  }

  async insert(session: Omit<Session, 'id' | 'createdAt'>): Promise<Session> {
    const row = await this.client.session.create({
      data: {
        tokenHash: session.tokenHash,
        userId: session.userId,
        impersonatedUserId: session.impersonatedUserId ?? null,
        lastSeenAt: new Date(session.lastSeenAt),
        expiresAt: new Date(session.expiresAt),
        revokedAt: session.revokedAt === undefined ? null : new Date(session.revokedAt),
        userAgent: session.userAgent ?? null,
        ip: session.ip ?? null,
      },
    });

    return PrismaSessionsRepository.toSession(row);
  }

  async findLiveByTokenHash(tokenHash: string, now: string): Promise<Session | null> {
    // Отозванность и предельный срок проверяет ЗАПРОС, а не код после чтения:
    // иначе мёртвая сессия сначала доезжала бы до памяти и только потом отбрасывалась.
    const row = await this.client.session.findFirst({
      where: { tokenHash, revokedAt: null, expiresAt: { gt: new Date(now) } },
    });

    return row === null ? null : PrismaSessionsRepository.toSession(row);
  }

  async touch(id: number, seenAt: string): Promise<void> {
    await this.client.session.update({ where: { id }, data: { lastSeenAt: new Date(seenAt) } });
  }

  async revoke(id: number, at: string): Promise<void> {
    // Условие по `revokedAt` не даёт переписать метку у уже отозванной: первый отзыв
    // и есть настоящий, и именно он интересен при разборе инцидента.
    await this.client.session.updateMany({
      where: { id, revokedAt: null },
      data: { revokedAt: new Date(at) },
    });
  }

  async revokeAllForUser(userId: number, at: string, exceptId?: number): Promise<number> {
    const result = await this.client.session.updateMany({
      where: {
        userId,
        revokedAt: null,
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      data: { revokedAt: new Date(at) },
    });

    return result.count;
  }

  async removeExpired(before: string): Promise<number> {
    const result = await this.client.session.deleteMany({
      where: { expiresAt: { lt: new Date(before) } },
    });

    return result.count;
  }
}

/** Строка ссылки восстановления из базы. */
type PasswordResetTokenRow = {
  id: number;
  createdAt: Date;
  tokenHash: string;
  userId: number;
  expiresAt: Date;
  usedAt: Date | null;
};

/**
 * Одноразовые ссылки восстановления поверх базы.
 *
 * Главное здесь — `claim`. Взятие ссылки в работу идёт ОДНИМ обновлением с условием
 * «ещё не использована и срок не вышел», а не чтением с последующей записью: два
 * одновременных перехода по одной ссылке иначе оба прошли бы проверку. Это тот же
 * приём, которым в фазе 33 чинился овербукинг, и та же причина — проверка и запись
 * обязаны быть одной операцией.
 */
@Injectable()
export class PrismaPasswordResetTokensRepository implements PasswordResetTokensRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toToken(row: PasswordResetTokenRow): PasswordResetToken {
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      tokenHash: row.tokenHash,
      userId: row.userId,
      expiresAt: toIsoString(row.expiresAt),
      usedAt: row.usedAt === null ? undefined : toIsoString(row.usedAt),
    }) as unknown as PasswordResetToken;
  }

  async insert(token: Omit<PasswordResetToken, 'id' | 'createdAt'>): Promise<PasswordResetToken> {
    const row = await this.client.passwordResetToken.create({
      data: {
        tokenHash: token.tokenHash,
        userId: token.userId,
        expiresAt: new Date(token.expiresAt),
        usedAt: token.usedAt === undefined ? null : new Date(token.usedAt),
      },
    });

    return PrismaPasswordResetTokensRepository.toToken(row);
  }

  async findUsableByTokenHash(tokenHash: string, now: string): Promise<PasswordResetToken | null> {
    // Пригодность проверяет ЗАПРОС: мёртвая ссылка не должна доезжать до памяти,
    // чтобы там её отбросили ещё раз.
    const row = await this.client.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date(now) } },
    });

    return row === null ? null : PrismaPasswordResetTokensRepository.toToken(row);
  }

  async claim(tokenHash: string, now: string): Promise<PasswordResetToken | null> {
    const at = new Date(now);
    // `updateMany` с условием, а не `update` по номеру: условие «ещё не использована»
    // обязано проверяться ТОЙ ЖЕ операцией, которая ставит метку. Проигравший получит
    // ноль изменённых строк и честный отказ.
    const claimed = await this.client.passwordResetToken.updateMany({
      where: { tokenHash, usedAt: null, expiresAt: { gt: at } },
      data: { usedAt: at },
    });

    if (claimed.count === 0) return null;

    // Строку читаем уже после захвата — по уникальному индексу и ровно один раз.
    // Сам захват от этого чтения не зависит, поэтому гонки здесь уже нет.
    const row = await this.client.passwordResetToken.findUnique({ where: { tokenHash } });

    return row === null ? null : PrismaPasswordResetTokensRepository.toToken(row);
  }

  async markAllUsedForUser(userId: number, at: string, exceptId?: number): Promise<number> {
    const result = await this.client.passwordResetToken.updateMany({
      where: {
        userId,
        usedAt: null,
        ...(exceptId === undefined ? {} : { id: { not: exceptId } }),
      },
      data: { usedAt: new Date(at) },
    });

    return result.count;
  }

  async removeExpired(before: string): Promise<number> {
    const result = await this.client.passwordResetToken.deleteMany({
      where: { expiresAt: { lt: new Date(before) } },
    });

    return result.count;
  }
}
