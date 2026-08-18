import type { Club, Review, Trainer } from '@sporthub/types';

export type AthleteReviewItem = {
  createdAt: string;
  id: number;
  rating: number;
  targetName: string;
  targetTypeLabel: string;
  text: string;
};

type GetAthleteReviewItemsInput = {
  athleteUserId: number | null;
  clubs: Club[];
  reviews: Review[];
  trainers: Trainer[];
};

export function getAthleteReviewItems({
  athleteUserId,
  clubs,
  reviews,
  trainers,
}: GetAthleteReviewItemsInput): AthleteReviewItem[] {
  if (athleteUserId === null) {
    return [];
  }

  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));

  return reviews
    .filter((review) => review.userId === athleteUserId)
    .map((review) => ({
      createdAt: review.createdAt,
      id: review.id,
      rating: review.rating,
      targetName:
        review.trainerId !== undefined
          ? (trainerNames.get(review.trainerId) ?? 'Тренер SportHub')
          : (clubNames.get(review.clubId ?? -1) ?? 'Клуб SportHub'),
      targetTypeLabel: review.trainerId !== undefined ? 'Отзыв о тренере' : 'Отзыв о клубе',
      text: review.text,
    }))
    .sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}
