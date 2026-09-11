// Каталог поверх базы: связи тренер↔клуб, услуги и уведомления.
//
// Устройство — как у справочников и публикаций: клиент берётся у
// `PrismaTransactionRunner` при каждом запросе, значения на границе переводятся
// мапперами из `../prisma-mappers`. Своего здесь три вещи:
//
// 1. **Порядок выдачи ушёл в запрос.** Файловая реализация читала коллекцию целиком
//    и сортировала её в памяти общим компаратором `compareByCreatedAtDesc`. В базе
//    это `ORDER BY`, иначе постраничность ленты уведомлений режет неотсортированное:
//    вторая страница отдала бы то, что уже было на первой. Тай-брейкер по номеру
//    обязателен — `ORDER BY created_at DESC` неустойчив, и при равных метках времени
//    (а вставка внутри одной транзакции даёт им ОДНУ метку) база вправе вернуть
//    строки в любом порядке.
// 2. **«Основная услуга» выбирается явным порядком.** В файле это была первая
//    записанная; в базе без `ORDER BY` первой окажется та, которую вернул диск, —
//    то есть после любой правки строки карточка клуба показала бы другую цену.
// 3. **Владелец услуги — пара взаимоисключающих колонок** (см. `./owner-columns.ts`).

import { Injectable } from '@nestjs/common';
import { notificationTypesOfGroup } from '@sporthub/domain';
import type { NotificationAddresseeKind } from '@sporthub/domain';
import type {
  CatalogOwnerType,
  EntityId,
  NewNotification,
  Notification,
  NotificationType,
  Offering,
  OfferingFormat,
  TrainerClubLink,
  TrainerClubLinkStatus,
} from '@sporthub/types';

import type { Prisma } from '../../storage/prisma-client/client';
import type { DatabaseClient } from '../../storage/prisma-transaction';
import { PrismaTransactionRunner } from '../../storage/prisma-transaction';
import type {
  NotificationMailbox,
  NotificationsAudience,
  NotificationsCountFilter,
  NotificationsFilter,
  NotificationsRepository,
  NotificationsScope,
  OfferingsRepository,
  TrainerClubLinksRepository,
} from '../catalog.repository';
import {
  fromOptionalIsoString,
  omitNulls,
  toIsoString,
  toOptionalIsoString,
} from '../prisma-mappers';
import { fromOwnerRef, toOwnerRef } from './owner-columns';
import { copyErasable, copyPresent, hasKey } from './patch';
import { isUniqueViolation } from './unique-violation';
import { ConflictError } from '../../common/domain-error';

/**
 * «Свежие первыми» одним выражением на все три домена.
 *
 * Второе поле — не украшение: без него порядок при равных метках времени зависит
 * от того, как база сложила строки, и тест на сортировку начинает мигать.
 */
const NEWEST_FIRST = [{ createdAt: 'desc' as const }, { id: 'desc' as const }];

// --- Связи тренер↔клуб --------------------------------------------------------

type TrainerClubLinkRow = Prisma.TrainerClubLinkModel;

/**
 * Связь в том виде, в котором её хранит база.
 *
 * `initiatedByUserId` есть в данных и в схеме, но в типе `TrainerClubLink` его пока
 * нет. Терять сведения при переносе нельзя, поэтому поле возится сверх типа —
 * ровно так же, как его возит файловое хранилище, которое просто не трогает
 * незнакомые ключи.
 */
type StoredTrainerClubLink = TrainerClubLink & { initiatedByUserId?: EntityId };

const LINK_PLAIN_FIELDS = [
  'trainerId',
  'clubId',
  'status',
  'initiatedBy',
] as const satisfies readonly (keyof StoredTrainerClubLink)[];

const LINK_ERASABLE_FIELDS = [
  'initiatedByUserId',
  'approvedByUserId',
  'rejectedByUserId',
  'rejectionReason',
  'revokedByUserId',
  'revokedBy',
] as const satisfies readonly (keyof StoredTrainerClubLink)[];

/** Метки времени связи: в контракте строки, в базе — колонки типа метки времени. */
const LINK_TIMESTAMP_FIELDS = [
  'approvedAt',
  'rejectedAt',
  'revokedAt',
] as const satisfies readonly (keyof StoredTrainerClubLink)[];

@Injectable()
export class PrismaTrainerClubLinksRepository implements TrainerClubLinksRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toLink(row: TrainerClubLinkRow): TrainerClubLink {
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      trainerId: row.trainerId,
      clubId: row.clubId,
      status: row.status as TrainerClubLinkStatus,
      initiatedBy: row.initiatedBy as TrainerClubLink['initiatedBy'],
      initiatedByUserId: row.initiatedByUserId ?? undefined,
      approvedAt: toOptionalIsoString(row.approvedAt),
      approvedByUserId: row.approvedByUserId ?? undefined,
      rejectedAt: toOptionalIsoString(row.rejectedAt),
      rejectedByUserId: row.rejectedByUserId ?? undefined,
      rejectionReason: row.rejectionReason ?? undefined,
      revokedAt: toOptionalIsoString(row.revokedAt),
      revokedByUserId: row.revokedByUserId ?? undefined,
      revokedBy: (row.revokedBy ?? undefined) as TrainerClubLink['revokedBy'],
    }) satisfies StoredTrainerClubLink;
  }

  async findMany(
    filter: { trainerId?: EntityId; clubId?: EntityId; status?: TrainerClubLinkStatus } = {},
  ): Promise<TrainerClubLink[]> {
    const rows = await this.client.trainerClubLink.findMany({
      // Отсутствующие в фильтре поля дают `undefined`, а его Prisma опускает —
      // отдельных ветвей «фильтр задан / не задан» не нужно.
      where: {
        trainerId: filter.trainerId,
        clubId: filter.clubId,
        status: filter.status,
      },
      orderBy: NEWEST_FIRST,
    });

    return rows.map((row) => PrismaTrainerClubLinksRepository.toLink(row));
  }

  async findById(id: EntityId): Promise<TrainerClubLink | null> {
    const row = await this.client.trainerClubLink.findUnique({ where: { id } });

    return row === null ? null : PrismaTrainerClubLinksRepository.toLink(row);
  }

  async insert(link: Omit<TrainerClubLink, 'id' | 'createdAt'>): Promise<TrainerClubLink> {
    try {
      return await this.insertInner(link);
    } catch (error) {
      // Вторую действующую связь на ту же пару отбивает частичный уникальный индекс,
      // а не проверка перед вставкой: та проходила при одновременных запросах.
      if (isUniqueViolation(error)) {
        throw new ConflictError('Для этой пары уже существует активная связь');
      }

      throw error;
    }
  }

  private async insertInner(
    link: Omit<TrainerClubLink, 'id' | 'createdAt'>,
  ): Promise<TrainerClubLink> {
    const stored = link as Omit<StoredTrainerClubLink, 'id' | 'createdAt'>;

    const created = await this.client.trainerClubLink.create({
      data: {
        trainerId: stored.trainerId,
        clubId: stored.clubId,
        status: stored.status,
        initiatedBy: stored.initiatedBy,
        initiatedByUserId: stored.initiatedByUserId,
        approvedAt: fromOptionalIsoString(stored.approvedAt),
        approvedByUserId: stored.approvedByUserId,
        rejectedAt: fromOptionalIsoString(stored.rejectedAt),
        rejectedByUserId: stored.rejectedByUserId,
        rejectionReason: stored.rejectionReason,
        revokedAt: fromOptionalIsoString(stored.revokedAt),
        revokedByUserId: stored.revokedByUserId,
        revokedBy: stored.revokedBy,
      },
    });

    return PrismaTrainerClubLinksRepository.toLink(created);
  }

  async update(id: EntityId, patch: Partial<TrainerClubLink>): Promise<TrainerClubLink> {
    const current = await this.client.trainerClubLink.findUnique({ where: { id } });

    if (current === null) {
      // Текст с символом «↔» перенесён из db.ts дословно — на него завязан тест.
      throw new Error('Привязка тренер↔клуб не найдена');
    }

    const stored = patch as Partial<StoredTrainerClubLink>;
    const data: Record<string, unknown> = {};

    copyPresent(stored, LINK_PLAIN_FIELDS, data);
    copyErasable(stored, LINK_ERASABLE_FIELDS, data);

    for (const field of LINK_TIMESTAMP_FIELDS) {
      if (!hasKey(stored, field)) continue;

      data[field] = fromOptionalIsoString(stored[field]) ?? null;
    }

    const updated = await this.client.trainerClubLink.update({
      where: { id },
      data: data as Prisma.TrainerClubLinkUncheckedUpdateInput,
    });

    return PrismaTrainerClubLinksRepository.toLink(updated);
  }
}

/** Строка метки времени → значение колонки. Отсутствие остаётся отсутствием. */

// --- Услуги -------------------------------------------------------------------

type OfferingRow = Prisma.OfferingModel;

const OFFERING_PLAIN_FIELDS = [
  'sportId',
  'title',
  'description',
  'format',
  'price',
  'durationMinutes',
  'capacity',
  'address',
] as const satisfies readonly (keyof Offering)[];

const OFFERING_ERASABLE_FIELDS = [
  'trainerClubLinkId',
  'cancellationPolicy',
] as const satisfies readonly (keyof Offering)[];

@Injectable()
export class PrismaOfferingsRepository implements OfferingsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toOffering(row: OfferingRow): Offering {
    const owner = toOwnerRef(row);

    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      trainerClubLinkId: row.trainerClubLinkId ?? undefined,
      cancellationPolicy: (row.cancellationPolicy ?? undefined) as Offering['cancellationPolicy'],
      sportId: row.sportId,
      title: row.title,
      description: row.description,
      format: row.format as OfferingFormat,
      price: row.price,
      durationMinutes: row.durationMinutes,
      capacity: row.capacity,
      address: row.address,
      coordinates: { lat: row.latitude, lng: row.longitude },
    });
  }

  async findAll(): Promise<Offering[]> {
    const rows = await this.client.offering.findMany({ orderBy: { id: 'asc' } });

    return rows.map((row) => PrismaOfferingsRepository.toOffering(row));
  }

  async findById(id: EntityId): Promise<Offering | null> {
    const row = await this.client.offering.findUnique({ where: { id } });

    return row === null ? null : PrismaOfferingsRepository.toOffering(row);
  }

  async findMany(filter: { ownerType: CatalogOwnerType; ownerId: EntityId }): Promise<Offering[]> {
    const rows = await this.client.offering.findMany({
      where: ownerWhere(filter),
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaOfferingsRepository.toOffering(row));
  }

  async findFirst(filter: {
    ownerType: CatalogOwnerType;
    ownerId: EntityId;
  }): Promise<Offering | null> {
    // «Основная услуга» = первая заведённая. Порядок задаётся явно и берётся одна
    // строка: без `ORDER BY` база вправе вернуть любую, и карточка владельца
    // показывала бы разную цену от правки к правке.
    const row = await this.client.offering.findFirst({
      where: ownerWhere(filter),
      orderBy: { id: 'asc' },
    });

    return row === null ? null : PrismaOfferingsRepository.toOffering(row);
  }

  async findByLinkId(trainerClubLinkId: EntityId): Promise<Offering[]> {
    const rows = await this.client.offering.findMany({
      where: { trainerClubLinkId },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaOfferingsRepository.toOffering(row));
  }

  async insert(offering: Omit<Offering, 'id' | 'createdAt'>): Promise<Offering> {
    const created = await this.client.offering.create({
      data: {
        ...fromOwnerRef(offering.ownerType, offering.ownerId),
        trainerClubLinkId: offering.trainerClubLinkId,
        cancellationPolicy: offering.cancellationPolicy,
        sportId: offering.sportId,
        title: offering.title,
        description: offering.description,
        format: offering.format,
        price: offering.price,
        durationMinutes: offering.durationMinutes,
        capacity: offering.capacity,
        address: offering.address,
        latitude: offering.coordinates.lat,
        longitude: offering.coordinates.lng,
      },
    });

    return PrismaOfferingsRepository.toOffering(created);
  }

  async update(id: EntityId, patch: Partial<Offering>): Promise<Offering> {
    const current = await this.client.offering.findUnique({ where: { id } });

    if (current === null) {
      throw new Error(`Услуга с id ${id} не найдена`);
    }

    const updated = await this.client.offering.update({
      where: { id },
      data: buildOfferingPatch(current, patch),
    });

    return PrismaOfferingsRepository.toOffering(updated);
  }

  async updateMany(ids: EntityId[], patch: Partial<Offering>): Promise<number> {
    if (ids.length === 0) return 0;

    // Владелец здесь не правится: массовая правка используется для отвязки услуг
    // от разорванной связи, а смена владельца пачкой сменила бы его всем строкам
    // разом — включая те, у которых он был другим. Поэтому текущая строка не читается.
    const { count } = await this.client.offering.updateMany({
      where: { id: { in: ids } },
      data: buildOfferingPatch(null, patch),
    });

    return count;
  }

  async removeMany(ids: EntityId[]): Promise<number> {
    if (ids.length === 0) return 0;

    const { count } = await this.client.offering.deleteMany({ where: { id: { in: ids } } });

    return count;
  }
}

/** Условие отбора по владельцу: одна из двух колонок, а не поле `ownerType`. */
function ownerWhere(filter: { ownerType: CatalogOwnerType; ownerId: EntityId }): {
  ownerClubId?: number | null;
  ownerTrainerId?: number | null;
} {
  return filter.ownerType === 'club'
    ? { ownerClubId: filter.ownerId }
    : { ownerTrainerId: filter.ownerId };
}

/**
 * Скалярная часть правки услуги.
 *
 * `current` пуст у массовой правки: там строк много и «текущего владельца» у них
 * нет одного на всех. Смена владельца в этом случае требует полной пары полей.
 */
function buildOfferingPatch(
  current: OfferingRow | null,
  patch: Partial<Offering>,
): Prisma.OfferingUncheckedUpdateManyInput {
  const data: Record<string, unknown> = {};

  copyPresent(patch, OFFERING_PLAIN_FIELDS, data);
  copyErasable(patch, OFFERING_ERASABLE_FIELDS, data);

  if (hasKey(patch, 'coordinates') && patch.coordinates !== undefined) {
    data.latitude = patch.coordinates.lat;
    data.longitude = patch.coordinates.lng;
  }

  if (hasKey(patch, 'ownerType') || hasKey(patch, 'ownerId')) {
    const currentOwner = current === null ? null : toOwnerRef(current);
    const ownerType = patch.ownerType ?? currentOwner?.ownerType;
    const ownerId = patch.ownerId ?? currentOwner?.ownerId;

    if (ownerType === undefined || ownerId === undefined) {
      throw new Error('Смена владельца услуги требует и типа владельца, и его номера');
    }

    Object.assign(data, fromOwnerRef(ownerType, ownerId));
  }

  return data as Prisma.OfferingUncheckedUpdateManyInput;
}

// --- Уведомления --------------------------------------------------------------

type NotificationRow = Prisma.NotificationModel;

@Injectable()
export class PrismaNotificationsRepository implements NotificationsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toNotification(row: NotificationRow): Notification {
    const common = {
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      type: row.type as NotificationType,
      // Колонка объявлена как JSON, значит содержимое приходит уже разобранным.
      payload: (row.payload ?? {}) as Record<string, unknown>,
      readAt: toOptionalIsoString(row.readAt),
    };

    // ⚠️ Ветвление по виду адресата, а не по наличию владельца (шаг 37.11).
    // Контракт — размеченный union: у строки очереди надзора поля владельца нет
    // вовсе, и читатель обязан сузить тип, прежде чем его взять. Проверка
    // «если владелец пуст» дала бы тот же результат и оставила бы вид адресата
    // выводимым — ровно то, от чего уходит фаза.
    if (row.addresseeKind === 'supervision') {
      return omitNulls({
        ...common,
        addresseeKind: 'supervision' as const,
        readByUserId: row.readByUserId ?? undefined,
      });
    }

    if (row.userId === null) {
      // Форму держит база (`notifications_addressee_shape`), и сюда попасть можно
      // только если ограничение сняли. Тогда лучше громкий отказ, чем строка
      // с подставленным нулём, то есть чужая личная.
      throw new Error(`Уведомление ${row.id} без владельца при виде адресата ${row.addresseeKind}`);
    }

    return omitNulls({
      ...common,
      addresseeKind: row.addresseeKind as 'personal' | CatalogOwnerType,
      userId: row.userId,
      ...PrismaNotificationsRepository.toAddressee(row),
    });
  }

  /**
   * Колонки лица → пара полей контракта.
   *
   * Обе пусты — уведомление адресовано человеку, и полей в ответе просто нет:
   * старый клиент, ничего про адресата не знающий, видит прежнюю форму.
   */
  private static toAddressee(
    row: Pick<NotificationRow, 'addresseeClubId' | 'addresseeTrainerId'>,
  ): { addresseeType?: CatalogOwnerType; addresseeId?: EntityId } {
    if (row.addresseeClubId !== null) {
      return { addresseeType: 'club', addresseeId: row.addresseeClubId };
    }

    if (row.addresseeTrainerId !== null) {
      return { addresseeType: 'trainer', addresseeId: row.addresseeTrainerId };
    }

    return {};
  }

  /**
   * Пара полей контракта → колонки лица.
   *
   * Один строитель на запись и на отбор: разъехавшись, они отдали бы ящик клуба
   * не тому лицу — молча и с кодом 200.
   */
  private static addresseeColumns(notification: NewNotification): {
    addresseeKind: NotificationAddresseeKind;
    userId: number | null;
    addresseeClubId: number | null;
    addresseeTrainerId: number | null;
  } {
    // Очередь надзора: владельца-человека нет, колонок лица нет. Форму держит база
    // (`notifications_addressee_shape`), здесь она просто не собирается неверно.
    if (notification.addresseeKind === 'supervision') {
      return {
        addresseeKind: 'supervision',
        userId: null,
        addresseeClubId: null,
        addresseeTrainerId: null,
      };
    }

    if (notification.addresseeKind === 'personal') {
      return {
        addresseeKind: 'personal',
        userId: notification.userId,
        addresseeClubId: null,
        addresseeTrainerId: null,
      };
    }

    // Ящик лица: номер лица обязателен, иначе строка не описывает ящик вовсе.
    const addresseeId = notification.addresseeId;

    if (addresseeId === undefined) {
      throw new Error(`Уведомление ящику ${notification.addresseeKind} без номера лица`);
    }

    return notification.addresseeKind === 'club'
      ? {
          addresseeKind: 'club',
          userId: notification.userId,
          addresseeClubId: addresseeId,
          addresseeTrainerId: null,
        }
      : {
          addresseeKind: 'trainer',
          userId: notification.userId,
          addresseeClubId: null,
          addresseeTrainerId: addresseeId,
        };
  }

  /**
   * Условие ящика: чей именно.
   *
   * Личный ящик — это ОТСУТСТВИЕ лица, а не «моё вообще»: под него заведён
   * отдельный частичный индекс, потому что у владельца восемнадцати клубов
   * его номер стоит почти в каждой строке.
   *
   * ⚠️ Шаг 37.9: отбор идёт по НАЗВАННОМУ виду адресата, а не по пустоте колонок.
   * Прежняя формулировка («обе колонки лица пусты») описывала личный ящик косвенно
   * и с появлением очереди надзора описывать его перестала: у очереди колонок лица
   * тоже нет. Разойтись с предикатом частичного индекса теперь негде — там записано
   * то же самое слово.
   */
  private static mailboxWhere(mailbox: NotificationMailbox): Prisma.NotificationWhereInput {
    if (mailbox.kind === 'personal') {
      return { addresseeKind: 'personal' };
    }

    return mailbox.kind === 'club'
      ? { addresseeKind: 'club', addresseeClubId: mailbox.id }
      : { addresseeKind: 'trainer', addresseeTrainerId: mailbox.id };
  }

  /**
   * Условие ленты — одно на выдачу и на счётчик, чтобы они не разошлись.
   *
   * Отключённые типы приходят готовым списком и становятся `NOT IN`. Раньше этот
   * отбор стоял ПОСЛЕ чтения ленты целиком, и из-за него постраничность с счётчиком
   * тоже не могли уехать в запрос: срез по уже отфильтрованному в памяти набору
   * невозможно выразить `LIMIT`ом. Пустой список отключённых типов условия не даёт.
   */
  private static where(
    filter: NotificationsFilter | NotificationsCountFilter,
  ): Prisma.NotificationWhereInput {
    return {
      ...PrismaNotificationsRepository.audienceWhere(filter),
      readAt: filter.unreadOnly === true ? null : undefined,
      // Тема ленты — условие ЗАПРОСА, а не отбор выданной страницы (шаг 37.18).
      // Отбор в памяти был бы честен ровно до потолка выдачи, то есть до 101-й строки.
      type: filter.group === undefined ? undefined : { in: notificationTypesOfGroup(filter.group) },
      // Пустой список `ids` означает «ни одного», и `IN ()` даёт ровно это.
      id: filter.ids === undefined ? undefined : { in: filter.ids },
    };
  }

  /**
   * Условие адресата: кого читаем.
   *
   * ⚠️ Ветвление ОБЯЗАТЕЛЬНО, и его нельзя свести к `userId: filter.userId`.
   * В Prisma `undefined` — это отсутствие условия: у очереди надзора владельца нет,
   * и прежняя форма отдала бы ей всю таблицу целиком. Тип не даёт собрать отбор
   * без адресата, а эта функция не даёт потерять его при сборке запроса.
   */
  private static audienceWhere(audience: NotificationsAudience): Prisma.NotificationWhereInput {
    if (audience.supervision === true) {
      return { addresseeKind: 'supervision' };
    }

    return {
      userId: audience.userId,
      ...(audience.mailbox === undefined
        ? {}
        : PrismaNotificationsRepository.mailboxWhere(audience.mailbox)),
    };
  }

  async findMany(filter: NotificationsFilter): Promise<Notification[]> {
    const rows = await this.client.notification.findMany({
      where: PrismaNotificationsRepository.where(filter),
      orderBy: NEWEST_FIRST,
      // Постраничность — в запросе: читать всю ленту, чтобы отдать две строки,
      // хранилище не обязано и не будет.
      skip: filter.offset,
      take: filter.limit,
    });

    return rows.map((row) => PrismaNotificationsRepository.toNotification(row));
  }

  count(filter: NotificationsCountFilter): Promise<number> {
    return this.client.notification.count({
      where: PrismaNotificationsRepository.where(filter),
    });
  }

  async insert(notification: NewNotification): Promise<Notification> {
    const created = await this.client.notification.create({
      data: {
        // Владелец и колонки лица собираются ОДНИМ строителем по виду адресата:
        // разъехавшись, они отдали бы ящик не тому лицу — молча и с кодом 200.
        ...PrismaNotificationsRepository.addresseeColumns(notification),
        type: notification.type,
        payload: (notification.payload ?? {}) as Prisma.InputJsonValue,
        readAt: fromOptionalIsoString(notification.readAt),
      },
    });

    return PrismaNotificationsRepository.toNotification(created);
  }

  async markRead(id: EntityId, readByUserId: number): Promise<Notification> {
    const current = await this.client.notification.findUnique({ where: { id } });

    if (current === null) {
      throw new Error('Уведомление не найдено');
    }

    // ⚠️ Условная запись ОДНИМ запросом (шаг 37.17). Прежде здесь стояли
    // `findUnique` и безусловный `update` вне транзакции: второй клик переписывал
    // и время, и подпись, и занявшимся оказывался нажавший последним. `updateMany`
    // с условием «ещё не разобрано» проверяет и пишет в один приём — гонке
    // негде поместиться.
    const { count } = await this.client.notification.updateMany({
      where: { id, readAt: null },
      data: { readAt: new Date(), readByUserId },
    });

    // ⚠️ Ноль затронутых строк — это «уже разобрано», и это НЕ ошибка: повторный
    // клик по своей прочитанной строке — обычное дело. Важно другое: подпись
    // и время НЕ перезаписываются, иначе занявшимся в общей очереди оказывался бы
    // нажавший последним. Возвращается текущее состояние, каким бы оно ни было.
    void count;

    const updated = await this.client.notification.findUniqueOrThrow({ where: { id } });

    return PrismaNotificationsRepository.toNotification(updated);
  }

  async markAllRead(scope: NotificationsScope, readByUserId: number): Promise<number> {
    // Одним запросом: чтение ленты целиком ради пометки прочитанным дало бы
    // столько же работы, сколько её отрисовка, и разъехалось бы при гонке.
    //
    // Условие ящика — тот же строитель, что и у выдачи: «прочитать всё» обязано
    // гасить ровно то, что человек видит перед собой, и ни строкой больше.
    const { count } = await this.client.notification.updateMany({
      where: {
        ...PrismaNotificationsRepository.audienceWhere(scope),
        readAt: null,
      },
      data: {
        readAt: new Date(),
        // Подпись ставится и при массовой отметке: в общей очереди «разобрал
        // кто-то» — половина ответа. У человеческого ящика она остаётся пустой.
        readByUserId: scope.supervision === true ? readByUserId : null,
      },
    });

    return count;
  }

  async removeMany(ids: EntityId[]): Promise<number> {
    if (ids.length === 0) return 0;

    const { count } = await this.client.notification.deleteMany({ where: { id: { in: ids } } });

    return count;
  }
}
