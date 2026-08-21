// Публикации поверх базы: клубы, тренеры и расписание.
//
// Устройство — как у справочников (`./dictionaries.repository.ts`): клиент берётся
// у `PrismaTransactionRunner` при КАЖДОМ запросе, порядок выдачи задан явно, значения
// на границе переводятся мапперами из `../prisma-mappers`. Здесь к этому добавляются
// четыре места, которых у справочников не было:
//
// 1. **Наборы ссылок стали связующими таблицами.** `sportIds`, `tagIds`, `amenityIds`,
//    `specialtyIds`, `workFormatIds` — это строки отдельных таблиц. Правка разбирается
//    на «добавить» и «убрать» (`syncIdLinks`), а не переписывается целиком.
//    ⚠️ Порядок в этих массивах теперь ПО НОМЕРУ: колонки позиции у связующих таблиц
//    нет (решение заказчика), и файловый порядок записи не воспроизводится. Это
//    согласованное изменение поведения, а не побочный эффект.
// 2. **Поиск по адресу-ссылке идёт по хранимой колонке `slugNormalized`.**
//    `normalizeSlugLookupValue` делает три операции — снятие URI-кодирования,
//    приведение NFC и нижний регистр с русской локалью, — и первые две в выражении
//    базы не воспроизводятся вовсе. Значит, приведение считает та же функция, что
//    и в файловой реализации, а колонка заполняется ею же при вставке и правке.
// 3. **Владелец слота — пара взаимоисключающих колонок плюс отдельная площадка.**
//    Сборка обратно в `ownerType`/`ownerId`/`clubId`/`trainerId` — в `./owner-columns.ts`.
// 4. **Дата и время слота — колонки типа даты и времени.** На границе они обязаны
//    снова стать строками `YYYY-MM-DD` и `HH:MM`.

import { Injectable } from '@nestjs/common';
import { getTrainerPrimarySportId } from '@sporthub/domain';
import type {
  CatalogOwnerType,
  Club,
  EntityId,
  EntitySource,
  EntityStatus,
  Schedule,
  SessionLevel,
  Trainer,
} from '@sporthub/types';

import type { DatabaseClient } from '../../storage/prisma-transaction';
import { PrismaTransactionRunner } from '../../storage/prisma-transaction';
import type { Prisma } from '../../storage/prisma-client/client';
import type {
  ClubsRepository,
  PublicationStatusFilter,
  ScheduleFilter,
  ScheduleRepository,
  TrainersRepository,
} from '../entities.repository';
import { normalizeSlugLookupValue } from '../entities.repository';
import {
  fromDateKey,
  fromTimeKey,
  omitNulls,
  toDateKey,
  toIsoString,
  toNullable,
  toOptionalIsoString,
  toTimeKey,
} from '../prisma-mappers';
import { fromOwnerRef, ownerTypeWhere, toOwnerRef } from './owner-columns';
import { copyErasable, copyPresent, hasKey, idsOf, syncIdLinks } from './patch';
import { ConflictError } from '../../common/domain-error';
import { isUniqueViolation } from './unique-violation';

// --- Клубы --------------------------------------------------------------------

/**
 * Что подтягивается вместе с клубом.
 *
 * Порядок строк связующих таблиц задан явно и здесь: без него база вправе вернуть
 * их в любом порядке, и набор видов спорта у карточки менялся бы сам после каждой
 * правки строки. Кадры галереи упорядочены своей колонкой позиции — она у них есть,
 * в отличие от связующих таблиц.
 */
const CLUB_INCLUDE = {
  sports: { select: { sportId: true }, orderBy: { sportId: 'asc' } },
  tags: { select: { tagId: true }, orderBy: { tagId: 'asc' } },
  amenities: { select: { amenityId: true }, orderBy: { amenityId: 'asc' } },
  images: { select: { id: true, url: true }, orderBy: [{ position: 'asc' }, { id: 'asc' }] },
} satisfies Prisma.ClubInclude;

type ClubRow = Prisma.ClubGetPayload<{ include: typeof CLUB_INCLUDE }>;

/** Поля клуба, ложащиеся в колонки NOT NULL один в один. */
const CLUB_PLAIN_FIELDS = [
  'name',
  'description',
  'shortDescription',
  'city',
  'address',
  'phone',
  'rating',
  'reviewCount',
  'priceFrom',
  'distanceKm',
  'source',
  'status',
] as const satisfies readonly (keyof Club)[];

/** Поля клуба, которые правка вправе стереть. */
const CLUB_ERASABLE_FIELDS = [
  'email',
  'website',
  'vk',
  'telegram',
  'facebook',
  'managedByUserId',
  'hideReason',
  'hiddenByUserId',
] as const satisfies readonly (keyof Club)[];

/**
 * Условие отбора публикаций — общее для клубов и тренеров.
 *
 * Условия у них одни и те же, отличается только имя связующей таблицы, поэтому
 * оно и передаётся параметром: две копии этого кода разошлись бы при первой правке.
 *
 * ⚠️ `status: { not: 'hidden' }` индексом по статусу не покрывается — btree не работает
 * на «не равно». Это осознанно оставлено как есть: значений статуса три, и отсев
 * скрытых всё равно читает почти всю таблицу. Ускоряют здесь другие условия —
 * вид спорта (соединение по связующей таблице) и рейтинг (индекс с ним в ключе).
 */
function buildPublicationWhere(
  filter: PublicationStatusFilter,
  sportsRelation: 'sports',
): Record<string, unknown> | undefined {
  const where: Record<string, unknown> = {};

  if (filter.excludeHidden === true) where.status = { not: 'hidden' };
  if (filter.ids !== undefined) where.id = { in: filter.ids };
  if (filter.minRating !== undefined) where.rating = { gte: filter.minRating };
  // Вид спорта живёт в связующей таблице — отбор идёт соединением, а не разбором
  // массива в памяти. У связующей таблицы есть индекс по виду спорта.
  if (filter.sportId !== undefined) {
    where[sportsRelation] = { some: { sportId: filter.sportId } };
  }

  return Object.keys(where).length === 0 ? undefined : where;
}

@Injectable()
export class PrismaClubsRepository implements ClubsRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toClub(row: ClubRow): Club {
    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      name: row.name,
      slug: row.slug,
      description: row.description,
      shortDescription: row.shortDescription,
      city: row.city,
      address: row.address,
      phone: row.phone,
      email: row.email ?? undefined,
      website: row.website ?? undefined,
      coordinates: { lat: row.latitude, lng: row.longitude },
      sportIds: row.sports.map((link) => link.sportId),
      imageUrls: row.images.map((image) => image.url),
      amenityIds: row.amenities.map((link) => link.amenityId),
      tagIds: row.tags.map((link) => link.tagId),
      vk: row.vk ?? undefined,
      telegram: row.telegram ?? undefined,
      facebook: row.facebook ?? undefined,
      rating: row.rating,
      reviewCount: row.reviewCount,
      priceFrom: row.priceFrom,
      distanceKm: row.distanceKm,
      managedByUserId: row.managedByUserId ?? undefined,
      source: row.source as EntitySource,
      status: row.status as EntityStatus,
      hideReason: row.hideReason ?? undefined,
      hiddenByUserId: row.hiddenByUserId ?? undefined,
      hiddenAt: toOptionalIsoString(row.hiddenAt),
    });
  }

  async findAll(filter: PublicationStatusFilter = {}): Promise<Club[]> {
    // Пустой набор номеров — заведомо пустая выдача. Запрос не делается вовсе,
    // и файловая реализация ведёт себя так же.
    if (filter.ids !== undefined && filter.ids.length === 0) return [];

    const rows = await this.client.club.findMany({
      // Весь отбор — условие запроса, а не фильтр в памяти: иначе выдача тянула бы
      // из базы всё, включая то, что заведомо выбрасывает.
      where: buildPublicationWhere(filter, 'sports'),
      include: CLUB_INCLUDE,
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaClubsRepository.toClub(row));
  }

  async findById(id: EntityId): Promise<Club | null> {
    const row = await this.client.club.findUnique({ where: { id }, include: CLUB_INCLUDE });

    return row === null ? null : PrismaClubsRepository.toClub(row);
  }

  async findBySlug(slug: string): Promise<Club | null> {
    const slugNormalized = normalizeSlugLookupValue(slug);

    // Пустой адрес-ссылка не ищется вовсе: в базе такого значения нет, но лишний
    // запрос по пустой строке — тоже запрос. Файловая реализация ведёт себя так же.
    if (slugNormalized === '') return null;

    const row = await this.client.club.findUnique({
      where: { slugNormalized },
      include: CLUB_INCLUDE,
    });

    return row === null ? null : PrismaClubsRepository.toClub(row);
  }

  async insert(club: Omit<Club, 'id' | 'createdAt'>): Promise<Club> {
    try {
      return await this.insertInner(club);
    } catch (error) {
      // ⚠️ Адрес-ссылка выводится из названия, и до фазы 33 два клуба с одинаковым
      // названием молча получали одинаковую ссылку: вторая карточка становилась
      // недостижимой. База это вскрыла — значит нужен текст, которого раньше не было.
      if (isUniqueViolation(error, 'slug')) {
        throw new ConflictError('Клуб с таким названием уже есть — измените название');
      }

      throw error;
    }
  }

  private async insertInner(club: Omit<Club, 'id' | 'createdAt'>): Promise<Club> {
    const created = await this.client.club.create({
      data: {
        name: club.name,
        slug: club.slug,
        slugNormalized: normalizeSlugLookupValue(club.slug),
        description: club.description,
        shortDescription: club.shortDescription,
        city: club.city,
        address: club.address,
        phone: club.phone,
        email: club.email,
        website: club.website,
        vk: club.vk,
        telegram: club.telegram,
        facebook: club.facebook,
        latitude: club.coordinates.lat,
        longitude: club.coordinates.lng,
        rating: club.rating,
        reviewCount: club.reviewCount,
        priceFrom: club.priceFrom,
        distanceKm: club.distanceKm,
        managedByUserId: club.managedByUserId,
        source: club.source,
        status: club.status,
        hideReason: club.hideReason,
        hiddenByUserId: club.hiddenByUserId,
        hiddenAt: club.hiddenAt === undefined ? null : new Date(club.hiddenAt),
        sports: { create: idsOf(club.sportIds).map((sportId) => ({ sportId })) },
        tags: { create: idsOf(club.tagIds).map((tagId) => ({ tagId })) },
        amenities: { create: idsOf(club.amenityIds).map((amenityId) => ({ amenityId })) },
        images: {
          create: (club.imageUrls ?? []).map((url, position) => ({ url, position })),
        },
      },
      include: CLUB_INCLUDE,
    });

    return PrismaClubsRepository.toClub(created);
  }

  async update(id: EntityId, patch: Partial<Club>): Promise<Club> {
    const current = await this.client.club.findUnique({ where: { id }, include: CLUB_INCLUDE });

    if (current === null) {
      throw new Error(`Клуб с id ${id} не найден`);
    }

    await this.client.club.update({ where: { id }, data: buildClubPatch(patch) });
    await this.syncClubLinks(id, current, patch);

    // Перечитываем: связующие таблицы правились после основного запроса, и собрать
    // ответ из его результата значило бы отдать состояние до правки набора ссылок.
    return (await this.findById(id)) as Club;
  }

  /** Согласование связующих таблиц клуба с новыми наборами ссылок. */
  private async syncClubLinks(id: EntityId, current: ClubRow, patch: Partial<Club>): Promise<void> {
    if (hasKey(patch, 'sportIds')) {
      await syncIdLinks({
        previous: current.sports.map((link) => link.sportId),
        next: idsOf(patch.sportIds),
        remove: (ids) =>
          this.client.clubSport.deleteMany({ where: { clubId: id, sportId: { in: ids } } }),
        add: (ids) =>
          this.client.clubSport.createMany({
            data: ids.map((sportId) => ({ clubId: id, sportId })),
          }),
      });
    }

    if (hasKey(patch, 'tagIds')) {
      await syncIdLinks({
        previous: current.tags.map((link) => link.tagId),
        next: idsOf(patch.tagIds),
        remove: (ids) =>
          this.client.clubTag.deleteMany({ where: { clubId: id, tagId: { in: ids } } }),
        add: (ids) =>
          this.client.clubTag.createMany({ data: ids.map((tagId) => ({ clubId: id, tagId })) }),
      });
    }

    if (hasKey(patch, 'amenityIds')) {
      await syncIdLinks({
        previous: current.amenities.map((link) => link.amenityId),
        next: idsOf(patch.amenityIds),
        remove: (ids) =>
          this.client.clubAmenity.deleteMany({ where: { clubId: id, amenityId: { in: ids } } }),
        add: (ids) =>
          this.client.clubAmenity.createMany({
            data: ids.map((amenityId) => ({ clubId: id, amenityId })),
          }),
      });
    }

    if (hasKey(patch, 'imageUrls')) {
      await this.syncClubImages(id, current.images, patch.imageUrls ?? []);
    }
  }

  /**
   * Согласование галереи.
   *
   * Кадры сравниваются ПОЗИЦИОННО, а не по множеству ссылок: у галереи порядок
   * значим, и одна и та же ссылка вправе встретиться дважды — множество этого
   * не выражает. Совпавшие позиции остаются теми же строками, лишние удаляются,
   * недостающие дописываются; полная перезапись завела бы новые строки даже там,
   * где ссылка не менялась.
   */
  private async syncClubImages(
    clubId: EntityId,
    previous: ClubRow['images'],
    next: string[],
  ): Promise<void> {
    const shared = Math.min(previous.length, next.length);

    for (let index = 0; index < shared; index += 1) {
      if (previous[index].url === next[index]) continue;

      await this.client.clubImage.update({
        where: { id: previous[index].id },
        data: { url: next[index] },
      });
    }

    if (previous.length > next.length) {
      await this.client.clubImage.deleteMany({
        where: { id: { in: previous.slice(next.length).map((image) => image.id) } },
      });
    }

    if (next.length > previous.length) {
      await this.client.clubImage.createMany({
        data: next.slice(previous.length).map((url, offset) => ({
          clubId,
          url,
          position: previous.length + offset,
        })),
      });
    }
  }

  async remove(id: EntityId): Promise<void> {
    // Как и в файловой реализации: удаление отсутствующего клуба — не ошибка.
    await this.client.club.deleteMany({ where: { id } });
  }
}

/** Скалярная часть правки клуба. Вынесена из класса: чистое преобразование без запросов. */
function buildClubPatch(patch: Partial<Club>): Prisma.ClubUncheckedUpdateInput {
  const data: Record<string, unknown> = {};

  copyPresent(patch, CLUB_PLAIN_FIELDS, data);
  copyErasable(patch, CLUB_ERASABLE_FIELDS, data);

  // Адрес-ссылка тянет за собой приведённую колонку: разъехавшись, они превратят
  // поиск по кириллическому адресу в «не найдено» без единой ошибки.
  if (hasKey(patch, 'slug') && patch.slug !== undefined) {
    data.slug = patch.slug;
    data.slugNormalized = normalizeSlugLookupValue(patch.slug);
  }

  if (hasKey(patch, 'coordinates') && patch.coordinates !== undefined) {
    data.latitude = patch.coordinates.lat;
    data.longitude = patch.coordinates.lng;
  }

  if (hasKey(patch, 'hiddenAt')) {
    data.hiddenAt = patch.hiddenAt === undefined ? null : new Date(patch.hiddenAt);
  }

  return data as Prisma.ClubUncheckedUpdateInput;
}

// --- Тренеры ------------------------------------------------------------------

const TRAINER_INCLUDE = {
  sports: { select: { sportId: true }, orderBy: { sportId: 'asc' } },
  specialties: { select: { specialtyId: true }, orderBy: { specialtyId: 'asc' } },
  workFormats: { select: { workFormatId: true }, orderBy: { workFormatId: 'asc' } },
} satisfies Prisma.TrainerInclude;

type TrainerRow = Prisma.TrainerGetPayload<{ include: typeof TRAINER_INCLUDE }>;

const TRAINER_PLAIN_FIELDS = [
  'name',
  'bio',
  'avatarUrl',
  'experienceYears',
  'rating',
  'reviewCount',
  'priceFrom',
  'source',
  'status',
] as const satisfies readonly (keyof Trainer)[];

const TRAINER_ERASABLE_FIELDS = [
  'city',
  'address',
  'phone',
  'vk',
  'telegram',
  'facebook',
  // STUB: колонка основного вида спорта. В неё ложится ТОЛЬКО явно названный
  // основной вид — тот, что пришёл в данных. Выведенный из первого элемента списка
  // сюда не пишется намеренно: записанный однажды, он перестал бы выводиться заново
  // и после правки списка видов спорта карточка показывала бы вид, которого у тренера
  // уже нет. Файловая реализация выводит его при каждом чтении — здесь то же самое,
  // только вывод делает `getTrainerPrimarySportId` на границе.
  'sportId',
  'managedByUserId',
  'hideReason',
  'hiddenByUserId',
] as const satisfies readonly (keyof Trainer)[];

@Injectable()
export class PrismaTrainersRepository implements TrainersRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  /**
   * Строка базы → тренер.
   *
   * `derivePrimarySport` повторяет несимметричность файловой реализации, и это не
   * недосмотр: чтение выводит основной вид спорта из списка, а ВСТАВКА возвращает
   * запись ровно такой, какой её передали. В эталоне контрактов это видно прямо:
   * у созданного тренера ключа `sportId` нет, у прочитанного — есть.
   */
  private static toTrainer(row: TrainerRow, derivePrimarySport = true): Trainer {
    const sportIds = row.sports.map((link) => link.sportId);

    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      name: row.name,
      slug: row.slug,
      bio: row.bio,
      avatarUrl: row.avatarUrl,
      experienceYears: row.experienceYears,
      specialtyIds: row.specialties.map((link) => link.specialtyId),
      workFormatIds: row.workFormats.map((link) => link.workFormatId),
      rating: row.rating,
      reviewCount: row.reviewCount,
      priceFrom: row.priceFrom,
      sportIds,
      city: row.city ?? undefined,
      address: row.address ?? undefined,
      // Координаты — одно сведение из двух колонок: половины точки не бывает.
      coordinates:
        row.latitude === null || row.longitude === null
          ? undefined
          : { lat: row.latitude, lng: row.longitude },
      phone: row.phone ?? undefined,
      vk: row.vk ?? undefined,
      telegram: row.telegram ?? undefined,
      facebook: row.facebook ?? undefined,
      // STUB: переходное одиночное поле из фазы 25. Починка «sportId ← sportIds[0]»,
      // которая была нужна файловой реализации, здесь не требуется — основной вид
      // спорта лежит в собственной колонке. Но само поле в ответе обязано остаться:
      // оно есть в эталоне контрактов. Формула — общая с фронтом, из @sporthub/domain.
      sportId: derivePrimarySport
        ? getTrainerPrimarySportId({ sportIds, sportId: row.sportId ?? undefined })
        : (row.sportId ?? undefined),
      managedByUserId: row.managedByUserId ?? undefined,
      source: row.source as EntitySource,
      status: row.status as EntityStatus,
      hideReason: row.hideReason ?? undefined,
      hiddenByUserId: row.hiddenByUserId ?? undefined,
      hiddenAt: toOptionalIsoString(row.hiddenAt),
    });
  }

  async findAll(filter: PublicationStatusFilter = {}): Promise<Trainer[]> {
    if (filter.ids !== undefined && filter.ids.length === 0) return [];

    const rows = await this.client.trainer.findMany({
      where: buildPublicationWhere(filter, 'sports'),
      include: TRAINER_INCLUDE,
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaTrainersRepository.toTrainer(row));
  }

  async findById(id: EntityId): Promise<Trainer | null> {
    const row = await this.client.trainer.findUnique({ where: { id }, include: TRAINER_INCLUDE });

    return row === null ? null : PrismaTrainersRepository.toTrainer(row);
  }

  async findBySlug(slug: string): Promise<Trainer | null> {
    const slugNormalized = normalizeSlugLookupValue(slug);

    if (slugNormalized === '') return null;

    const row = await this.client.trainer.findUnique({
      where: { slugNormalized },
      include: TRAINER_INCLUDE,
    });

    return row === null ? null : PrismaTrainersRepository.toTrainer(row);
  }

  async insert(trainer: Omit<Trainer, 'id' | 'createdAt'>): Promise<Trainer> {
    try {
      return await this.insertInner(trainer);
    } catch (error) {
      // Та же ловушка, что и у клуба: имя тренера превращается в адрес-ссылку.
      if (isUniqueViolation(error, 'slug')) {
        throw new ConflictError('Тренер с таким именем уже есть — измените имя');
      }

      throw error;
    }
  }

  private async insertInner(trainer: Omit<Trainer, 'id' | 'createdAt'>): Promise<Trainer> {
    const sportIds = idsOf(trainer.sportIds);

    const created = await this.client.trainer.create({
      data: {
        name: trainer.name,
        slug: trainer.slug,
        slugNormalized: normalizeSlugLookupValue(trainer.slug),
        bio: trainer.bio,
        avatarUrl: trainer.avatarUrl,
        experienceYears: trainer.experienceYears,
        rating: trainer.rating,
        reviewCount: trainer.reviewCount,
        priceFrom: trainer.priceFrom,
        city: trainer.city,
        address: trainer.address,
        latitude: trainer.coordinates?.lat,
        longitude: trainer.coordinates?.lng,
        phone: trainer.phone,
        vk: trainer.vk,
        telegram: trainer.telegram,
        facebook: trainer.facebook,
        // Явно названный основной вид спорта — как пришёл. Выведенный из первого
        // элемента списка не записывается: см. комментарий у TRAINER_ERASABLE_FIELDS.
        sportId: trainer.sportId,
        managedByUserId: trainer.managedByUserId,
        source: trainer.source,
        status: trainer.status,
        hideReason: trainer.hideReason,
        hiddenByUserId: trainer.hiddenByUserId,
        hiddenAt: trainer.hiddenAt === undefined ? null : new Date(trainer.hiddenAt),
        sports: { create: sportIds.map((sportId) => ({ sportId })) },
        specialties: {
          create: idsOf(trainer.specialtyIds).map((specialtyId) => ({ specialtyId })),
        },
        workFormats: {
          create: idsOf(trainer.workFormatIds).map((workFormatId) => ({ workFormatId })),
        },
      },
      include: TRAINER_INCLUDE,
    });

    return PrismaTrainersRepository.toTrainer(created, false);
  }

  async update(id: EntityId, patch: Partial<Trainer>): Promise<Trainer> {
    const current = await this.client.trainer.findUnique({
      where: { id },
      include: TRAINER_INCLUDE,
    });

    if (current === null) {
      throw new Error(`Тренер с id ${id} не найден`);
    }

    await this.client.trainer.update({ where: { id }, data: buildTrainerPatch(patch) });
    await this.syncTrainerLinks(id, current, patch);

    return (await this.findById(id)) as Trainer;
  }

  private async syncTrainerLinks(
    id: EntityId,
    current: TrainerRow,
    patch: Partial<Trainer>,
  ): Promise<void> {
    if (hasKey(patch, 'sportIds')) {
      await syncIdLinks({
        previous: current.sports.map((link) => link.sportId),
        next: idsOf(patch.sportIds),
        remove: (ids) =>
          this.client.trainerSport.deleteMany({ where: { trainerId: id, sportId: { in: ids } } }),
        add: (ids) =>
          this.client.trainerSport.createMany({
            data: ids.map((sportId) => ({ trainerId: id, sportId })),
          }),
      });
    }

    if (hasKey(patch, 'specialtyIds')) {
      await syncIdLinks({
        previous: current.specialties.map((link) => link.specialtyId),
        next: idsOf(patch.specialtyIds),
        remove: (ids) =>
          this.client.trainerSpecialty.deleteMany({
            where: { trainerId: id, specialtyId: { in: ids } },
          }),
        add: (ids) =>
          this.client.trainerSpecialty.createMany({
            data: ids.map((specialtyId) => ({ trainerId: id, specialtyId })),
          }),
      });
    }

    if (hasKey(patch, 'workFormatIds')) {
      await syncIdLinks({
        previous: current.workFormats.map((link) => link.workFormatId),
        next: idsOf(patch.workFormatIds),
        remove: (ids) =>
          this.client.trainerWorkFormat.deleteMany({
            where: { trainerId: id, workFormatId: { in: ids } },
          }),
        add: (ids) =>
          this.client.trainerWorkFormat.createMany({
            data: ids.map((workFormatId) => ({ trainerId: id, workFormatId })),
          }),
      });
    }
  }

  async remove(id: EntityId): Promise<void> {
    await this.client.trainer.deleteMany({ where: { id } });
  }
}

/** Скалярная часть правки тренера. */
function buildTrainerPatch(patch: Partial<Trainer>): Prisma.TrainerUncheckedUpdateInput {
  const data: Record<string, unknown> = {};

  copyPresent(patch, TRAINER_PLAIN_FIELDS, data);
  copyErasable(patch, TRAINER_ERASABLE_FIELDS, data);

  if (hasKey(patch, 'slug') && patch.slug !== undefined) {
    data.slug = patch.slug;
    data.slugNormalized = normalizeSlugLookupValue(patch.slug);
  }

  if (hasKey(patch, 'coordinates')) {
    data.latitude = toNullable(patch.coordinates?.lat);
    data.longitude = toNullable(patch.coordinates?.lng);
  }

  if (hasKey(patch, 'hiddenAt')) {
    data.hiddenAt = patch.hiddenAt === undefined ? null : new Date(patch.hiddenAt);
  }

  // Колонка основного вида спорта правится только явным указанием — она попала
  // в TRAINER_ERASABLE_FIELDS и уже перенесена выше. Пересчёта из списка здесь нет
  // намеренно: см. комментарий у этого списка.

  return data as Prisma.TrainerUncheckedUpdateInput;
}

// --- Расписание ---------------------------------------------------------------

type ScheduleRow = Prisma.ScheduleModel;

const SCHEDULE_PLAIN_FIELDS = [
  'sportId',
  'title',
  'durationMinutes',
  'level',
  'capacity',
  'bookedCount',
  'price',
] as const satisfies readonly (keyof Schedule)[];

const SCHEDULE_ERASABLE_FIELDS = [
  'offeringId',
  'description',
  'room',
] as const satisfies readonly (keyof Schedule)[];

@Injectable()
export class PrismaScheduleRepository implements ScheduleRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toSchedule(row: ScheduleRow): Schedule {
    const owner = toOwnerRef(row);

    return omitNulls({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      offeringId: row.offeringId ?? undefined,
      ownerType: owner.ownerType,
      ownerId: owner.ownerId,
      // Клуб слота — это либо клуб-владелец, либо зал, в котором ведёт тренер.
      // У тренерского слота без зала клуба нет вовсе: файловая реализация его тоже
      // не достраивала, это делает потребитель через связь тренер↔клуб.
      // Клуб и тренер занятия собираются из двух источников каждый: либо это
      // владелец, либо участник другой роли — площадка у клуба, ведущий у тренера.
      clubId: row.ownerClubId ?? row.venueClubId ?? undefined,
      trainerId: row.ownerTrainerId ?? row.conductedByTrainerId ?? undefined,
      sportId: row.sportId,
      title: row.title,
      description: row.description ?? undefined,
      date: toDateKey(row.date),
      startTime: toTimeKey(row.startTime),
      endTime: toTimeKey(row.endTime),
      durationMinutes: row.durationMinutes,
      level: row.level as SessionLevel,
      capacity: row.capacity,
      bookedCount: row.bookedCount,
      price: row.price,
      room: row.room ?? undefined,
    });
  }

  /**
   * Условие отбора слотов — целиком в запросе.
   *
   * Собирается здесь, а не рядом с вызовом, потому что «есть свободные места» требует
   * ссылки на колонку той же таблицы (`this.client.schedule.fields`), а она доступна
   * только через клиент.
   */
  private buildWhere(filter: ScheduleFilter): Prisma.ScheduleWhereInput | undefined {
    const conditions: Prisma.ScheduleWhereInput[] = [];
    // Умолчание перенесено из файловой реализации: без указания владельца
    // отдаются только клубные слоты.
    const ownerType = filter.ownerType ?? 'club';

    if (ownerType !== 'all') conditions.push(ownerTypeWhere(ownerType));
    if (filter.ids !== undefined) conditions.push({ id: { in: filter.ids } });

    // Клуб и тренер занятия собираются из ДВУХ колонок каждый — ровно так же, как
    // их собирает `toSchedule`. Условие по одной колонке молча теряло бы половину:
    // владелец зала не увидел бы тренерских занятий у себя, а клубное занятие
    // не нашлось бы по своему ведущему.
    if (filter.clubId !== undefined) {
      conditions.push({
        OR: [{ ownerClubId: filter.clubId }, { ownerClubId: null, venueClubId: filter.clubId }],
      });
    }

    if (filter.trainerId !== undefined) {
      conditions.push({
        OR: [
          { ownerTrainerId: filter.trainerId },
          { ownerTrainerId: null, conductedByTrainerId: filter.trainerId },
        ],
      });
    }

    if (filter.sportId !== undefined) conditions.push({ sportId: filter.sportId });
    if (filter.date !== undefined) conditions.push({ date: fromDateKey(filter.date) });

    if (filter.onlyWithFreeSeats === true) {
      // ⚠️ Сравнение двух КОЛОНОК одной строки, а не колонки со значением. Обычное
      // условие Prisma так не умеет, и вариантов было два: сырой запрос через
      // `$queryRaw` либо ссылка на поле (`client.schedule.fields`). Выбрана ссылка
      // на поле, и вот почему:
      //
      // 1. Она даёт ровно тот текст условия, под который построен частичный индекс
      //    `schedule_has_free_seats_idx (date, start_time) WHERE booked_count < capacity`.
      //    Планировщик сопоставляет предикат запроса с предикатом индекса —
      //    совпадение выражения и есть условие того, что индекс вообще применим.
      // 2. Сырой запрос вернул бы строки с именами колонок базы, и их пришлось бы
      //    перекладывать в форму строки вручную — второй, отдельно живущий маппер
      //    рядом с `toSchedule`. Разъехались бы они молча.
      //
      // Условие остаётся частью общего `AND`, а не отдельным проходом: PostgreSQL
      // раскладывает такой список в плоский набор предикатов, и сопоставление
      // с индексом от этого не страдает.
      conditions.push({ bookedCount: { lt: this.client.schedule.fields.capacity } });
    }

    // Набор владельцев: слот считается своим, если совпал клуб ИЛИ тренер —
    // причём каждый из них собирается из двух колонок, как и в `toSchedule`.
    if (filter.owners !== undefined) {
      const { clubIds, trainerIds } = filter.owners;

      conditions.push({
        OR: [
          { ownerClubId: { in: clubIds } },
          { venueClubId: { in: clubIds } },
          { ownerTrainerId: { in: trainerIds } },
          { conductedByTrainerId: { in: trainerIds } },
        ],
      });
    }

    return conditions.length === 0 ? undefined : { AND: conditions };
  }

  async sumSeats(filter: ScheduleFilter = {}): Promise<{ booked: number; capacity: number }> {
    // Две суммы одним запросом вместо чтения всего расписания ради них же.
    // Слоты без мест исключены условием, а не после чтения: `capacity = 0` в сумму
    // всё равно не вносит ничего, но и строку поднимать незачем.
    const where = this.buildWhere({ ...filter });
    const aggregate = await this.client.schedule.aggregate({
      where:
        where === undefined ? { capacity: { gt: 0 } } : { AND: [where, { capacity: { gt: 0 } }] },
      _sum: { bookedCount: true, capacity: true },
    });

    return {
      booked: aggregate._sum.bookedCount ?? 0,
      capacity: aggregate._sum.capacity ?? 0,
    };
  }

  async findMany(filter: ScheduleFilter = {}): Promise<Schedule[]> {
    // Пустой набор номеров — заведомо пустая выдача, запрос не нужен вовсе.
    if (filter.ids !== undefined && filter.ids.length === 0) return [];

    const rows = await this.client.schedule.findMany({
      where: this.buildWhere(filter),
      // Порядок задаёт запрос, а не потребитель: сортировать после чтения можно было,
      // пока читалась вся таблица. Как только выдача ограничена условием, порядок
      // становится частью самого отбора.
      orderBy:
        filter.order === 'dateTime'
          ? [{ date: 'asc' }, { startTime: 'asc' }, { id: 'asc' }]
          : { id: 'asc' },
    });

    return rows.map((row) => PrismaScheduleRepository.toSchedule(row));
  }

  async findById(id: EntityId): Promise<Schedule | null> {
    const row = await this.client.schedule.findUnique({ where: { id } });

    return row === null ? null : PrismaScheduleRepository.toSchedule(row);
  }

  async findByOfferingId(offeringId: EntityId): Promise<Schedule[]> {
    const rows = await this.client.schedule.findMany({
      where: { offeringId },
      orderBy: { id: 'asc' },
    });

    return rows.map((row) => PrismaScheduleRepository.toSchedule(row));
  }

  async insertMany(slots: Omit<Schedule, 'id' | 'createdAt'>[]): Promise<Schedule[]> {
    if (slots.length === 0) return [];

    const created = await this.client.schedule.createManyAndReturn({
      data: slots.map((slot) => {
        const owner = resolveSlotOwner(slot);

        return {
          offeringId: toNullable(slot.offeringId),
          ...fromOwnerRef(owner.ownerType, owner.ownerId),
          // Площадка есть только у тренерского слота: у клубного «зал» и «владелец» —
          // один и тот же клуб, и вторая ссылка на него была бы дублем.
          venueClubId: owner.ownerType === 'trainer' ? toNullable(slot.clubId) : null,
          // Зеркально площадке: у клубного занятия тренер — ведущий, а не владелец.
          // Без этой колонки он терялся бы, а поле есть и в типе, и в эталоне.
          conductedByTrainerId: owner.ownerType === 'club' ? toNullable(slot.trainerId) : null,
          sportId: slot.sportId,
          title: slot.title,
          description: toNullable(slot.description),
          date: fromDateKey(slot.date),
          startTime: fromTimeKey(slot.startTime),
          endTime: fromTimeKey(slot.endTime),
          durationMinutes: slot.durationMinutes,
          level: slot.level,
          capacity: slot.capacity,
          bookedCount: slot.bookedCount,
          price: slot.price,
          room: toNullable(slot.room),
        };
      }),
    });

    // Порядок выдачи обязан совпасть с порядком входа: вызывающий код сопоставляет
    // созданные слоты с формой по позиции. Номера растут монотонно, поэтому
    // сортировка по ним и есть порядок вставки.
    return [...created]
      .sort((left, right) => left.id - right.id)
      .map((row) => PrismaScheduleRepository.toSchedule(row));
  }

  async update(id: EntityId, patch: Partial<Schedule>): Promise<Schedule> {
    const current = await this.client.schedule.findUnique({ where: { id } });

    if (current === null) {
      throw new Error(`Слот с id ${id} не найден`);
    }

    const updated = await this.client.schedule.update({
      where: { id },
      data: buildSchedulePatch(current, patch),
    });

    return PrismaScheduleRepository.toSchedule(updated);
  }

  /**
   * Изменение счётчика занятых мест — ОДНОЙ операцией с условием.
   *
   * Чтение-подсчёт-запись здесь не годится, и это главная причина всей фазы:
   * между чтением и записью помещается чужой запрос, и двое, нажавшие
   * «Записаться» на последнее место, оба его получают. Аудит нашёл семь способов,
   * которыми это ломается сегодня, — включая зажим нулём, который молча прятал
   * уход счётчика в минус.
   *
   * Границы стоят прямо в условии: вверх — вместимость, вниз — ноль. Ноль
   * затронутых строк означает, что граница достигнута, и это не молчаливый
   * результат, а явная ошибка с тем же текстом, что и раньше.
   */
  async changeBookedCount(id: EntityId, delta: number): Promise<Schedule> {
    // Направления ведут себя по-разному, и это не asymmetry ради асимметрии.
    //
    // Занять место сверх вместимости — ошибка, о которой надо сказать вслух:
    // именно она и есть овербукинг. Освободить больше, чем занято, — не ошибка,
    // а следствие уже разъехавшегося счётчика (в данных такие слоты есть),
    // и падать на отмене записи из-за этого нельзя. Нижняя граница поэтому
    // зажимается прямо в выражении: одной операцией, без чтения перед записью.
    const affected =
      delta > 0
        ? await this.client.$executeRaw`
            UPDATE schedule
               SET booked_count = booked_count + ${delta}
             WHERE id = ${id}
               AND booked_count + ${delta} <= capacity
          `
        : await this.client.$executeRaw`
            UPDATE schedule
               SET booked_count = GREATEST(0, booked_count + ${delta})
             WHERE id = ${id}
          `;

    if (affected === 0) {
      const current = await this.client.schedule.findUnique({ where: { id } });

      if (current === null) {
        throw new Error(`Слот с id ${id} не найден`);
      }

      // Слот есть, но условие не выполнилось — значит мест не хватило.
      // Текст прежний: на него завязаны маршруты и тесты.
      throw new ConflictError('Свободных мест нет');
    }

    const updated = await this.client.schedule.findUniqueOrThrow({ where: { id } });

    return PrismaScheduleRepository.toSchedule(updated);
  }

  async removeMany(ids: EntityId[]): Promise<number> {
    if (ids.length === 0) return 0;

    const { count } = await this.client.schedule.deleteMany({ where: { id: { in: ids } } });

    return count;
  }
}

/**
 * Владелец нового слота.
 *
 * Пара полей контракта необязательна, но колонки базы обязаны получить ровно одну
 * заполненную ссылку — этого требует CHECK. Поэтому владелец достраивается из того,
 * что пришло: сначала явная пара, затем `clubId`/`trainerId`.
 */
function resolveSlotOwner(slot: Omit<Schedule, 'id' | 'createdAt'>): {
  ownerType: CatalogOwnerType;
  ownerId: EntityId;
} {
  const ownerType = slot.ownerType ?? (slot.trainerId !== undefined ? 'trainer' : 'club');
  const ownerId = slot.ownerId ?? (ownerType === 'club' ? slot.clubId : slot.trainerId);

  if (ownerId === undefined) {
    throw new Error('Слот без владельца: не заданы ни клуб, ни тренер');
  }

  return { ownerType, ownerId };
}

/** Скалярная часть правки слота. */
function buildSchedulePatch(
  current: ScheduleRow,
  patch: Partial<Schedule>,
): Prisma.ScheduleUncheckedUpdateInput {
  const data: Record<string, unknown> = {};

  copyPresent(patch, SCHEDULE_PLAIN_FIELDS, data);
  copyErasable(patch, SCHEDULE_ERASABLE_FIELDS, data);

  if (hasKey(patch, 'date') && patch.date !== undefined) data.date = fromDateKey(patch.date);
  if (hasKey(patch, 'startTime') && patch.startTime !== undefined) {
    data.startTime = fromTimeKey(patch.startTime);
  }
  if (hasKey(patch, 'endTime') && patch.endTime !== undefined) {
    data.endTime = fromTimeKey(patch.endTime);
  }

  // Владелец правится целиком или не правится вовсе: «половина владельца» — тип
  // без номера — базе непредставима, CHECK требует ровно одну заполненную колонку.
  if (hasKey(patch, 'ownerType') || hasKey(patch, 'ownerId')) {
    const currentOwner = toOwnerRef(current);
    const ownerType = patch.ownerType ?? currentOwner.ownerType;
    const ownerId = patch.ownerId ?? currentOwner.ownerId;

    Object.assign(data, fromOwnerRef(ownerType, ownerId));
  }

  // Площадка — отдельное сведение, а не второе имя владельца.
  if (hasKey(patch, 'clubId')) {
    const ownerType = patch.ownerType ?? toOwnerRef(current).ownerType;

    data.venueClubId = ownerType === 'trainer' ? toNullable(patch.clubId) : null;
    data.conductedByTrainerId = ownerType === 'club' ? toNullable(patch.trainerId) : null;
  }

  return data as Prisma.ScheduleUncheckedUpdateInput;
}
