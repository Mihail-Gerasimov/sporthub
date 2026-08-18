// Репозитории связей тренер↔клуб, услуг и уведомлений.
// Границу «репозиторий против сервиса» держим строго: сюда попадает только то,
// что фильтрует по полям своей же коллекции. Всё, что требует данных другого
// домена (например `applyPreferences` у уведомлений читает настройки
// пользователя), остаётся сервисным — иначе в фазе базы такой фильтр не станет
// обычным `where` и слой протечёт.

import type {
  CatalogOwnerType,
  Notification,
  Offering,
  TrainerClubLink,
  TrainerClubLinkStatus,
} from '@sporthub/types';

import type { JsonStorage } from '../storage/json-storage';

/**
 * Сортировка «свежие первыми». При равных метках времени (две записи в одну
 * миллисекунду — обычное дело при пакетной вставке) сравниваем по id: он растёт
 * монотонно, поэтому порядок становится детерминированным. Без этого сравнения
 * результат зависел бы от порядка вставки и тест на сортировку мигал бы.
 */
function compareByCreatedAtDesc<TItem extends { id: number; createdAt: string }>(
  left: TItem,
  right: TItem,
): number {
  const byDate = right.createdAt.localeCompare(left.createdAt);

  return byDate !== 0 ? byDate : right.id - left.id;
}

// --- Токены внедрения ---------------------------------------------------------

export const TRAINER_CLUB_LINKS_REPOSITORY = Symbol('TRAINER_CLUB_LINKS_REPOSITORY');
export const OFFERINGS_REPOSITORY = Symbol('OFFERINGS_REPOSITORY');
export const NOTIFICATIONS_REPOSITORY = Symbol('NOTIFICATIONS_REPOSITORY');

// --- Интерфейсы ---------------------------------------------------------------

export interface TrainerClubLinksRepository {
  findMany(filter?: {
    trainerId?: number;
    clubId?: number;
    status?: TrainerClubLinkStatus;
  }): Promise<TrainerClubLink[]>;
  findById(id: number): Promise<TrainerClubLink | null>;
  insert(link: Omit<TrainerClubLink, 'id' | 'createdAt'>): Promise<TrainerClubLink>;
  update(id: number, patch: Partial<TrainerClubLink>): Promise<TrainerClubLink>;
}

export interface OfferingsRepository {
  findAll(): Promise<Offering[]>;
  findById(id: number): Promise<Offering | null>;
  findMany(filter: { ownerType: CatalogOwnerType; ownerId: number }): Promise<Offering[]>;
  /** Первая услуга владельца — та, что в db.ts считается основной. */
  findFirst(filter: { ownerType: CatalogOwnerType; ownerId: number }): Promise<Offering | null>;
  findByLinkId(trainerClubLinkId: number): Promise<Offering[]>;
  insert(offering: Omit<Offering, 'id' | 'createdAt'>): Promise<Offering>;
  update(id: number, patch: Partial<Offering>): Promise<Offering>;
  /** Массовая правка — нужна при отвязке услуг от разорванной связи. */
  updateMany(ids: number[], patch: Partial<Offering>): Promise<number>;
  removeMany(ids: number[]): Promise<number>;
}

export interface NotificationsRepository {
  findMany(filter: {
    userId?: number;
    unreadOnly?: boolean;
    offset?: number;
    limit?: number;
  }): Promise<Notification[]>;
  count(filter: { userId: number; unreadOnly?: boolean }): Promise<number>;
  insert(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification>;
  markRead(id: number): Promise<Notification>;
  markAllRead(userId: number): Promise<number>;
  removeMany(ids: number[]): Promise<number>;
}

// --- Реализации ---------------------------------------------------------------

export class JsonTrainerClubLinksRepository implements TrainerClubLinksRepository {
  constructor(private readonly storage: JsonStorage) {}

  async findMany(
    filter: { trainerId?: number; clubId?: number; status?: TrainerClubLinkStatus } = {},
  ): Promise<TrainerClubLink[]> {
    const links = await this.storage.read('trainerClubLinks');

    return links
      .filter((link) => {
        if (filter.trainerId !== undefined && link.trainerId !== filter.trainerId) return false;
        if (filter.clubId !== undefined && link.clubId !== filter.clubId) return false;
        if (filter.status !== undefined && link.status !== filter.status) return false;

        return true;
      })
      .sort(compareByCreatedAtDesc);
  }

  async findById(id: number): Promise<TrainerClubLink | null> {
    const links = await this.storage.read('trainerClubLinks');

    return links.find((link) => link.id === id) ?? null;
  }

  async insert(link: Omit<TrainerClubLink, 'id' | 'createdAt'>): Promise<TrainerClubLink> {
    const links = await this.storage.read('trainerClubLinks');
    const created: TrainerClubLink = {
      id: this.storage.getNextEntityId(links),
      createdAt: new Date().toISOString(),
      ...link,
    };

    await this.storage.write('trainerClubLinks', [...links, created]);

    return created;
  }

  async update(id: number, patch: Partial<TrainerClubLink>): Promise<TrainerClubLink> {
    const links = await this.storage.read('trainerClubLinks');
    const index = links.findIndex((link) => link.id === id);

    if (index === -1) {
      // Текст с символом «↔» перенесён из db.ts дословно — на него завязан тест.
      throw new Error('Привязка тренер↔клуб не найдена');
    }

    const updated: TrainerClubLink = { ...links[index], ...patch };
    const next = [...links];
    next[index] = updated;
    await this.storage.write('trainerClubLinks', next);

    return updated;
  }
}

export class JsonOfferingsRepository implements OfferingsRepository {
  constructor(private readonly storage: JsonStorage) {}

  findAll(): Promise<Offering[]> {
    return this.storage.read('offerings');
  }

  async findById(id: number): Promise<Offering | null> {
    const offerings = await this.storage.read('offerings');

    return offerings.find((offering) => offering.id === id) ?? null;
  }

  async findMany(filter: { ownerType: CatalogOwnerType; ownerId: number }): Promise<Offering[]> {
    const offerings = await this.storage.read('offerings');

    return offerings.filter(
      (offering) =>
        offering.ownerType === filter.ownerType && offering.ownerId === filter.ownerId,
    );
  }

  async findFirst(filter: {
    ownerType: CatalogOwnerType;
    ownerId: number;
  }): Promise<Offering | null> {
    const found = await this.findMany(filter);

    return found[0] ?? null;
  }

  async findByLinkId(trainerClubLinkId: number): Promise<Offering[]> {
    const offerings = await this.storage.read('offerings');

    return offerings.filter((offering) => offering.trainerClubLinkId === trainerClubLinkId);
  }

  async insert(offering: Omit<Offering, 'id' | 'createdAt'>): Promise<Offering> {
    const offerings = await this.storage.read('offerings');
    const created: Offering = {
      id: this.storage.getNextEntityId(offerings),
      createdAt: new Date().toISOString(),
      ...offering,
    };

    await this.storage.write('offerings', [...offerings, created]);

    return created;
  }

  async update(id: number, patch: Partial<Offering>): Promise<Offering> {
    const offerings = await this.storage.read('offerings');
    const index = offerings.findIndex((offering) => offering.id === id);

    if (index === -1) {
      throw new Error(`Услуга с id ${id} не найдена`);
    }

    const updated: Offering = { ...offerings[index], ...patch };
    const next = [...offerings];
    next[index] = updated;
    await this.storage.write('offerings', next);

    return updated;
  }

  async updateMany(ids: number[], patch: Partial<Offering>): Promise<number> {
    if (ids.length === 0) return 0;

    const offerings = await this.storage.read('offerings');
    const target = new Set(ids);
    let updatedCount = 0;

    const next = offerings.map((offering) => {
      if (!target.has(offering.id)) return offering;
      updatedCount += 1;

      return { ...offering, ...patch };
    });

    if (updatedCount > 0) {
      await this.storage.write('offerings', next);
    }

    return updatedCount;
  }

  async removeMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;

    const offerings = await this.storage.read('offerings');
    const target = new Set(ids);
    const kept = offerings.filter((offering) => !target.has(offering.id));

    await this.storage.write('offerings', kept);

    return offerings.length - kept.length;
  }
}

export class JsonNotificationsRepository implements NotificationsRepository {
  constructor(private readonly storage: JsonStorage) {}

  async findMany(filter: {
    userId?: number;
    unreadOnly?: boolean;
    offset?: number;
    limit?: number;
  }): Promise<Notification[]> {
    const notifications = await this.storage.read('notifications');

    const filtered = notifications.filter((notification) => {
      if (filter.userId !== undefined && notification.userId !== filter.userId) return false;
      if (filter.unreadOnly === true && notification.readAt !== undefined) return false;

      return true;
    });

    // Свежие первыми — порядок зашит в реализацию, вызывающий код его не задаёт.
    const sorted = filtered.sort(compareByCreatedAtDesc);
    const offset = filter.offset ?? 0;

    return filter.limit === undefined
      ? sorted.slice(offset)
      : sorted.slice(offset, offset + filter.limit);
  }

  async count(filter: { userId: number; unreadOnly?: boolean }): Promise<number> {
    const notifications = await this.storage.read('notifications');

    return notifications.filter((notification) => {
      if (notification.userId !== filter.userId) return false;
      if (filter.unreadOnly === true && notification.readAt !== undefined) return false;

      return true;
    }).length;
  }

  async insert(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification> {
    const notifications = await this.storage.read('notifications');
    const created: Notification = {
      id: this.storage.getNextEntityId(notifications),
      createdAt: new Date().toISOString(),
      ...notification,
    };

    await this.storage.write('notifications', [...notifications, created]);

    return created;
  }

  async markRead(id: number): Promise<Notification> {
    const notifications = await this.storage.read('notifications');
    const index = notifications.findIndex((notification) => notification.id === id);

    if (index === -1) {
      throw new Error('Уведомление не найдено');
    }

    const updated: Notification = { ...notifications[index], readAt: new Date().toISOString() };
    const next = [...notifications];
    next[index] = updated;
    await this.storage.write('notifications', next);

    return updated;
  }

  async markAllRead(userId: number): Promise<number> {
    const notifications = await this.storage.read('notifications');
    const timestamp = new Date().toISOString();
    let updatedCount = 0;

    const next = notifications.map((notification) => {
      if (notification.userId === userId && notification.readAt === undefined) {
        updatedCount += 1;

        return { ...notification, readAt: timestamp };
      }

      return notification;
    });

    // Как в db.ts: пустая правка не трогает файл вовсе.
    if (updatedCount > 0) {
      await this.storage.write('notifications', next);
    }

    return updatedCount;
  }

  async removeMany(ids: number[]): Promise<number> {
    if (ids.length === 0) return 0;

    const notifications = await this.storage.read('notifications');
    const target = new Set(ids);
    const kept = notifications.filter((notification) => !target.has(notification.id));

    await this.storage.write('notifications', kept);

    return notifications.length - kept.length;
  }
}
