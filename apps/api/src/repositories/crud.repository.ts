// Репозитории простых доменов: логи, отзывы, пользователи, CRM-заметки.
// Все четыре в db.ts следуют одному паттерну — прочитать коллекцию, добавить
// запись со следующим id и меткой времени, записать обратно. Общая часть вынесена
// в базовый класс; специфика (фильтры, тексты ошибок) — в наследниках.
//
// Тексты ошибок перенесены из db.ts ДОСЛОВНО: на них завязаны роуты, которые
// маппят сообщение в HTTP-код, и тесты, сравнивающие строку посимвольно.

import { compareByCreatedAtDesc } from '@sporthub/domain';
import type { LogEntry, ProviderClientNote, Review, User } from '@sporthub/types';

import type { CollectionKey, JsonStorage } from '../storage/json-storage';

// --- Токены внедрения ---------------------------------------------------------

export const LOGS_REPOSITORY = Symbol('LOGS_REPOSITORY');
export const REVIEWS_REPOSITORY = Symbol('REVIEWS_REPOSITORY');
export const USERS_REPOSITORY = Symbol('USERS_REPOSITORY');
export const PROVIDER_CLIENT_NOTES_REPOSITORY = Symbol('PROVIDER_CLIENT_NOTES_REPOSITORY');

// --- Интерфейсы ---------------------------------------------------------------

export interface LogsRepository {
  findAll(): Promise<LogEntry[]>;
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
