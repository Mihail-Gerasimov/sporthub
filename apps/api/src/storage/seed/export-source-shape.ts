// Обратная выгрузка: содержимое базы в том же виде, в каком оно лежало в `data/*.json`.
//
// Зачем это нужно, кроме теста. После шага 33.58 файлов не станет, и единственным
// доказательством «перенесли ничего не потеряв» останется возможность выгрузить
// базу обратно и сравнить с копией файлов. Поэтому выгрузка — не тестовая
// вспомогалка, а часть переноса.
//
// Чем она НЕ является: это не граница репозиториев. Там действуют правила шага 33.21
// («пустая коллекция → ключа нет»), а здесь задача противоположная — воспроизвести
// файл байт в байт по смыслу, включая пустые массивы, которые файл хранил.
//
// Два места, где выгрузка НЕ совпадёт с исходником, и оба согласованы:
//
// - **Порядок в массивах ссылок.** Колонки позиции в связующих таблицах нет
//   (решение заказчика), поэтому массив восстанавливается по возрастанию номера.
//   На реальных данных это меняет порядок у двух клубов из четырёх.
// - **Поля, удалённые из типов в фазе 25.** `trainers[].affiliatedClubId`,
//   `trainers[].clubId`, `offerings[].affiliatedClubId`, `schedule[].affiliatedClubId`
//   в базу не переносятся: сведения из них спасены в колонки площадки и связи.

import type {
  Amenity,
  Booking,
  BookingStatusTransition,
  City,
  Club,
  LogEntry,
  Notification,
  NotificationType,
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

import { toDateKey, toIsoString, toTimeKey } from '../../repositories/prisma-mappers';
import type { PrismaClient } from '../prisma-client/client';

import type { SourceData, SourceTrainerClubLink } from './source-data';

/** Убрать ключи с пустым значением: файл их не хранил вовсе. */
function withoutEmpty<TValue extends object>(value: TValue): TValue {
  const result: Record<string, unknown> = {};

  for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
    if (item === null || item === undefined) continue;

    result[key] = item;
  }

  return result as TValue;
}

/**
 * Весь срез, выгруженный из базы.
 *
 * Порядок записей — по возрастанию номера. В файлах он был порядком записи и местами
 * отличался (в расписании первым лежал слот 9), поэтому сравнивать выгрузку с файлом
 * надо, отсортировав обе стороны: порядок строк в базе без `ORDER BY` не гарантирован
 * вовсе, и опираться на него было бы ошибкой само по себе.
 */
export async function exportSourceShape(client: PrismaClient): Promise<SourceData> {
  const byId = { orderBy: { id: 'asc' } } as const;

  const [
    cityRows,
    sportRows,
    tagRows,
    amenityRows,
    specialtyRows,
    workFormatRows,
    userRows,
    clubRows,
    trainerRows,
    linkRows,
    offeringRows,
    scheduleRows,
    bookingRows,
    reviewRows,
    notificationRows,
    logRows,
    noteRows,
  ] = await Promise.all([
    client.city.findMany(byId),
    client.sport.findMany(byId),
    client.tag.findMany(byId),
    client.amenity.findMany(byId),
    client.specialty.findMany(byId),
    client.workFormat.findMany(byId),
    client.user.findMany({
      ...byId,
      include: {
        favoriteClubs: { orderBy: { clubId: 'asc' } },
        notificationPreferences: { orderBy: { type: 'asc' } },
      },
    }),
    client.club.findMany({
      ...byId,
      include: {
        images: { orderBy: { position: 'asc' } },
        sports: { orderBy: { sportId: 'asc' } },
        tags: { orderBy: { tagId: 'asc' } },
        amenities: { orderBy: { amenityId: 'asc' } },
      },
    }),
    client.trainer.findMany({
      ...byId,
      include: {
        sports: { orderBy: { sportId: 'asc' } },
        specialties: { orderBy: { specialtyId: 'asc' } },
        workFormats: { orderBy: { workFormatId: 'asc' } },
      },
    }),
    client.trainerClubLink.findMany(byId),
    client.offering.findMany(byId),
    client.schedule.findMany(byId),
    client.booking.findMany({
      ...byId,
      include: { statusTransitions: { orderBy: { id: 'asc' } } },
    }),
    client.review.findMany(byId),
    client.notification.findMany(byId),
    client.logEntry.findMany(byId),
    client.providerClientNote.findMany(byId),
  ]);

  const cities: City[] = cityRows.map((row) => ({
    id: row.id,
    createdAt: toIsoString(row.createdAt),
    name: row.name,
    coordinates: { lat: row.latitude, lng: row.longitude },
  }));

  const sports: Sport[] = sportRows.map((row) => ({
    id: row.id,
    createdAt: toIsoString(row.createdAt),
    name: row.name,
    slug: row.slug,
    description: row.description,
    icon: row.icon,
    imageUrl: row.imageUrl,
    isPopular: row.isPopular,
  }));

  const simple = <TItem extends { id: number; createdAt: string; name: string }>(
    rows: { id: number; createdAt: Date; name: string }[],
  ): TItem[] =>
    rows.map(
      (row) => ({ id: row.id, createdAt: toIsoString(row.createdAt), name: row.name }) as TItem,
    );

  const users: User[] = userRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      role: row.role as User['role'],
      // Вид учётной записи (фаза 35): без него выгрузка теряет единственное
      // различие, которое не выводится из владения.
      accountKind: row.accountKind as User['accountKind'],
      status: row.status as User['status'],
      name: row.name,
      email: row.email,
      phone: row.phone,
      passwordHash: row.passwordHash,
      avatarUrl: row.avatarUrl ?? undefined,
      city: row.city ?? undefined,
      notificationPreferences:
        row.notificationPreferences.length === 0
          ? undefined
          : Object.fromEntries(
              row.notificationPreferences.map((pref) => [pref.type, pref.enabled]),
            ),
      // Массив избранного файл хранил всегда, даже пустым, — поэтому он идёт
      // мимо отсева пустых значений.
    } as User),
  );

  users.forEach((user, index) => {
    user.favoriteClubIds = userRows[index].favoriteClubs.map((row) => row.clubId);
  });

  const clubs: Club[] = clubRows.map((row) => ({
    ...withoutEmpty({
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
      vk: row.vk ?? undefined,
      telegram: row.telegram ?? undefined,
      facebook: row.facebook ?? undefined,
      rating: row.rating,
      reviewCount: row.reviewCount,
      priceFrom: row.priceFrom,
      distanceKm: row.distanceKm,
      managedByUserId: row.managedByUserId ?? undefined,
      source: row.source as Club['source'],
      status: row.status as Club['status'],
      hideReason: row.hideReason ?? undefined,
      hiddenByUserId: row.hiddenByUserId ?? undefined,
      hiddenAt: row.hiddenAt ? toIsoString(row.hiddenAt) : undefined,
    } as Club),
    coordinates: { lat: row.latitude, lng: row.longitude },
    sportIds: row.sports.map((item) => item.sportId),
    imageUrls: row.images.map((item) => item.url),
    amenityIds: row.amenities.map((item) => item.amenityId),
    tagIds: row.tags.map((item) => item.tagId),
  }));

  const trainers: Trainer[] = trainerRows.map((row) => ({
    ...withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      name: row.name,
      slug: row.slug,
      bio: row.bio,
      avatarUrl: row.avatarUrl,
      experienceYears: row.experienceYears,
      rating: row.rating,
      reviewCount: row.reviewCount,
      priceFrom: row.priceFrom,
      city: row.city ?? undefined,
      address: row.address ?? undefined,
      phone: row.phone ?? undefined,
      vk: row.vk ?? undefined,
      telegram: row.telegram ?? undefined,
      facebook: row.facebook ?? undefined,
      sportId: row.sportId ?? undefined,
      managedByUserId: row.managedByUserId ?? undefined,
      source: row.source as Trainer['source'],
      status: row.status as Trainer['status'],
      hideReason: row.hideReason ?? undefined,
      hiddenByUserId: row.hiddenByUserId ?? undefined,
      hiddenAt: row.hiddenAt ? toIsoString(row.hiddenAt) : undefined,
      coordinates:
        row.latitude === null || row.longitude === null
          ? undefined
          : { lat: row.latitude, lng: row.longitude },
    } as Trainer),
    specialtyIds: row.specialties.map((item) => item.specialtyId),
    workFormatIds: row.workFormats.map((item) => item.workFormatId),
    sportIds: row.sports.map((item) => item.sportId),
  }));

  const trainerClubLinks: SourceTrainerClubLink[] = linkRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      trainerId: row.trainerId,
      clubId: row.clubId,
      status: row.status as TrainerClubLink['status'],
      initiatedBy: row.initiatedBy as TrainerClubLink['initiatedBy'],
      initiatedByUserId: row.initiatedByUserId ?? undefined,
      approvedAt: row.approvedAt ? toIsoString(row.approvedAt) : undefined,
      approvedByUserId: row.approvedByUserId ?? undefined,
      rejectedAt: row.rejectedAt ? toIsoString(row.rejectedAt) : undefined,
      rejectedByUserId: row.rejectedByUserId ?? undefined,
      rejectionReason: row.rejectionReason ?? undefined,
      revokedAt: row.revokedAt ? toIsoString(row.revokedAt) : undefined,
      revokedByUserId: row.revokedByUserId ?? undefined,
      revokedBy: row.revokedBy as TrainerClubLink['revokedBy'],
    } as SourceTrainerClubLink),
  );

  const offerings: Offering[] = offeringRows.map((row) => ({
    ...withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      // Тип владельца собирается обратно из пары колонок: ровно один из них заполнен,
      // это держит проверка целостности в базе.
      ownerType: row.ownerClubId === null ? 'trainer' : 'club',
      ownerId: row.ownerClubId ?? row.ownerTrainerId ?? undefined,
      trainerClubLinkId: row.trainerClubLinkId ?? undefined,
      cancellationPolicy: row.cancellationPolicy as Offering['cancellationPolicy'],
      sportId: row.sportId,
      title: row.title,
      description: row.description,
      format: row.format as Offering['format'],
      price: row.price,
      durationMinutes: row.durationMinutes,
      capacity: row.capacity,
      address: row.address,
    } as Offering),
    coordinates: { lat: row.latitude, lng: row.longitude },
  }));

  const schedule: Schedule[] = scheduleRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      offeringId: row.offeringId ?? undefined,
      ownerType: row.ownerClubId === null ? 'trainer' : 'club',
      ownerId: row.ownerClubId ?? row.ownerTrainerId ?? undefined,
      // Клуб слота — это владелец-клуб либо площадка: у тренерского занятия в зале
      // клуба «клуб слота» всегда означал именно площадку.
      clubId: row.ownerClubId ?? row.venueClubId ?? undefined,
      trainerId: row.ownerTrainerId ?? undefined,
      sportId: row.sportId,
      title: row.title,
      description: row.description ?? undefined,
      date: toDateKey(row.date),
      startTime: toTimeKey(row.startTime),
      endTime: toTimeKey(row.endTime),
      durationMinutes: row.durationMinutes,
      level: row.level as Schedule['level'],
      capacity: row.capacity,
      bookedCount: row.bookedCount,
      price: row.price,
      room: row.room ?? undefined,
    } as Schedule),
  );

  const bookings: Booking[] = bookingRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      scheduleId: row.scheduleId,
      offeringId: row.offeringId ?? undefined,
      ownerType: row.ownerClubId === null ? 'trainer' : 'club',
      ownerId: row.ownerClubId ?? row.ownerTrainerId ?? undefined,
      userId: row.userId,
      clubId: row.ownerClubId ?? row.venueClubId ?? undefined,
      trainerId: row.ownerTrainerId ?? undefined,
      sportId: row.sportId,
      date: toDateKey(row.date),
      status: row.status as Booking['status'],
      paymentStatus: row.paymentStatus as Booking['paymentStatus'],
      totalPrice: row.totalPrice,
      cancellationPolicySnapshot:
        row.cancellationPolicySnapshot as Booking['cancellationPolicySnapshot'],
      cancelledBy: row.cancelledBy as Booking['cancelledBy'],
      cancelReason: row.cancelReason as Booking['cancelReason'],
      completedAt: row.completedAt ? toIsoString(row.completedAt) : undefined,
      statusHistory: row.statusTransitions.map(
        (transition): BookingStatusTransition => ({
          // `from` у самой первой строки истории — именно пустое значение, а не
          // отсутствие ключа: файл хранил `"from": null`. Поэтому оно ставится
          // мимо отсева пустых значений.
          from: (transition.fromStatus ?? null) as BookingStatusTransition['from'],
          ...withoutEmpty({
            to: transition.toStatus as BookingStatusTransition['to'],
            actor: transition.actor as BookingStatusTransition['actor'],
            actorUserId: transition.actorUserId ?? undefined,
            at: toIsoString(transition.at),
            reason: transition.reason ?? undefined,
          }),
        }),
      ),
    } as Booking),
  );

  const reviews: Review[] = reviewRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      userId: row.userId,
      clubId: row.clubId ?? undefined,
      trainerId: row.trainerId ?? undefined,
      rating: row.rating,
      text: row.text,
    } as Review),
  );

  const notifications: Notification[] = notificationRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      userId: row.userId,
      type: row.type as NotificationType,
      payload: row.payload as Record<string, unknown>,
      readAt: row.readAt ? toIsoString(row.readAt) : undefined,
    } as Notification),
  );

  const logs: LogEntry[] = logRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      action: row.action as LogEntry['action'],
      actorId: row.actorId,
      actorRole: row.actorRole as LogEntry['actorRole'],
      entityType: row.entityType as LogEntry['entityType'],
      entityId: row.entityId,
      meta: (row.meta ?? undefined) as LogEntry['meta'],
    } as LogEntry),
  );

  const providerClientNotes: ProviderClientNote[] = noteRows.map((row) =>
    withoutEmpty({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      updatedAt: toIsoString(row.updatedAt),
      providerUserId: row.providerUserId,
      clientUserId: row.clientUserId,
      note: row.note,
      bookingId: row.bookingId ?? undefined,
    } as ProviderClientNote),
  );

  return {
    amenities: simple<Amenity>(amenityRows),
    bookings,
    cities,
    clubs,
    logs,
    notifications,
    offerings,
    providerClientNotes,
    reviews,
    schedule,
    specialties: simple<Specialty>(specialtyRows),
    sports,
    tags: simple<Tag>(tagRows),
    trainers,
    trainerClubLinks,
    users,
    workFormats: simple<WorkFormat>(workFormatRows),
  };
}
