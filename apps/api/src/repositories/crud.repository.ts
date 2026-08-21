// Репозитории простых доменов: логи, отзывы, пользователи, CRM-заметки.
// Все четыре в db.ts следуют одному паттерну — прочитать коллекцию, добавить
// запись со следующим id и меткой времени, записать обратно. Общая часть вынесена
// в базовый класс; специфика (фильтры, тексты ошибок) — в наследниках.
//
// Тексты ошибок перенесены из db.ts ДОСЛОВНО: на них завязаны роуты, которые
// маппят сообщение в HTTP-код, и тесты, сравнивающие строку посимвольно.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import type { LogAction, LogEntry, ProviderClientNote, Review, User } from '@sporthub/types';

import type { CollectionKey, JsonStorage } from '../storage/json-storage';

// --- Токены внедрения ---------------------------------------------------------

export const LOGS_REPOSITORY = Symbol('LOGS_REPOSITORY');
export const REVIEWS_REPOSITORY = Symbol('REVIEWS_REPOSITORY');
export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export const PROVIDER_CLIENT_NOTES_REPOSITORY = Symbol('PROVIDER_CLIENT_NOTES_REPOSITORY');

// --- Интерфейсы ---------------------------------------------------------------

/**
 * Отбор журнала. Все поля необязательные: маршрут вправе не задать ни одного.
 *
 * Отбор и постраничность живут ЗДЕСЬ, а не в контроллере, намеренно. Раньше журнал
 * читался целиком, фильтровался в памяти и резался срезом массива — то есть каждая
 * страница админки поднимала в память весь журнал платформы. На базе тот же набор
 * полей превращается в `WHERE` + `LIMIT/OFFSET`, и цена страницы перестаёт зависеть
 * от размера журнала.
 */
export interface LogsQuery {
  action?: LogAction;
  actorId?: number;
  /** Нижняя граница метки времени, включительно. */
  from?: string;
  /** Верхняя граница метки времени, включительно. */
  to?: string;
  offset?: number;
  limit?: number;
}

/** Страница журнала: сама выдача и общее число подошедших записей. */
export interface LogsPage {
  items: LogEntry[];
  total: number;
}

/**
 * Строка суточной группировки: день и сколько записей на него пришлось.
 *
 * День — в UTC, `YYYY-MM-DD`: ровно первые десять символов метки времени, как их
 * резала сводка платформы. Другой пояс сдвинул бы график на сутки, поэтому
 * пояс здесь зафиксирован и в файловой реализации, и в реализации на базе.
 */
export interface DailyCount {
  date: string;
  count: number;
}

/**
 * Ограничение по публикациям-адресатам: «относится хотя бы к одной из этих».
 *
 * Своего города у записей и отзывов нет, поэтому отбор по городу сводка выражает
 * через уже отобранные клубы и тренеров. Наличие поля означает, что ограничение
 * применяется; ПУСТЫЕ наборы означают «никто не подошёл», а не «ограничения нет» —
 * иначе фильтр по городу без публикаций молча превратился бы в отсутствие фильтра.
 */
export interface OwnerIdFilter {
  clubIds: number[];
  trainerIds: number[];
}

export interface LogsRepository {
  findAll(): Promise<LogEntry[]>;
  /** Отобранная и порезанная страница журнала — оба действия уходят в запрос. */
  findPage(query: LogsQuery): Promise<LogsPage>;
  /**
   * Активность платформы по дням: сколько записей журнала пришлось на каждый день.
   *
   * Считает база, а не сводка. Журнал — самая быстрорастущая таблица проекта, и он
   * не чистится: сводка ломалась бы не от числа пользователей, а от времени работы
   * системы. Группировка возвращает по строке на день, а не по строке на событие.
   *
   * Дни идут по возрастанию. `fromDate` — нижняя граница ДНЯ, включительно.
   */
  countByDate(query: { fromDate?: string }): Promise<DailyCount[]>;
  insert(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry>;
}

/** Отбор отзывов для подсчёта. Все поля необязательные. */
export interface ReviewsCountFilter {
  /** Нижняя граница дня создания, включительно, `YYYY-MM-DD`. */
  fromDate?: string;
  /** Ограничение по адресатам: отзыв относится к одной из перечисленных публикаций. */
  owners?: OwnerIdFilter;
}

/**
 * Отбор отзывов. Порядок — часть отбора, а не дело потребителя.
 *
 * ⚠️ Раньше репозиторий отдавал отзывы по номеру, и все три потребителя тут же
 * пересортировывали их «свежие первыми» в памяти. Индексы `[clubId, createdAt desc]`
 * и `[trainerId, createdAt desc]` при этом работали только префиксом: хвост ключа
 * не использовался, потому что базу об этом порядке никто не просил.
 */
export type ReviewsFilter = {
  clubId?: number;
  trainerId?: number;
  /** `newest` — свежие первыми, тай-брейкер по номеру. Умолчание — по номеру. */
  order?: 'id' | 'newest';
};

export interface ReviewsRepository {
  findAll(): Promise<Review[]>;
  findMany(filter: ReviewsFilter): Promise<Review[]>;
  /** Сколько отзывов подошло под отбор. Считает запрос, а не длина массива. */
  count(filter: ReviewsCountFilter): Promise<number>;
  insert(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>;
  removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number>;
}

export interface UsersRepository {
  findAll(): Promise<User[]>;
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
  /**
   * Сколько пользователей в каждой роли: ключ — роль, значение — число.
   *
   * Роль не перечисляется здесь списком намеренно: словарь ролей объявлен один раз
   * в `@sporthub/types`, и новая роль не должна требовать правки репозитория.
   * Роли без единого пользователя в ответе отсутствуют.
   */
  countByRole(): Promise<Record<string, number>>;
  insert(user: Omit<User, 'id' | 'createdAt'>): Promise<User>;
  update(id: number, patch: Partial<User>): Promise<User>;
}

export interface ProviderClientNotesRepository {
  findAll(): Promise<ProviderClientNote[]>;
  findById(id: number): Promise<ProviderClientNote | null>;
  findMany(filter: {
    providerUserId: number;
    clientUserId?: number;
  }): Promise<ProviderClientNote[]>;
  insert(
    note: Omit<ProviderClientNote, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProviderClientNote>;
  update(id: number, patch: { note?: string; bookingId?: number }): Promise<ProviderClientNote>;
  remove(id: number): Promise<void>;
}

// --- Общие мелочи файловых реализаций -----------------------------------------

/**
 * Срез страницы для файловых реализаций.
 *
 * Экспортируется, потому что тем же способом режет выдачу репозиторий записей:
 * формула у постраничности одна на проект, и расходиться ей нельзя. В реализациях
 * на базе этой функции соответствуют `skip`/`take` — там резать в памяти нечего.
 */
export function sliceToPage<TItem>(
  items: TItem[],
  page: { offset?: number; limit?: number },
): TItem[] {
  const offset = page.offset ?? 0;

  return page.limit === undefined ? items.slice(offset) : items.slice(offset, offset + page.limit);
}

/**
 * День метки времени в UTC.
 *
 * Ровно то, что делала сводка: первые десять символов строки. Вынесено сюда,
 * потому что тем же способом день считают журнал и записи, а расходиться этой
 * формуле нельзя — иначе один и тот же день попал бы в разные столбцы графика.
 */
export function toDayKey(createdAt: string): string {
  return createdAt.slice(0, 10);
}

/** Попадает ли запись в период: сравнение по ДНЮ, граница включительная. */
export function isOnOrAfterDay(createdAt: string, fromDate: string | undefined): boolean {
  return fromDate === undefined || toDayKey(createdAt) >= fromDate;
}

/**
 * Суточная группировка для файловых реализаций: дни по возрастанию.
 *
 * На базе этому соответствует `GROUP BY` по дню — там группировать в памяти нечего.
 */
export function groupByDay(items: { createdAt: string }[], fromDate?: string): DailyCount[] {
  const counts = new Map<string, number>();

  for (const item of items) {
    if (!isOnOrAfterDay(item.createdAt, fromDate)) continue;

    const date = toDayKey(item.createdAt);

    counts.set(date, (counts.get(date) ?? 0) + 1);
  }

  return [...counts.entries()]
    .map(([date, count]) => ({ date, count }))
    .sort((left, right) => left.date.localeCompare(right.date));
}

/**
 * Проверка «относится к одной из перечисленных публикаций» для файловых реализаций.
 *
 * Возвращает готовую проверку, а не проверяет по месту: наборы разворачиваются
 * в множества ОДИН раз, иначе отбор по городу стал бы перебором списка публикаций
 * на каждую строку. На базе этому соответствует `IN` по двум колонкам каждого вида.
 */
export function ownerIdMatcher(
  owners: OwnerIdFilter | undefined,
): (target: { clubId?: number; trainerId?: number }) => boolean {
  if (owners === undefined) return () => true;

  const clubIds = new Set(owners.clubIds);
  const trainerIds = new Set(owners.trainerIds);

  return (target) =>
    (target.clubId !== undefined && clubIds.has(target.clubId)) ||
    (target.trainerId !== undefined && trainerIds.has(target.trainerId));
}

/**
 * Попадает ли метка времени в границы отбора.
 *
 * Сравнение идёт по МОМЕНТУ, а не по строке. Строковое сравнение работало, пока
 * обе стороны писались одним и тем же способом, но `2026-02-02T00:00:00Z`
 * и `2026-02-02T00:00:00.000Z` — один и тот же момент и разные строки, а границы
 * приходят от клиента. На базе сравниваются значения времени, и файловая
 * реализация обязана отвечать так же, иначе один и тот же контрактный набор
 * не пройдёт на обеих.
 */
function isWithinInterval(value: string, from?: string, to?: string): boolean {
  const moment = new Date(value).getTime();

  if (from !== undefined && moment < new Date(from).getTime()) return false;
  if (to !== undefined && moment > new Date(to).getTime()) return false;

  return true;
}

// --- Базовый класс ------------------------------------------------------------

/**
 * Общая механика коллекции: чтение, выдача следующего id, метка времени.
 * Заведён не «на будущее» — у него четыре потребителя прямо сейчас.
 */
abstract class JsonCollectionRepository<TItem extends { id: number; createdAt: string }> {
  protected constructor(
    protected readonly storage: JsonStorage,
    protected readonly collection: CollectionKey,
  ) {}

  protected async readAll(): Promise<TItem[]> {
    return (await this.storage.read(this.collection)) as unknown as TItem[];
  }

  protected async writeAll(items: TItem[]): Promise<void> {
    await this.storage.write(this.collection, items as never);
  }

  /** Добавление записи с автогенерацией id и createdAt — как в db.ts. */
  protected async append<TInput extends object>(
    input: TInput,
    extra?: Record<string, unknown> | ((createdAt: string) => Record<string, unknown>),
  ): Promise<TItem> {
    const items = await this.readAll();
    // Момент создания берётся один раз: у заметок он же становится моментом
    // последней правки, и два вызова часов подряд давали расхождение в миллисекунду.
    const createdAt = new Date().toISOString();
    const item = {
      id: this.storage.getNextEntityId(items),
      createdAt,
      ...(typeof extra === 'function' ? extra(createdAt) : extra),
      ...input,
    } as unknown as TItem;

    await this.writeAll([...items, item]);

    return item;
  }
}

// --- Реализации ---------------------------------------------------------------

export class JsonLogsRepository
  extends JsonCollectionRepository<LogEntry>
  implements LogsRepository
{
  constructor(storage: JsonStorage) {
    super(storage, 'logs');
  }

  findAll(): Promise<LogEntry[]> {
    return this.readAll();
  }

  async findPage(query: LogsQuery): Promise<LogsPage> {
    const entries = await this.readAll();
    const selected = entries.filter((entry) => {
      if (query.action !== undefined && entry.action !== query.action) return false;
      if (query.actorId !== undefined && entry.actorId !== query.actorId) return false;

      return isWithinInterval(entry.createdAt, query.from, query.to);
    });

    // Порядок «свежие первыми» с тай-брейкером по номеру — общий компаратор домена.
    // Тай-брейкер обязателен: в журнал пишут пачками, метки совпадают до миллисекунды,
    // и без него страница 2 могла бы повторить строку со страницы 1.
    selected.sort(compareByCreatedAtDesc);

    // Общее число считается ДО среза: счётчик над таблицей показывает, сколько
    // записей подошло под фильтр, а не сколько влезло на страницу.
    return { items: sliceToPage(selected, query), total: selected.length };
  }

  async countByDate(query: { fromDate?: string }): Promise<DailyCount[]> {
    // Файловому хранилищу группировать нечем: чтение коллекции здесь неизбежно.
    // Это и есть цена пути отката — на базе тот же метод считает запросом.
    return groupByDay(await this.readAll(), query.fromDate);
  }

  insert(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry> {
    return this.append(entry);
  }
}

export class JsonReviewsRepository
  extends JsonCollectionRepository<Review>
  implements ReviewsRepository
{
  constructor(storage: JsonStorage) {
    super(storage, 'reviews');
  }

  findAll(): Promise<Review[]> {
    return this.readAll();
  }

  async findMany(filter: ReviewsFilter): Promise<Review[]> {
    const reviews = await this.readAll();
    const selected = reviews.filter((review) => {
      if (filter.clubId !== undefined && review.clubId !== filter.clubId) return false;
      if (filter.trainerId !== undefined && review.trainerId !== filter.trainerId) return false;

      return true;
    });

    // Порядок задаётся всегда: путь отката обязан совпасть с базой по результату.
    return filter.order === 'newest'
      ? selected.sort(compareByCreatedAtDesc)
      : selected.sort((left, right) => left.id - right.id);
  }

  async count(filter: ReviewsCountFilter): Promise<number> {
    const reviews = await this.readAll();
    const matchesOwner = ownerIdMatcher(filter.owners);

    return reviews.filter(
      (review) => isOnOrAfterDay(review.createdAt, filter.fromDate) && matchesOwner(review),
    ).length;
  }

  insert(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review> {
    return this.append(review);
  }

  async removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number> {
    const reviews = await this.readAll();
    const kept = reviews.filter((review) => {
      if (filter.clubId !== undefined && review.clubId === filter.clubId) return false;
      if (filter.trainerId !== undefined && review.trainerId === filter.trainerId) return false;

      return true;
    });

    await this.writeAll(kept);

    return reviews.length - kept.length;
  }
}

export class JsonUsersRepository extends JsonCollectionRepository<User> implements UsersRepository {
  constructor(storage: JsonStorage) {
    super(storage, 'users');
  }

  findAll(): Promise<User[]> {
    return this.readAll();
  }

  async findById(id: number): Promise<User | null> {
    const users = await this.readAll();

    return users.find((user) => user.id === id) ?? null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const users = await this.readAll();

    // Сравнение точное, без нормализации регистра — как в /api/auth/login.
    return users.find((user) => user.email === email) ?? null;
  }

  async countByRole(): Promise<Record<string, number>> {
    const users = await this.readAll();
    const counts: Record<string, number> = {};

    for (const user of users) {
      counts[user.role] = (counts[user.role] ?? 0) + 1;
    }

    return counts;
  }

  insert(user: Omit<User, 'id' | 'createdAt'>): Promise<User> {
    return this.append(user);
  }

  async update(id: number, patch: Partial<User>): Promise<User> {
    const users = await this.readAll();
    const index = users.findIndex((user) => user.id === id);

    if (index === -1) {
      throw new Error('Пользователь не найден');
    }

    const updated: User = { ...users[index], ...patch };
    const next = [...users];
    next[index] = updated;
    await this.writeAll(next);

    return updated;
  }
}

export class JsonProviderClientNotesRepository
  extends JsonCollectionRepository<ProviderClientNote>
  implements ProviderClientNotesRepository
{
  constructor(storage: JsonStorage) {
    super(storage, 'providerClientNotes');
  }

  findAll(): Promise<ProviderClientNote[]> {
    return this.readAll();
  }

  async findById(id: number): Promise<ProviderClientNote | null> {
    const notes = await this.readAll();

    return notes.find((note) => note.id === id) ?? null;
  }

  async findMany(filter: {
    providerUserId: number;
    clientUserId?: number;
  }): Promise<ProviderClientNote[]> {
    const notes = await this.readAll();

    // Порядок «свежие первыми» с тай-брейкером по id — общий компаратор домена.
    return notes
      .filter((note) => {
        if (note.providerUserId !== filter.providerUserId) return false;
        if (filter.clientUserId !== undefined && note.clientUserId !== filter.clientUserId) {
          return false;
        }

        return true;
      })
      .sort(compareByCreatedAtDesc);
  }

  insert(
    note: Omit<ProviderClientNote, 'id' | 'createdAt' | 'updatedAt'>,
  ): Promise<ProviderClientNote> {
    // updatedAt при создании совпадает с createdAt — так же, как было раньше.
    return this.append(note, (createdAt) => ({ updatedAt: createdAt }));
  }

  async update(
    id: number,
    patch: { note?: string; bookingId?: number },
  ): Promise<ProviderClientNote> {
    const notes = await this.readAll();
    const index = notes.findIndex((note) => note.id === id);

    if (index === -1) {
      throw new Error('Заметка провайдера не найдена');
    }

    const updated: ProviderClientNote = {
      ...notes[index],
      ...patch,
      updatedAt: new Date().toISOString(),
    };
    const next = [...notes];
    next[index] = updated;
    await this.writeAll(next);

    return updated;
  }

  async remove(id: number): Promise<void> {
    const notes = await this.readAll();

    await this.writeAll(notes.filter((note) => note.id !== id));
  }
}
