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

/**
 * Ящик уведомлений: чей именно.
 *
 * Три формы, и каждая отвечает на свой вопрос: `personal` — только личные
 * уведомления человека (обе колонки лица пусты), `club`/`trainer` — ящик
 * одного лица. Отсутствие ящика в отборе означает объединённый срез по `userId`.
 *
 * Вид лица назван тем же словарём `CatalogOwnerType`, что и владелец услуги,
 * расписания и записи: третий вид лица — строка в словаре и колонка, а не
 * ревизия всех запросов.
 */
export type NotificationMailbox = { kind: 'personal' } | { kind: CatalogOwnerType; id: number };

/**
 * Отбор ленты уведомлений. Все поля необязательные.
 *
 * ⚠️ `excludeTypes` — это перевод НАСТРОЕК пользователя в условие запроса, а не
 * знание репозитория о них. Настройки живут в другой таблице и разбираются правилом
 * домена (`isNotificationTypeEnabled`); маршрут читает пользователя, превращает
 * правило в список отключённых типов и отдаёт сюда уже готовый список. Так граница
 * «репозиторий фильтрует только по своим полям» остаётся целой, а отбор всё равно
 * становится `WHERE`, а не проверкой после чтения ленты целиком.
 */
export interface NotificationsFilter {
  userId?: number;
  /**
   * Ящик, который читаем. Без него выдача идёт по `userId` — это объединённый
   * ящик человека: и его личные уведомления, и уведомления всех его лиц.
   *
   * ⚠️ Ящик лица определяется КОЛОНКОЙ ЛИЦА, а не владельцем: «прочитать всё»
   * в ящике одного клуба не имеет права погасить ящики остальных лиц человека.
   */
  mailbox?: NotificationMailbox;
  unreadOnly?: boolean;
  /** Отобрать только эти уведомления. Пустой список означает «ни одного». */
  ids?: number[];
  /** Типы, которые пользователь отключил: в ленту они не попадают и не считаются. */
  excludeTypes?: string[];
  offset?: number;
  limit?: number;
}

/**
 * Отбор для счётчика: та же лента без постраничности — резать счётчику нечего.
 * Адресат обязателен: счётчик по всей платформе не нужен никому и был бы запросом
 * без границ.
 */
export type NotificationsCountFilter = Omit<NotificationsFilter, 'offset' | 'limit'> & {
  userId: number;
};

/**
 * Область массовой пометки прочитанным: чей ящик гасим.
 *
 * Владелец обязателен всегда, ящик лица — по желанию. Ни типов, ни номеров:
 * «прочитать всё» — это про ящик целиком, и сузить его чем-то ещё значило бы
 * оставить в нём непрочитанное, показав ноль.
 */
export type NotificationsScope = Pick<NotificationsFilter, 'mailbox'> & { userId: number };

export interface NotificationsRepository {
  findMany(filter: NotificationsFilter): Promise<Notification[]>;
  count(filter: NotificationsCountFilter): Promise<number>;
  insert(notification: Omit<Notification, 'id' | 'createdAt'>): Promise<Notification>;
  markRead(id: number): Promise<Notification>;
  /**
   * Пометить прочитанными весь ящик разом.
   *
   * Область действия обязательна: без неё кнопка «прочитать всё» в ящике одного
   * клуба гасила бы ящики всех остальных лиц человека — массово, необратимо
   * и в один клик.
   */
  markAllRead(scope: NotificationsScope): Promise<number>;
  removeMany(ids: number[]): Promise<number>;
}
