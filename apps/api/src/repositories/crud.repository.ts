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

export interface LogsRepository {
  findAll(): Promise<LogEntry[]>;
  /** Отобранная и порезанная страница журнала — оба действия уходят в запрос. */
  findPage(query: LogsQuery): Promise<LogsPage>;
  insert(entry: Omit<LogEntry, 'id' | 'createdAt'>): Promise<LogEntry>;
}

export interface ReviewsRepository {
  findAll(): Promise<Review[]>;
  findMany(filter: { clubId?: number; trainerId?: number }): Promise<Review[]>;
  insert(review: Omit<Review, 'id' | 'createdAt'>): Promise<Review>;
  removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number>;
}

export interface UsersRepository {
  findAll(): Promise<User[]>;
  findById(id: number): Promise<User | null>;
  findByEmail(email: string): Promise<User | null>;
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

  async findMany(filter: { clubId?: number; trainerId?: number }): Promise<Review[]> {
    const reviews = await this.readAll();

    return reviews.filter((review) => {
      if (filter.clubId !== undefined && review.clubId !== filter.clubId) return false;
      if (filter.trainerId !== undefined && review.trainerId !== filter.trainerId) return false;

      return true;
    });
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
