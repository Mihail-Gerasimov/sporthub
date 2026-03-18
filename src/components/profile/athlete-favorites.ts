import type { Booking, Club, Review, Trainer, User } from '@/types';

export type AthleteFavoriteTrainer = Trainer & {
  clubName: string;
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
  users: User[];
};

type TrainerScore = {
  bookingCount: number;
  inFavoriteClub: boolean;
  reviewCount: number;
};

function getTrainerReasonLabel(score: TrainerScore) {
  if (score.reviewCount > 0) {
    return 'Есть отзыв о тренере';
  }

  if (score.bookingCount > 0) {
    return 'Есть записи к тренеру';
  }

  return 'Из любимого клуба';
}

export function getAthleteFavorites({
  athleteUserId,
  bookings,
  clubs,
  reviews,
  trainers,
  users,
}: GetAthleteFavoritesInput): AthleteFavorites {
  if (athleteUserId === null) {
    return {
      clubs: [],
      trainers: [],
    };
  }

  const athleteUser = users.find((user) => user.id === athleteUserId);

  if (!athleteUser) {
    return {
      clubs: [],
      trainers: [],
    };
  }

  const favoriteClubIds = athleteUser.favoriteClubIds;
  const favoriteClubs = favoriteClubIds
    .map((favoriteClubId) => clubs.find((club) => club.id === favoriteClubId) ?? null)
    .filter((club): club is Club => club !== null);

  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const activeBookings = bookings.filter(
    (booking) => booking.userId === athleteUserId && booking.status !== 'cancelled',
  );
  const athleteReviews = reviews.filter((review) => review.userId === athleteUserId);

  const trainerScores = new Map<number, TrainerScore>();

  for (const trainer of trainers) {
    const bookingCount = activeBookings.filter(
      (booking) => booking.trainerId === trainer.id,
    ).length;
    const reviewCount = athleteReviews.filter((review) => review.trainerId === trainer.id).length;
    const inFavoriteClub = favoriteClubIds.includes(trainer.clubId);

    if (bookingCount === 0 && reviewCount === 0 && !inFavoriteClub) {
      continue;
    }

    trainerScores.set(trainer.id, {
      bookingCount,
      inFavoriteClub,
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

      const leftWeight =
        leftScore.reviewCount * 10 +
        leftScore.bookingCount * 4 +
        (leftScore.inFavoriteClub ? 1 : 0);
      const rightWeight =
        rightScore.reviewCount * 10 +
        rightScore.bookingCount * 4 +
        (rightScore.inFavoriteClub ? 1 : 0);

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
        clubName: clubNames.get(trainer.clubId) ?? 'Клуб SportHub',
        reasonLabel: getTrainerReasonLabel(
          score ?? {
            bookingCount: 0,
            inFavoriteClub: false,
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
