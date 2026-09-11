// Подготовка исходного среза к записи в базу.
//
// Шаг стоит ОТДЕЛЬНО от записи намеренно: здесь принимаются все решения о том, чем
// содержимое базы будет отличаться от содержимого файлов, и каждое из них попадает
// в журнал изменений. Смешанное с вставкой, это превратилось бы в набор «поправок
// по дороге», о которых знает только автор.
//
// Что здесь происходит и почему:
//
// 1. **Владелец и площадка разводятся.** В файле у услуги, слота и записи один
//    «владелец» плюс поля `clubId` / `affiliatedClubId`, значение которых зависит
//    от того, кто владелец. В базе это две независимые связи: владение (каскадное
//    удаление, «мои публикации») и площадка (доступ владельца зала, удаление зала).
//    Площадка заполняется ТОЛЬКО когда она отличается от владельца: у клубного слота
//    зал — это сам клуб, и дублировать номер незачем.
// 2. **Спасение сведений из полей вне типов.** У услуги 3 и слотов 4 и 5
//    `affiliatedClubId` — единственный след клуба, в зале которого идёт занятие.
//    Потеряв его, услуга стала бы частной и пропала бы со страницы клуба.
// 3. **Пересчёт денормализованных счётчиков.** Занятые места и рейтинги в файле
//    протухли: писателя у них не было, и они разошлись с фактическими записями
//    и отзывами. Переносить протухшее значение — значит перенести ошибку.
// 4. **Снимки НЕ трогаются.** Дата, цена, вид спорта и политика отмены в записи
//    расходятся со слотом у 31 записи из 32 — это снимок на момент записи,
//    защищающий атлета от условий, изменённых задним числом. Не дефект.

import {
  ACTIVE_BOOKING_STATUSES,
  accountKindOf,
  addresseeKindFromFace,
  normalizeMatchKey,
} from '@sporthub/domain';
import type { CatalogOwnerType, EntityId } from '@sporthub/types';

import { normalizeSlugLookupValue } from '../../repositories/entities.repository';
import { fromDateKey, fromTimeKey } from '../../repositories/prisma-mappers';
import type { Prisma } from '../prisma-client/client';
import {
  BOOKING_REASON_REPAIRS,
  isRepairableReason,
  SCHEDULE_ROOM_REPAIRS,
  USER_REPAIRS,
} from './repairs';
import type { SourceData } from './source-data';

/** Пустые словари починок — для наборов, к которым таблица 15.2 не относится. */
const EMPTY_TEXT_REPAIRS: ReadonlyMap<EntityId, string> = new Map();
const EMPTY_USER_REPAIRS: ReadonlyMap<EntityId, { name: string; email: string }> = new Map();

/** Строки всех таблиц в порядке, пригодном для вставки: родители раньше детей. */
export type PreparedRows = {
  cities: Prisma.CityCreateManyInput[];
  sports: Prisma.SportCreateManyInput[];
  tags: Prisma.TagCreateManyInput[];
  amenities: Prisma.AmenityCreateManyInput[];
  specialties: Prisma.SpecialtyCreateManyInput[];
  workFormats: Prisma.WorkFormatCreateManyInput[];
  users: Prisma.UserCreateManyInput[];
  clubs: Prisma.ClubCreateManyInput[];
  trainers: Prisma.TrainerCreateManyInput[];
  trainerClubLinks: Prisma.TrainerClubLinkCreateManyInput[];
  offerings: Prisma.OfferingCreateManyInput[];
  schedule: Prisma.ScheduleCreateManyInput[];
  bookings: Prisma.BookingCreateManyInput[];
  bookingStatusTransitions: Prisma.BookingStatusTransitionCreateManyInput[];
  reviews: Prisma.ReviewCreateManyInput[];
  notifications: Prisma.NotificationCreateManyInput[];
  logs: Prisma.LogEntryCreateManyInput[];
  providerClientNotes: Prisma.ProviderClientNoteCreateManyInput[];
  clubImages: Prisma.ClubImageCreateManyInput[];
  clubSports: Prisma.ClubSportCreateManyInput[];
  clubTags: Prisma.ClubTagCreateManyInput[];
  clubAmenities: Prisma.ClubAmenityCreateManyInput[];
  trainerSports: Prisma.TrainerSportCreateManyInput[];
  trainerSpecialties: Prisma.TrainerSpecialtyCreateManyInput[];
  trainerWorkFormats: Prisma.TrainerWorkFormatCreateManyInput[];
  userFavoriteClubs: Prisma.UserFavoriteClubCreateManyInput[];
  userNotificationPreferences: Prisma.UserNotificationPreferenceCreateManyInput[];
};

/** Одно пересчитанное значение: что считали, что было в файле, что стало. */
export type Recalculation = { subject: string; was: number; now: number };

/** Всё, чем содержимое базы отличается от содержимого файлов. */
export type ChangeLog = {
  /** Почищенные тексты. */
  repairs: string[];
  /** Спасённые сведения из полей вне типов. */
  rescues: string[];
  /** Пересчитанные счётчики — только те, что разошлись с файлом. */
  recalculations: Recalculation[];
  /** Осознанно отброшенное и всё, о чём переносу стоит предупредить. */
  notes: string[];
};

export type PreparedImport = {
  rows: PreparedRows;
  changes: ChangeLog;
};

/** Настройки подготовки. */
export type PrepareOptions = {
  /**
   * Применять ли чистку мусорных текстов из `repairs.ts`.
   *
   * Словарь починок привязан к НОМЕРАМ записей боевых данных, поэтому включать
   * его для любого другого набора нельзя: сид для разработки со слотом номер 9
   * молча получил бы чужое название зала. Перенос из файлов включает починку явно,
   * все остальные — нет.
   */
  repairTexts?: boolean;
  /**
   * Пересчитывать ли денормализованные счётчики: занятые места слота и агрегаты отзывов.
   *
   * Пересчёт — свойство ПЕРЕНОСА, а не хранилища: он чинит счётчики, разъехавшиеся
   * за годы жизни файлов. Тестовой обвязке он вреден ровно так же, как словарь починок:
   * набор, объявивший «слот занят целиком», получил бы ноль занятых мест, и та же
   * проверка на файлах и на базе перестала бы быть той же проверкой.
   */
  recalculate?: boolean;
};

/** Владение, площадка и ведущий — четыре колонки вместо прежней пары «тип владельца + номер». */
type Placement = {
  ownerClubId: number | null;
  ownerTrainerId: number | null;
  venueClubId: number | null;
  /**
   * Тренер занятия, когда владелец — клуб.
   *
   * Симметрично площадке. Без этой колонки у клубного занятия с тренером тренер
   * терялся бы: пара взаимоисключающих ссылок владельца вторую занять не даёт,
   * а поле `trainerId` есть и в типе, и в эталоне контрактов.
   */
  conductedByTrainerId: number | null;
};

/**
 * Развести владельца и площадку.
 *
 * `venueCandidate` — то, что в файле указывало на клуб: `clubId` у слота и записи,
 * `affiliatedClubId` у услуги. Если он совпал с владельцем-клубом, площадка не
 * заполняется: у клубной публикации зал — это сам клуб, и вторая ссылка на него
 * ничего не добавляет, зато создаёт второе место, где это можно рассинхронизировать.
 */
function placeOwner(
  ownerType: CatalogOwnerType,
  ownerId: EntityId,
  venueCandidate: EntityId | undefined,
  trainerCandidate?: EntityId,
): Placement {
  if (ownerType === 'club') {
    return {
      ownerClubId: ownerId,
      ownerTrainerId: null,
      venueClubId:
        venueCandidate !== undefined && venueCandidate !== ownerId ? venueCandidate : null,
      conductedByTrainerId: trainerCandidate ?? null,
    };
  }

  return {
    ownerClubId: null,
    ownerTrainerId: ownerId,
    venueClubId: venueCandidate ?? null,
    // Владелец — тренер, значит отдельного ведущего нет: он же и владелец.
    conductedByTrainerId: null,
  };
}

/** Метка времени строкой → значение колонки. Пустая строка и отсутствие — это «нет метки». */
function toTimestamp(value: string | undefined): Date | null {
  if (value === undefined || value === '') return null;

  const parsed = new Date(value);

  if (Number.isNaN(parsed.getTime())) {
    throw new Error(`Не удалось разобрать метку времени: ${value}`);
  }

  return parsed;
}

/** Обязательная метка времени: у неё нет осмысленного значения по умолчанию. */
function requireTimestamp(value: string | undefined, what: string): Date {
  const parsed = toTimestamp(value);

  if (parsed === null) {
    throw new Error(`Отсутствует обязательная метка времени: ${what}`);
  }

  return parsed;
}

/** Подготовить весь срез: строки таблиц плюс журнал того, что изменилось. */
export function prepareRows(source: SourceData, options: PrepareOptions = {}): PreparedImport {
  const { repairTexts = false, recalculate = true } = options;
  const changes: ChangeLog = { repairs: [], rescues: [], recalculations: [], notes: [] };
  const userRepairs = repairTexts ? USER_REPAIRS : EMPTY_USER_REPAIRS;
  const roomRepairs = repairTexts ? SCHEDULE_ROOM_REPAIRS : EMPTY_TEXT_REPAIRS;
  const reasonRepairs = repairTexts ? BOOKING_REASON_REPAIRS : EMPTY_TEXT_REPAIRS;

  // --- Справочники ------------------------------------------------------------

  const cities: Prisma.CityCreateManyInput[] = source.cities.map((city) => ({
    id: city.id,
    createdAt: requireTimestamp(city.createdAt, `город ${city.id}`),
    name: city.name,
    // Нормализованное имя заполняет та же функция, что и рабочий код: приведение
    // регистра выражением базы для кириллицы зависит от её сортировки.
    nameNormalized: normalizeMatchKey(city.name),
    latitude: city.coordinates.lat,
    longitude: city.coordinates.lng,
  }));

  const sports: Prisma.SportCreateManyInput[] = source.sports.map((sport) => ({
    id: sport.id,
    createdAt: requireTimestamp(sport.createdAt, `вид спорта ${sport.id}`),
    name: sport.name,
    slug: sport.slug,
    description: sport.description,
    icon: sport.icon,
    imageUrl: sport.imageUrl,
    isPopular: sport.isPopular,
  }));

  const simpleDictionary = <TItem extends { id: EntityId; createdAt: string; name: string }>(
    items: TItem[],
    what: string,
  ): { id: number; createdAt: Date; name: string }[] =>
    items.map((item) => ({
      id: item.id,
      createdAt: requireTimestamp(item.createdAt, `${what} ${item.id}`),
      name: item.name,
    }));

  const tags = simpleDictionary(source.tags, 'тег');
  const amenities = simpleDictionary(source.amenities, 'удобство');
  const specialties = simpleDictionary(source.specialties, 'специализация');
  const workFormats = simpleDictionary(source.workFormats, 'формат работы');

  // --- Пользователи -----------------------------------------------------------

  const users: Prisma.UserCreateManyInput[] = [];
  const userFavoriteClubs: Prisma.UserFavoriteClubCreateManyInput[] = [];
  const userNotificationPreferences: Prisma.UserNotificationPreferenceCreateManyInput[] = [];

  for (const user of source.users) {
    const createdAt = requireTimestamp(user.createdAt, `пользователь ${user.id}`);
    const repair = userRepairs.get(user.id);

    if (repair) {
      changes.repairs.push(
        `пользователь ${user.id} · имя и почта → «${repair.name}», ${repair.email}`,
      );
    }

    users.push({
      id: user.id,
      createdAt,
      // Вид учётной записи (фаза 35). Не задан — человек: администратора
      // назначают, и в наборе он объявлен явно. Умолчание берётся из домена,
      // а не пишется строкой здесь: словарь один на весь проект.
      accountKind: accountKindOf(user),
      status: user.status ?? 'active',
      name: repair?.name ?? user.name,
      email: repair?.email ?? user.email,
      phone: user.phone,
      passwordHash: user.passwordHash,
      avatarUrl: user.avatarUrl ?? null,
      city: user.city ?? null,
    });

    for (const clubId of user.favoriteClubIds ?? []) {
      // Своей метки времени у избранного в файле не было: массив её не хранил.
      // Берём метку пользователя, чтобы повторный запуск переноса давал то же
      // значение, а не «сейчас», — иначе перенос перестал бы быть идемпотентным.
      userFavoriteClubs.push({ userId: user.id, clubId, createdAt });
    }

    for (const [type, enabled] of Object.entries(user.notificationPreferences ?? {})) {
      if (enabled === undefined) continue;

      userNotificationPreferences.push({ userId: user.id, type, enabled });
    }
  }

  for (const id of userRepairs.keys()) {
    if (!source.users.some((user) => user.id === id)) {
      changes.notes.push(`починка не применена: пользователя ${id} в данных нет`);
    }
  }

  // --- Агрегаты отзывов -------------------------------------------------------
  //
  // Считаются ДО клубов и тренеров: их колонки рейтинга заполняются пересчитанным
  // значением, а не тем, что лежало в файле.

  const clubRatings = aggregateReviews(source.reviews, 'clubId');
  const trainerRatings = aggregateReviews(source.reviews, 'trainerId');

  // --- Клубы ------------------------------------------------------------------

  const clubs: Prisma.ClubCreateManyInput[] = [];
  const clubImages: Prisma.ClubImageCreateManyInput[] = [];
  const clubSports: Prisma.ClubSportCreateManyInput[] = [];
  const clubTags: Prisma.ClubTagCreateManyInput[] = [];
  const clubAmenities: Prisma.ClubAmenityCreateManyInput[] = [];
  let clubImageId = 0;

  for (const club of source.clubs) {
    const aggregate = recalculate
      ? (clubRatings.get(club.id) ?? { rating: 0, reviewCount: 0 })
      : { rating: club.rating, reviewCount: club.reviewCount };

    if (aggregate.rating !== club.rating || aggregate.reviewCount !== club.reviewCount) {
      changes.recalculations.push(
        { subject: `клуб ${club.id} · рейтинг`, was: club.rating, now: aggregate.rating },
        {
          subject: `клуб ${club.id} · отзывов`,
          was: club.reviewCount,
          now: aggregate.reviewCount,
        },
      );
    }

    clubs.push({
      id: club.id,
      createdAt: requireTimestamp(club.createdAt, `клуб ${club.id}`),
      name: club.name,
      slug: club.slug,
      slugNormalized: normalizeSlugLookupValue(club.slug),
      description: club.description,
      shortDescription: club.shortDescription,
      city: club.city,
      address: club.address,
      phone: club.phone,
      email: club.email ?? null,
      website: club.website ?? null,
      vk: club.vk ?? null,
      telegram: club.telegram ?? null,
      facebook: club.facebook ?? null,
      latitude: club.coordinates.lat,
      longitude: club.coordinates.lng,
      rating: aggregate.rating,
      reviewCount: aggregate.reviewCount,
      priceFrom: club.priceFrom,
      distanceKm: club.distanceKm,
      managedByUserId: club.managedByUserId ?? null,
      source: club.source ?? 'seed',
      status: club.status ?? 'published',
      hideReason: club.hideReason ?? null,
      hiddenAt: toTimestamp(club.hiddenAt),
      hiddenByUserId: club.hiddenByUserId ?? null,
    });

    club.imageUrls.forEach((url, index) => {
      clubImageId += 1;
      // Номер строки задаётся здесь, а не автоинкрементом: иначе повторный запуск
      // переноса выдавал бы кадрам новые номера, и «то же самое» перестало бы
      // быть тем же самым.
      clubImages.push({ id: clubImageId, clubId: club.id, url, position: index });
    });

    for (const sportId of club.sportIds) clubSports.push({ clubId: club.id, sportId });
    for (const tagId of club.tagIds) clubTags.push({ clubId: club.id, tagId });
    for (const amenityId of club.amenityIds) clubAmenities.push({ clubId: club.id, amenityId });
  }

  // --- Тренеры ----------------------------------------------------------------

  const trainers: Prisma.TrainerCreateManyInput[] = [];
  const trainerSports: Prisma.TrainerSportCreateManyInput[] = [];
  const trainerSpecialties: Prisma.TrainerSpecialtyCreateManyInput[] = [];
  const trainerWorkFormats: Prisma.TrainerWorkFormatCreateManyInput[] = [];

  for (const trainer of source.trainers) {
    const aggregate = recalculate
      ? (trainerRatings.get(trainer.id) ?? { rating: 0, reviewCount: 0 })
      : { rating: trainer.rating, reviewCount: trainer.reviewCount };

    if (aggregate.rating !== trainer.rating || aggregate.reviewCount !== trainer.reviewCount) {
      changes.recalculations.push(
        { subject: `тренер ${trainer.id} · рейтинг`, was: trainer.rating, now: aggregate.rating },
        {
          subject: `тренер ${trainer.id} · отзывов`,
          was: trainer.reviewCount,
          now: aggregate.reviewCount,
        },
      );
    }

    // `affiliatedClubId` и `clubId` тренера в базу НЕ едут: они удалены из типа
    // в фазе 25, а источник правды связи тренер↔клуб — таблица связей. У тренера 1
    // это ровно та пара, что уже лежит в связи 1 со статусом «подтверждена».
    if (trainer.affiliatedClubId !== undefined || trainer.clubId !== undefined) {
      changes.notes.push(
        `тренер ${trainer.id} · прежняя привязка к клубу отброшена: источник правды — таблица связей`,
      );
    }

    trainers.push({
      id: trainer.id,
      createdAt: requireTimestamp(trainer.createdAt, `тренер ${trainer.id}`),
      name: trainer.name,
      slug: trainer.slug,
      slugNormalized: normalizeSlugLookupValue(trainer.slug),
      bio: trainer.bio,
      avatarUrl: trainer.avatarUrl,
      experienceYears: trainer.experienceYears,
      rating: aggregate.rating,
      reviewCount: aggregate.reviewCount,
      priceFrom: trainer.priceFrom,
      city: trainer.city ?? null,
      address: trainer.address ?? null,
      latitude: trainer.coordinates?.lat ?? null,
      longitude: trainer.coordinates?.lng ?? null,
      phone: trainer.phone ?? null,
      vk: trainer.vk ?? null,
      telegram: trainer.telegram ?? null,
      facebook: trainer.facebook ?? null,
      sportId: trainer.sportId ?? trainer.sportIds[0] ?? null,
      managedByUserId: trainer.managedByUserId ?? null,
      source: trainer.source ?? 'seed',
      status: trainer.status ?? 'published',
      hideReason: trainer.hideReason ?? null,
      hiddenAt: toTimestamp(trainer.hiddenAt),
      hiddenByUserId: trainer.hiddenByUserId ?? null,
    });

    for (const sportId of trainer.sportIds) trainerSports.push({ trainerId: trainer.id, sportId });
    for (const specialtyId of trainer.specialtyIds) {
      trainerSpecialties.push({ trainerId: trainer.id, specialtyId });
    }
    for (const workFormatId of trainer.workFormatIds) {
      trainerWorkFormats.push({ trainerId: trainer.id, workFormatId });
    }
  }

  // --- Связи тренер ↔ клуб -----------------------------------------------------

  const trainerClubLinks: Prisma.TrainerClubLinkCreateManyInput[] = source.trainerClubLinks.map(
    (link) => ({
      id: link.id,
      createdAt: requireTimestamp(link.createdAt, `связь ${link.id}`),
      trainerId: link.trainerId,
      clubId: link.clubId,
      status: link.status,
      initiatedBy: link.initiatedBy,
      // Поле есть в данных, но отсутствует в типе. Колонка под него заведена
      // именно затем, чтобы сведения не потерялись на переносе.
      initiatedByUserId: link.initiatedByUserId ?? null,
      approvedAt: toTimestamp(link.approvedAt),
      approvedByUserId: link.approvedByUserId ?? null,
      rejectedAt: toTimestamp(link.rejectedAt),
      rejectedByUserId: link.rejectedByUserId ?? null,
      rejectionReason: link.rejectionReason ?? null,
      revokedAt: toTimestamp(link.revokedAt),
      revokedByUserId: link.revokedByUserId ?? null,
      revokedBy: link.revokedBy ?? null,
    }),
  );

  const initiatedByUserCount = source.trainerClubLinks.filter(
    (link) => link.initiatedByUserId !== undefined,
  ).length;

  if (initiatedByUserCount > 0) {
    changes.rescues.push(
      `связи · инициатор-пользователь сохранён у ${initiatedByUserCount} из ${source.trainerClubLinks.length} (поля нет в типе)`,
    );
  }

  /** Подтверждённая связь этой пары — по ней услуга тренера считается «в клубе». */
  const confirmedLinkId = (trainerId: EntityId, clubId: EntityId): EntityId | undefined =>
    source.trainerClubLinks.find(
      (link) =>
        link.trainerId === trainerId && link.clubId === clubId && link.status === 'confirmed',
    )?.id;

  // --- Услуги -----------------------------------------------------------------

  const offerings: Prisma.OfferingCreateManyInput[] = source.offerings.map((offering) => {
    const placement = placeOwner(offering.ownerType, offering.ownerId, offering.affiliatedClubId);
    let trainerClubLinkId = offering.trainerClubLinkId ?? null;

    if (offering.affiliatedClubId !== undefined) {
      if (placement.venueClubId === null) {
        changes.notes.push(
          `услуга ${offering.id} · прежняя привязка к клубу отброшена как дубль владельца`,
        );
      } else {
        // Связь ищем по паре «владелец-тренер + клуб из прежней привязки».
        // Без неё услуга при чтении станет частной и пропадёт со страницы клуба —
        // притом что тренер к клубу привязан и связь подтверждена.
        trainerClubLinkId ??= confirmedLinkId(offering.ownerId, placement.venueClubId) ?? null;

        changes.rescues.push(
          trainerClubLinkId === null
            ? `услуга ${offering.id} · площадка ${placement.venueClubId} сохранена, но подтверждённой связи не нашлось`
            : `услуга ${offering.id} · площадка ${placement.venueClubId}, связь ${trainerClubLinkId}`,
        );
      }
    }

    return {
      id: offering.id,
      createdAt: requireTimestamp(offering.createdAt, `услуга ${offering.id}`),
      ownerClubId: placement.ownerClubId,
      ownerTrainerId: placement.ownerTrainerId,
      venueClubId: placement.venueClubId,
      trainerClubLinkId,
      cancellationPolicy: offering.cancellationPolicy ?? null,
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
    };
  });

  // --- Занятые места ----------------------------------------------------------
  //
  // Считаются по фактическим записям в действующих состояниях. Набор состояний
  // берётся из общего пакета, а не вписывается сюда списком: добавив состояние
  // в код и не поправив перенос, мы получили бы тихо разошедшийся счётчик.

  const activeBySlot = new Map<EntityId, number>();

  for (const booking of source.bookings) {
    if (!ACTIVE_BOOKING_STATUSES.has(booking.status)) continue;
    // Запись без слота в счёт занятых мест не идёт: считать не для чего.
    if (booking.scheduleId === null) continue;

    activeBySlot.set(booking.scheduleId, (activeBySlot.get(booking.scheduleId) ?? 0) + 1);
  }

  // --- Слоты ------------------------------------------------------------------

  const schedule: Prisma.ScheduleCreateManyInput[] = source.schedule.map((slot) => {
    const ownerType = slot.ownerType;
    const ownerId = slot.ownerId;

    if (ownerType === undefined || ownerId === undefined) {
      throw new Error(`У слота ${slot.id} не указан владелец — в базе колонка обязательна`);
    }

    // Клуб слота мог быть записан двумя разными полями: типизированным `clubId`
    // и прежним `affiliatedClubId`. Первое главнее, второе — запасное.
    const venueCandidate = slot.clubId ?? slot.affiliatedClubId;
    const placement = placeOwner(ownerType, ownerId, venueCandidate, slot.trainerId);

    if (
      placement.venueClubId !== null &&
      slot.clubId === undefined &&
      slot.affiliatedClubId !== undefined
    ) {
      changes.rescues.push(
        `слот ${slot.id} · площадка ${placement.venueClubId} восстановлена из поля вне типа`,
      );
    }

    if (
      slot.affiliatedClubId !== undefined &&
      placement.venueClubId === null &&
      ownerType === 'club'
    ) {
      changes.notes.push(
        `слот ${slot.id} · прежняя привязка к клубу отброшена как дубль владельца`,
      );
    }

    const bookedCount = recalculate ? (activeBySlot.get(slot.id) ?? 0) : slot.bookedCount;

    if (bookedCount !== slot.bookedCount) {
      changes.recalculations.push({
        subject: `слот ${slot.id} · занятых мест`,
        was: slot.bookedCount,
        now: bookedCount,
      });
    }

    const room = roomRepairs.get(slot.id);

    if (room !== undefined) {
      changes.repairs.push(`слот ${slot.id} · название зала → «${room}»`);
    }

    return {
      id: slot.id,
      createdAt: requireTimestamp(slot.createdAt, `слот ${slot.id}`),
      offeringId: slot.offeringId ?? null,
      ownerClubId: placement.ownerClubId,
      ownerTrainerId: placement.ownerTrainerId,
      venueClubId: placement.venueClubId,
      conductedByTrainerId: placement.conductedByTrainerId,
      sportId: slot.sportId,
      title: slot.title,
      description: slot.description ?? null,
      date: fromDateKey(slot.date),
      startTime: fromTimeKey(slot.startTime),
      endTime: fromTimeKey(slot.endTime),
      durationMinutes: slot.durationMinutes,
      level: slot.level,
      capacity: slot.capacity,
      bookedCount,
      price: slot.price,
      room: room ?? slot.room ?? null,
    };
  });

  for (const id of roomRepairs.keys()) {
    if (!source.schedule.some((slot) => slot.id === id)) {
      changes.notes.push(`починка не применена: слота ${id} в данных нет`);
    }
  }

  // --- Записи и история переходов ---------------------------------------------

  const bookings: Prisma.BookingCreateManyInput[] = [];
  const bookingStatusTransitions: Prisma.BookingStatusTransitionCreateManyInput[] = [];
  let transitionId = 0;

  for (const booking of source.bookings) {
    const ownerType = booking.ownerType;
    const ownerId = booking.ownerId;

    if (ownerType === undefined || ownerId === undefined) {
      throw new Error(`У записи ${booking.id} не указан владелец — в базе колонка обязательна`);
    }

    const placement = placeOwner(ownerType, ownerId, booking.clubId, booking.trainerId);

    bookings.push({
      id: booking.id,
      createdAt: requireTimestamp(booking.createdAt, `запись ${booking.id}`),
      scheduleId: booking.scheduleId,
      offeringId: booking.offeringId ?? null,
      ownerClubId: placement.ownerClubId,
      ownerTrainerId: placement.ownerTrainerId,
      venueClubId: placement.venueClubId,
      conductedByTrainerId: placement.conductedByTrainerId,
      userId: booking.userId,
      sportId: booking.sportId,
      // Дата записи — снимок на момент записи, а не копия даты слота: у 31 записи
      // из 32 они расходятся, и это защита атлета, а не рассинхрон.
      date: fromDateKey(booking.date),
      status: booking.status,
      paymentStatus: booking.paymentStatus,
      totalPrice: booking.totalPrice,
      cancellationPolicySnapshot: booking.cancellationPolicySnapshot ?? null,
      cancelledBy: booking.cancelledBy ?? null,
      cancelReason: booking.cancelReason ?? null,
      completedAt: toTimestamp(booking.completedAt),
    });

    const history = booking.statusHistory ?? [];
    const repairedReason = reasonRepairs.get(booking.id);
    // Чинится последний переход с «человеческой» причиной: у записей 27–30 это отказ
    // провайдера. Машинные причины автопереходов при этом не затрагиваются.
    const repairIndex = repairedReason === undefined ? -1 : lastRepairableIndex(history);

    if (repairedReason !== undefined) {
      changes.repairs.push(
        repairIndex === -1
          ? `починка не применена: у записи ${booking.id} нет причины для замены`
          : `запись ${booking.id} · причина отмены → «${repairedReason}»`,
      );
    }

    history.forEach((transition, index) => {
      transitionId += 1;

      bookingStatusTransitions.push({
        // Номер задаётся здесь, а не автоинкрементом: повторный запуск переноса
        // обязан дать тем же переходам те же номера.
        id: transitionId,
        bookingId: booking.id,
        fromStatus: transition.from ?? null,
        toStatus: transition.to,
        actor: transition.actor,
        actorUserId: transition.actorUserId ?? null,
        at: requireTimestamp(transition.at, `переход записи ${booking.id}`),
        reason: index === repairIndex ? repairedReason! : (transition.reason ?? null),
      });
    });
  }

  for (const id of reasonRepairs.keys()) {
    if (!source.bookings.some((booking) => booking.id === id)) {
      changes.notes.push(`починка не применена: записи ${id} в данных нет`);
    }
  }

  // --- Отзывы, уведомления, журнал, заметки -----------------------------------

  const reviews: Prisma.ReviewCreateManyInput[] = source.reviews.map((review) => ({
    id: review.id,
    createdAt: requireTimestamp(review.createdAt, `отзыв ${review.id}`),
    userId: review.userId,
    clubId: review.clubId ?? null,
    trainerId: review.trainerId ?? null,
    rating: review.rating,
    text: review.text,
  }));

  const notifications: Prisma.NotificationCreateManyInput[] = source.notifications.map(
    (notification) => ({
      id: notification.id,
      createdAt: requireTimestamp(notification.createdAt, `уведомление ${notification.id}`),
      userId: notification.userId,
      // Вид адресата называется явно: колонка без умолчания, и вывести его
      // «по пустоте колонок» больше нельзя — с фазы 37 пустые колонки лица
      // бывают и у надзорной очереди (шаг 37.5).
      addresseeKind: addresseeKindFromFace(notification.addresseeType),
      // Адресат-лицо: пара полей контракта раскладывается на две колонки, ровно
      // как владелец услуги и расписания. Обе пусты — уведомление человеку.
      addresseeClubId:
        notification.addresseeType === 'club' ? (notification.addresseeId ?? null) : null,
      addresseeTrainerId:
        notification.addresseeType === 'trainer' ? (notification.addresseeId ?? null) : null,
      type: notification.type,
      // Форма содержимого зависит от типа, запросов по его внутренностям нет.
      payload: notification.payload as Prisma.InputJsonValue,
      readAt: toTimestamp(notification.readAt),
    }),
  );

  const logs: Prisma.LogEntryCreateManyInput[] = source.logs.map((entry) => ({
    id: entry.id,
    createdAt: requireTimestamp(entry.createdAt, `запись журнала ${entry.id}`),
    action: entry.action,
    actorId: entry.actorId,
    actorRole: entry.actorRole,
    entityType: entry.entityType,
    entityId: entry.entityId,
    meta: (entry.meta ?? undefined) as Prisma.InputJsonValue | undefined,
  }));

  // Журнал намеренно живёт без внешнего ключа на объект: он фиксирует в том числе
  // удаление, и запись обязана пережить исчезновение того, о чём она написана.
  const danglingLogs = source.logs.filter(
    (entry) =>
      entry.entityType === 'booking' &&
      !source.bookings.some((booking) => booking.id === entry.entityId),
  );

  if (danglingLogs.length > 0) {
    changes.notes.push(
      `журнал · ${danglingLogs.length} строк(и) о записях, которых больше нет — так и задумано, внешнего ключа здесь нет`,
    );
  }

  const providerClientNotes: Prisma.ProviderClientNoteCreateManyInput[] =
    source.providerClientNotes.map((note) => ({
      id: note.id,
      createdAt: requireTimestamp(note.createdAt, `заметка ${note.id}`),
      updatedAt: requireTimestamp(note.updatedAt, `заметка ${note.id}`),
      providerUserId: note.providerUserId,
      clientUserId: note.clientUserId,
      note: note.note,
      bookingId: note.bookingId ?? null,
      // Лицо услуг (шаг 35.27a): пара «вид + номер» раскладывается на две колонки,
      // потому что только у колонки бывает внешний ключ и каскад.
      faceClubId: note.faceType === 'club' ? (note.faceId ?? null) : null,
      faceTrainerId: note.faceType === 'trainer' ? (note.faceId ?? null) : null,
    }));

  return {
    rows: {
      cities,
      sports,
      tags,
      amenities,
      specialties,
      workFormats,
      users,
      clubs,
      trainers,
      trainerClubLinks,
      offerings,
      schedule,
      bookings,
      bookingStatusTransitions,
      reviews,
      notifications,
      logs,
      providerClientNotes,
      clubImages,
      clubSports,
      clubTags,
      clubAmenities,
      trainerSports,
      trainerSpecialties,
      trainerWorkFormats,
      userFavoriteClubs,
      userNotificationPreferences,
    },
    changes,
  };
}

/** Номер последнего перехода с причиной, пригодной для замены. -1, если такого нет. */
function lastRepairableIndex(history: { reason?: string }[]): number {
  for (let index = history.length - 1; index >= 0; index -= 1) {
    if (isRepairableReason(history[index].reason)) return index;
  }

  return -1;
}

/**
 * Рейтинг и число отзывов по фактическим отзывам.
 *
 * Среднее НЕ округляется: округление до одного знака — дело показа, и оно уже
 * сделано в интерфейсе. Округлив здесь, мы потеряли бы точность фильтра
 * «рейтинг не ниже» и не смогли бы её вернуть, не пересчитав всё заново.
 */
function aggregateReviews(
  reviews: { clubId?: EntityId; trainerId?: EntityId; rating: number }[],
  key: 'clubId' | 'trainerId',
): Map<EntityId, { rating: number; reviewCount: number }> {
  const sums = new Map<EntityId, { total: number; count: number }>();

  for (const review of reviews) {
    const target = review[key];

    if (target === undefined) continue;

    const current = sums.get(target) ?? { total: 0, count: 0 };

    sums.set(target, { total: current.total + review.rating, count: current.count + 1 });
  }

  const result = new Map<EntityId, { rating: number; reviewCount: number }>();

  for (const [target, { total, count }] of sums) {
    result.set(target, { rating: total / count, reviewCount: count });
  }

  return result;
}
