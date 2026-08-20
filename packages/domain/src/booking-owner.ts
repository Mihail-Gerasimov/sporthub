// Владелец записи: клуб и тренер, к которым относится booking, и производный
// от них ответ на вопрос «мой ли это клиент».
//
// Формула отката на `ownerType`/`ownerId` до Phase 33 существовала в трёх копиях
// (два места в проверках прав бэкенда и резолверы фронта), причём фронтовая
// копия отката не делала — и на легаси-записях фронт с бэкендом отвечали
// по-разному. Здесь она объявлена один раз.

import type { Booking, EntityId } from '@sporthub/types';

/**
 * Поля записи, по которым определяется её владелец. Все необязательные: часть
 * данных хранит только явные `clubId`/`trainerId`, часть — только пару
 * `ownerType`/`ownerId`.
 */
export type BookingOwnerRef = Pick<Booking, 'clubId' | 'trainerId' | 'ownerType' | 'ownerId'>;

/**
 * Минимум, который нужен от клуба или тренера, чтобы понять, кто ими управляет.
 * Структурный тип вместо `Club | Trainer`: домен не должен требовать от
 * вызывающего полную сущность ради двух полей.
 */
export type ManagedEntityRef = { id: EntityId; managedByUserId?: EntityId };

/** Клуб записи: явное поле, иначе владелец, если запись принадлежит клубу. */
export function getBookingClubId(booking: BookingOwnerRef): EntityId | null {
  if (booking.clubId !== undefined) {
    return booking.clubId;
  }

  return booking.ownerType === 'club' && booking.ownerId !== undefined ? booking.ownerId : null;
}

/** Тренер записи: явное поле, иначе владелец, если запись принадлежит тренеру. */
export function getBookingTrainerId(booking: BookingOwnerRef): EntityId | null {
  if (booking.trainerId !== undefined) {
    return booking.trainerId;
  }

  return booking.ownerType === 'trainer' && booking.ownerId !== undefined ? booking.ownerId : null;
}

/**
 * Клиент ли атлет у провайдера. Критерий — существование записи на сущность,
 * которой провайдер управляет. Отменённые и прошедшие записи тоже считаются:
 * заметка о клиенте остаётся актуальной и после окончания занятий.
 */
export function isClientOfProvider(
  clientUserId: EntityId,
  providerUserId: EntityId,
  bookings: readonly (BookingOwnerRef & Pick<Booking, 'userId'>)[],
  clubs: readonly ManagedEntityRef[],
  trainers: readonly ManagedEntityRef[],
): boolean {
  const providerClubIds = new Set(
    clubs.filter((club) => club.managedByUserId === providerUserId).map((club) => club.id),
  );
  const providerTrainerIds = new Set(
    trainers
      .filter((trainer) => trainer.managedByUserId === providerUserId)
      .map((trainer) => trainer.id),
  );

  // Без владений провайдер не может иметь клиентов — обходим перебор записей.
  if (providerClubIds.size === 0 && providerTrainerIds.size === 0) {
    return false;
  }

  return bookings.some((booking) => {
    if (booking.userId !== clientUserId) {
      return false;
    }

    const clubId = getBookingClubId(booking);
    if (clubId !== null && providerClubIds.has(clubId)) {
      return true;
    }

    const trainerId = getBookingTrainerId(booking);

    return trainerId !== null && providerTrainerIds.has(trainerId);
  });
}
