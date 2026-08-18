// Слой хранилища бэкенда. Единственное место, которое знает, что данные лежат
// в JSON-файлах. Репозитории поверх него работают с коллекциями, а не с диском,
// поэтому в фазе базы этот файл заменяется на Prisma-реализацию, а слой выше
// не меняется вовсе.

import { AsyncLocalStorage } from 'node:async_hooks';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import type {
  Amenity,
  Booking,
  City,
  Club,
  LogEntry,
  Notification,
  Offering,
  ProviderClientNote,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  TrainerClubLink,
  User,
  WorkFormat,
} from '@sporthub/types';

/** Карта коллекций: ключ в коде → тип записи. */
export type DataCollectionMap = {
  amenities: Amenity[];
  bookings: Booking[];
  cities: City[];
  clubs: Club[];
  logs: LogEntry[];
  notifications: Notification[];
  offerings: Offering[];
  providerClientNotes: ProviderClientNote[];
  reviews: Review[];
  schedule: Schedule[];
  specialties: Specialty[];
  sports: Sport[];
  tags: Tag[];
  trainers: Trainer[];
  trainerClubLinks: TrainerClubLink[];
  users: User[];
  workFormats: WorkFormat[];
};

export type CollectionKey = keyof DataCollectionMap;

/** Имена файлов на диске. Менять нельзя — это боевые данные. */
const DATA_FILES: { [Key in CollectionKey]: string } = {
  amenities: 'amenities.json',
  bookings: 'bookings.json',
  cities: 'cities.json',
  clubs: 'clubs.json',
  logs: 'logs.json',
  notifications: 'notifications.json',
  offerings: 'offerings.json',
  providerClientNotes: 'provider-client-notes.json',
  reviews: 'reviews.json',
  schedule: 'schedule.json',
  specialties: 'specialties.json',
  sports: 'sports.json',
  tags: 'tags.json',
  trainers: 'trainers.json',
  trainerClubLinks: 'trainer-club-links.json',
  users: 'users.json',
  workFormats: 'work-formats.json',
};

/** Доступ к данным внутри транзакции: то же чтение и запись, но отложенные. */
export interface StorageTransaction {
  read<Key extends CollectionKey>(key: Key): Promise<DataCollectionMap[Key]>;
  write<Key extends CollectionKey>(key: Key, data: DataCollectionMap[Key]): Promise<void>;
}

/** Минимальная форма записи, достаточная для выдачи следующего идентификатора. */
type Identifiable = { id: number };

export class JsonStorage {
  private writeFailureHook: ((key: CollectionKey) => void) | null = null;

  /**
   * Буфер активной транзакции, привязанный к контексту выполнения.
   *
   * Он нужен, чтобы репозитории ничего не знали о транзакциях: сервис
   * оборачивает свою работу в `runInTransaction`, а вызванные внутри
   * репозитории продолжают звать обычные `read`/`write` и всё равно попадают
   * в буфер. Иначе пришлось бы протаскивать объект транзакции через каждый
   * метод каждого репозитория — и в фазе базы этот проброс пришлось бы
   * выкидывать целиком.
   */
  private readonly activeTransaction = new AsyncLocalStorage<Map<CollectionKey, unknown>>();

  constructor(private readonly dataDirectory: string) {}

  async read<Key extends CollectionKey>(key: Key): Promise<DataCollectionMap[Key]> {
    const buffer = this.activeTransaction.getStore();

    // Внутри транзакции видно то, что она сама уже записала.
    if (buffer?.has(key)) {
      return buffer.get(key) as DataCollectionMap[Key];
    }

    const raw = await readFile(this.filePath(key), 'utf8');

    return JSON.parse(raw) as DataCollectionMap[Key];
  }

  async write<Key extends CollectionKey>(key: Key, data: DataCollectionMap[Key]): Promise<void> {
    const buffer = this.activeTransaction.getStore();

    if (buffer) {
      buffer.set(key, data);

      return;
    }

    this.writeFailureHook?.(key);

    // Формат обязан совпадать с прежним побайтово: отступ 2 и завершающий
    // перевод строки. Иначе первая же запись перепишет весь боевой файл.
    await writeFile(this.filePath(key), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  }

  /**
   * Следующий идентификатор — максимальный существующий плюс один.
   * Дыры в нумерации не переиспользуются: id уже могли утечь в ссылки и логи.
   * ⚠️ На конкурентных вставках даёт дубликаты — в фазе базы заменяется на
   * autoincrement самой СУБД.
   */
  getNextEntityId(items: readonly Identifiable[]): number {
    if (items.length === 0) return 1;

    return Math.max(...items.map((item) => item.id)) + 1;
  }

  /**
   * Выполняет работу атомарно: записи копятся в буфере и уходят на диск одним
   * коммитом в конце. Если работа бросила исключение — на диск не попадает
   * ничего. Если упала сама запись — уже записанные коллекции откатываются
   * снимками, снятыми до коммита.
   *
   * ⚠️ Это не настоящая транзакция: между двумя `writeFile` процесс может
   * умереть, и откат не отработает. Ограничение файлового хранилища; в фазе
   * базы метод становится обёрткой над `prisma.$transaction`, а сигнатура
   * вызывающего кода не меняется.
   */
  async runInTransaction<T>(work: (tx: StorageTransaction) => Promise<T>): Promise<T> {
    // Вложенный вызов присоединяется к внешней транзакции, а не открывает свою:
    // иначе внутренняя половина работы попала бы на диск раньше внешней.
    const running = this.activeTransaction.getStore();

    if (running) {
      return work(this.transactionFacade());
    }

    const buffer = new Map<CollectionKey, unknown>();

    const result = await this.activeTransaction.run(buffer, () => work(this.transactionFacade()));

    await this.commit(buffer);

    return result;
  }

  /**
   * Явный доступ к транзакции для кода, который хочет читать и писать сам.
   * Просто переадресует в `read`/`write` — те уже знают про активный буфер.
   */
  private transactionFacade(): StorageTransaction {
    return {
      read: (key) => this.read(key),
      write: (key, data) => this.write(key, data),
    };
  }

  /** Хук для тестов: имитирует сбой записи на диск. */
  setWriteFailureHookForTests(hook: ((key: CollectionKey) => void) | null): void {
    this.writeFailureHook = hook;
  }

  /** Последовательная запись буфера с откатом уже записанного при сбое. */
  private async commit(buffer: Map<CollectionKey, unknown>): Promise<void> {
    if (buffer.size === 0) return;

    const keys = [...buffer.keys()];
    // Снимки «до» нужны для отката: читаем их перед первой записью.
    const previous = new Map<CollectionKey, unknown>();
    for (const key of keys) {
      previous.set(key, await this.read(key));
    }

    const written: CollectionKey[] = [];

    try {
      for (const key of keys) {
        await this.write(key, buffer.get(key) as never);
        written.push(key);
      }
    } catch (error) {
      // Откатываем в обратном порядке, хук сбоя на время отката снимаем —
      // иначе он уронит и сам откат.
      const hook = this.writeFailureHook;
      this.writeFailureHook = null;
      try {
        for (const key of [...written].reverse()) {
          await this.write(key, previous.get(key) as never);
        }
      } catch (rollbackError) {
        console.error('Откат транзакции не удался, данные могут быть несогласованы', rollbackError);
      } finally {
        this.writeFailureHook = hook;
      }

      throw error;
    }
  }

  private filePath(key: CollectionKey): string {
    return path.join(this.dataDirectory, DATA_FILES[key]);
  }
}
