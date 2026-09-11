// Репозитории связей тренер↔клуб, услуг и уведомлений.
// Границу «репозиторий против сервиса» держим строго: сюда попадает только то,
// что фильтрует по полям своей же коллекции. Всё, что требует данных другого
// домена (например `applyPreferences` у уведомлений читает настройки
// пользователя), остаётся сервисным — иначе в фазе базы такой фильтр не станет
// обычным `where` и слой протечёт.

import type { NotificationGroupKey } from '@sporthub/domain';
import type {
  CatalogOwnerType,
  NewNotification,
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
 * КОГО читаем. Третьего состояния «никого» здесь нет — и это главное свойство типа.
 *
 * ⚠️ Зачем union, а не пара необязательных полей (шаг 37.14). До фазы 37 `userId`
 * был необязательным, и «отбор без адресата» выражался пустым объектом. В Prisma
 * `undefined` — это ОТСУТСТВИЕ УСЛОВИЯ, поэтому `markAllRead({})` означало
 * «погасить ленту всей площадки», и отвечало на это 200. Комментарий рядом
 * предупреждал, что так делать не надо; тип — не предупреждает, а не даёт.
 *
 * Варианта два: человек (со своим ящиком или объединённым срезом) и общая очередь
 * надзора, у которой человека нет вовсе. Поля `never` делают union исключающим:
 * смешать очередь с владельцем нельзя даже случайно.
 */
export type NotificationsAudience =
  | {
      userId: number;
      /**
       * Ящик, который читаем. Без него выдача идёт по `userId` — это объединённый
       * ящик человека: и его личные уведомления, и уведомления всех его лиц.
       *
       * ⚠️ Ящик лица определяется КОЛОНКОЙ ЛИЦА, а не владельцем: «прочитать всё»
       * в ящике одного клуба не имеет права погасить ящики остальных лиц человека.
       */
      mailbox?: NotificationMailbox;
      supervision?: never;
    }
  | {
      /** Общая очередь надзора: одна на всех администраторов, владельца нет. */
      supervision: true;
      userId?: never;
      mailbox?: never;
    };

/**
 * Отбор ленты уведомлений.
 *
 * ⚠️ Шаг 36.50. Поля `excludeTypes` здесь БОЛЬШЕ НЕТ. Оно переводило настройки
 * человека в условие запроса — и этот перевод повторяли трое читателей, расходясь
 * втроём. Теперь настройка решает при ОТПРАВКЕ (`NotificationService.notify`):
 * выключенного типа в базе нет, и прятать при чтении нечего.
 */
export type NotificationsFilter = NotificationsAudience & {
  /**
   * Состояние строки: `false` — не разобрано, `true` — разобрано, не задано — всё.
   *
   * ⚠️ ОДНО поле на три состояния, а не пара булевых флагов (шаг 37.19). Пара
   * `unreadOnly` + `readOnly` умеет сказать «и то и другое сразу» — противоречие,
   * которое пришлось бы ловить проверкой в каждом читателе. Здесь его нельзя
   * даже выразить.
   *
   * ⚠️ В надзорной очереди `read_at` означает «этим ЗАНЯЛИСЬ», а не «на это
   * посмотрели»: у общей очереди прочтение и разбор — одно событие.
   */
  read?: boolean;
  /**
   * Тема ленты — отбор УХОДИТ В ЗАПРОС (шаг 37.18).
   *
   * В человеческой ленте он до сих пор делался в памяти поверх выданной страницы
   * с потолком в 100 строк: для личного ящика это сходило с рук, для общей очереди
   * означало бы «честно ровно до 101-й строки».
   */
  group?: NotificationGroupKey;
  /** Отобрать только эти уведомления. Пустой список означает «ни одного». */
  ids?: number[];
  offset?: number;
  limit?: number;
};

/**
 * Отбор для счётчика: та же лента без постраничности — резать счётчику нечего.
 *
 * Адресат обязателен: счётчик по всей платформе не нужен никому и был бы запросом
 * без границ. Обязательность держит `NotificationsAudience`, а не отдельное поле.
 *
 * ⚠️ `Omit` применяется к каждому варианту union'а отдельно: по union он
 * не распределяется и схлопнул бы варианты в один объект — вместе с различением
 * пропал бы и весь смысл.
 */
export type NotificationsCountFilter = NotificationsAudience & {
  read?: boolean;
  group?: NotificationGroupKey;
  ids?: number[];
};

/**
 * Область массовой пометки прочитанным: чей ящик гасим.
 *
 * Владелец обязателен всегда, ящик лица — по желанию. Ни типов, ни номеров:
 * «прочитать всё» — это про ящик целиком, и сузить его чем-то ещё значило бы
 * оставить в нём непрочитанное, показав ноль.
 */
export type NotificationsScope = NotificationsAudience;

export interface NotificationsRepository {
  findMany(filter: NotificationsFilter): Promise<Notification[]>;
  count(filter: NotificationsCountFilter): Promise<number>;
  insert(notification: NewNotification): Promise<Notification>;
  /**
   * Отметить строку разобранной.
   *
   * ⚠️ `readByUserId` обязателен (шаг 37.17): в общей очереди `read_at` говорит
   * «кто-то занялся» и не говорит кто, а это половина ответа. В личном ящике
   * разбирающий и владелец — один человек, и подпись там не хранится.
   *
   * ⚠️ Разбор ставится ОДИН раз и не перезаписывается: повторная отметка возвращает
   * строку как есть. Иначе занявшимся в общей очереди оказывался бы нажавший
   * последним, а не тот, кто взял дело.
   */
  markRead(id: number, readByUserId: number): Promise<Notification>;
  /**
   * Вернуть строку в очередь: снять разбор и подпись.
   *
   * ⚠️ Без этого очередь очередью не является (шаг 37.48). Ошибочная отметка
   * в общей очереди необратима для ВСЕЙ команды: строка исчезает из «не разобрано»
   * у всех сразу, и вернуть её было нечем — снятия `read_at` не существовало
   * ни в репозитории, ни в маршрутах.
   */
  markUnread(id: number): Promise<Notification>;
  /**
   * Пометить прочитанными весь ящик разом.
   *
   * Область действия обязательна: без неё кнопка «прочитать всё» в ящике одного
   * клуба гасила бы ящики всех остальных лиц человека — массово, необратимо
   * и в один клик.
   */
  markAllRead(scope: NotificationsScope, readByUserId: number): Promise<number>;
  removeMany(ids: number[]): Promise<number>;
}
