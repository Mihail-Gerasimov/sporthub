import { CANCELLED_BOOKING_STATUSES } from '@sporthub/domain';
import type { Booking, Club, Review, Trainer } from '@sporthub/types';

export type AthleteFavoriteTrainer = Trainer & {
  reasonLabel: string;
};

export type AthleteFavorites = {
  clubs: Club[];
  trainers: AthleteFavoriteTrainer[];
};

type GetAthleteFavoritesInput = {
  athleteUserId: number | null;
  bookings: Booking[];
  clubs: Club[];
  reviews: Review[];
  trainers: Trainer[];
  /**
   * Избранные клубы человека — списком номеров, а не поиском себя в списке всех.
   *
   * ⚠️ Раньше сюда приходил `users: User[]`, и функция искала в нём себя, чтобы
   * прочитать поле. Список всех пользователей площадки закрыли правом администратора
   * (фаза 34), страница стала подсовывать вместо него профиль из сессии через
   * приведение `as unknown as User` — а у профиля этого поля не было, и раздел
   * падал у любого вошедшего на попытке пройтись по `undefined`.
   *
   * Приведение молчало, потому что через `unknown` тип проверять нечего. Здесь
   * запрашивается ровно то, что нужно, — и подсунуть не то больше не выйдет.
   */
  favoriteClubIds: readonly number[];
};

type TrainerScore = {
  bookingCount: number;
  reviewCount: number;
};

function getTrainerReasonLabel(score: TrainerScore) {
  if (score.reviewCount > 0) {
    return 'Есть отзыв о тренере';
  }

  if (score.bookingCount > 0) {
    return 'Есть записи к тренеру';
  }

  return 'Тренер в каталоге';
}

export function getAthleteFavorites({
  athleteUserId,
  bookings,
  clubs,
  reviews,
  trainers,
  favoriteClubIds,
}: GetAthleteFavoritesInput): AthleteFavorites {
  if (athleteUserId === null) {
    return {
      clubs: [],
      trainers: [],
    };
  }

  const favoriteClubs = favoriteClubIds
    .map((favoriteClubId) => clubs.find((club) => club.id === favoriteClubId) ?? null)
    .filter((club): club is Club => club !== null);
  // Phase 24: фильтруем по отсутствию в множестве отменённых/отклонённых статусов —
  // совместимо с FSM (cancelled_by_athlete / cancelled_by_provider / rejected_by_provider).
  const activeBookings = bookings.filter(
    (booking) =>
      booking.userId === athleteUserId && !CANCELLED_BOOKING_STATUSES.has(booking.status),
  );
  const athleteReviews = reviews.filter((review) => review.userId === athleteUserId);

  const trainerScores = new Map<number, TrainerScore>();

  for (const trainer of trainers) {
    const bookingCount = activeBookings.filter(
      (booking) => booking.trainerId === trainer.id,
    ).length;
    const reviewCount = athleteReviews.filter((review) => review.trainerId === trainer.id).length;

    if (bookingCount === 0 && reviewCount === 0) {
      continue;
    }

    trainerScores.set(trainer.id, {
      bookingCount,
      reviewCount,
    });
  }

  const favoriteTrainers = trainers
    .filter((trainer) => trainerScores.has(trainer.id))
    .sort((left, right) => {
      const leftScore = trainerScores.get(left.id);
      const rightScore = trainerScores.get(right.id);

      if (!leftScore || !rightScore) {
        return 0;
      }

      const leftWeight = leftScore.reviewCount * 10 + leftScore.bookingCount * 4;
      const rightWeight = rightScore.reviewCount * 10 + rightScore.bookingCount * 4;

      if (leftWeight !== rightWeight) {
        return rightWeight - leftWeight;
      }

      if (left.rating !== right.rating) {
        return right.rating - left.rating;
      }

      return left.name.localeCompare(right.name, 'ru');
    })
    .slice(0, 4)
    .map((trainer) => {
      const score = trainerScores.get(trainer.id);

      return {
        ...trainer,
        reasonLabel: getTrainerReasonLabel(
          score ?? {
            bookingCount: 0,
            reviewCount: 0,
          },
        ),
      } satisfies AthleteFavoriteTrainer;
    });

  return {
    clubs: favoriteClubs,
    trainers: favoriteTrainers,
  };
}
