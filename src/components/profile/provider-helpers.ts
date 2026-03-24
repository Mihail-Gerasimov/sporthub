// Бизнес-логика провайдер-кабинета: фильтрация клубов, тренеров, букингов, отзывов и сводка.
import type { Booking, Club, Review, Trainer } from '@/types';

/** Сводка KPI провайдера для дэшборда */
export type ProviderSummary = {
  publicationsCount: number;
  activeBookingsCount: number;
  reviewsCount: number;
  averageRating: number;
};

/** Клубы, управляемые провайдером */
export function getProviderClubs(clubs: Club[], providerUserId: number): Club[] {
  return clubs.filter((club) => club.managedByUserId === providerUserId);
}

/** Тренеры, управляемые провайдером */
export function getProviderTrainers(trainers: Trainer[], providerUserId: number): Trainer[] {
  return trainers.filter((trainer) => trainer.managedByUserId === providerUserId);
}

/** Входящие записи на клубы и тренеров провайдера */
export function getProviderIncomingBookings(
  bookings: Booking[],
  providerClubIds: number[],
  providerTrainerIds: number[],
): Booking[] {
  const clubIdSet = new Set(providerClubIds);
  const trainerIdSet = new Set(providerTrainerIds);

  return bookings.filter((booking) => {
    if (booking.clubId && clubIdSet.has(booking.clubId)) {
      return true;
    }

    if (booking.trainerId && trainerIdSet.has(booking.trainerId)) {
      return true;
    }

    return false;
  });
}

/** Отзывы на клубы и тренеров провайдера */
export function getProviderReviews(
  reviews: Review[],
  providerClubIds: number[],
  providerTrainerIds: number[],
): Review[] {
  const clubIdSet = new Set(providerClubIds);
  const trainerIdSet = new Set(providerTrainerIds);

  return reviews.filter((review) => {
    if (review.clubId && clubIdSet.has(review.clubId)) {
      return true;
    }

    if (review.trainerId && trainerIdSet.has(review.trainerId)) {
      return true;
    }

    return false;
  });
}

/** Сводка KPI провайдера */
export function getProviderSummary(
  providerClubs: Club[],
  providerTrainers: Trainer[],
  providerBookings: Booking[],
  providerReviews: Review[],
): ProviderSummary {
  const publicationsCount = providerClubs.length + providerTrainers.length;
  const activeBookingsCount = providerBookings.length;
  const reviewsCount = providerReviews.length;

  const averageRating =
    reviewsCount > 0
      ? Math.round(
          (providerReviews.reduce((sum, review) => sum + review.rating, 0) / reviewsCount) * 10,
        ) / 10
      : 0;

  return {
    publicationsCount,
    activeBookingsCount,
    reviewsCount,
    averageRating,
  };
}
