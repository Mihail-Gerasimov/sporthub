// Phase 25 Step 25.10: guard ownership для CRM-заметок провайдера.
// Атлет считается клиентом провайдера, если у него есть хоть один booking,
// чей clubId или trainerId ссылается на managed-сущность этого провайдера.
// Чистая in-memory функция без зависимости от db — вызывается после того, как
// роут уже прочитал bookings/clubs/trainers.
import { getBookingClubId, getBookingTrainerId } from '@/lib/utils';
import type { Booking, Club, EntityId, Trainer } from '@/types';

/**
 * Проверяет, является ли `clientUserId` клиентом `providerUserId`. Критерий —
 * факт существования booking'а со связью на managed-сущность провайдера.
 * Прошедшие/отменённые booking'и тоже учитываются: заметки остаются актуальными
 * и после завершения тренировок.
 */
export function isClientOfProvider(
  clientUserId: EntityId,
  providerUserId: EntityId,
  bookings: Booking[],
  clubs: Club[],
  trainers: Trainer[],
): boolean {
  const providerClubIds = new Set(
    clubs.filter((club) => club.managedByUserId === providerUserId).map((club) => club.id),
  );
  const providerTrainerIds = new Set(
    trainers
      .filter((trainer) => trainer.managedByUserId === providerUserId)
      .map((trainer) => trainer.id),
  );

  // Без владений провайдер не может иметь клиентов — short-circuit.
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
    if (trainerId !== null && providerTrainerIds.has(trainerId)) {
      return true;
    }

    return false;
  });
}
