import { findBookingSlot, getBookingClubId, getBookingTrainerId } from '@/lib/utils';
import type { Booking, Club, Review, Schedule, Trainer } from '@sporthub/types';

export type AthleteHistoryItem = {
  id: number;
  clubId: number | null;
  clubName: string;
  date: string;
  formatLabel: string;
  reviewStatusLabel: string;
  startTime: string;
  title: string;
  trainerName: string;
};

type GetAthleteHistoryItemsInput = {
  athleteUserId: number | null;
  bookings: Booking[];
  clubs: Club[];
  reviews: Review[];
  schedule: Schedule[];
  trainers: Trainer[];
};

function hasRelatedReview({
  athleteUserId,
  booking,
  reviews,
}: {
  athleteUserId: number | null;
  booking: Booking;
  reviews: Review[];
}) {
  if (athleteUserId === null) {
    return false;
  }

  return reviews.some(
    (review) =>
      review.userId === athleteUserId &&
      ((review.clubId !== undefined && review.clubId === booking.clubId) ||
        (review.trainerId !== undefined && review.trainerId === booking.trainerId)),
  );
}

function getHistoryFormatLabel(scheduleItem: Schedule | undefined) {
  if (scheduleItem?.capacity !== undefined && scheduleItem.capacity <= 2) {
    return 'Персональная тренировка';
  }

  return 'Групповое занятие';
}

export function getAthleteHistoryItems({
  athleteUserId,
  bookings,
  clubs,
  reviews,
  schedule,
  trainers,
}: GetAthleteHistoryItemsInput): AthleteHistoryItem[] {
  if (athleteUserId === null) {
    return [];
  }

  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  const scheduleItems = new Map(schedule.map((slot) => [slot.id, slot]));

  return bookings
    .filter((booking) => booking.userId === athleteUserId && booking.status === 'completed')
    .map((booking) => {
      const scheduleItem = findBookingSlot(booking, scheduleItems);
      const reviewStatusLabel = hasRelatedReview({
        athleteUserId,
        booking,
        reviews,
      })
        ? 'Отзыв уже оставлен'
        : 'Можно оставить отзыв';

      return {
        id: booking.id,
        clubId: getBookingClubId(booking),
        clubName: clubNames.get(getBookingClubId(booking) ?? -1) ?? 'Клуб',
        date: booking.date,
        formatLabel: getHistoryFormatLabel(scheduleItem),
        reviewStatusLabel,
        startTime: scheduleItem?.startTime ?? 'Время уточняется',
        title: scheduleItem?.title ?? 'Завершённое занятие',
        trainerName: trainerNames.get(getBookingTrainerId(booking) ?? -1) ?? 'Тренер',
      } satisfies AthleteHistoryItem;
    })
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return rightTimestamp.localeCompare(leftTimestamp);
    });
}
