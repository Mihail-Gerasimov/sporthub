import { getBookingClubId, getBookingTrainerId, getDateKeyInTimeZone } from '@/lib/utils';
import type { Booking, Club, Schedule, Trainer } from '@/types';

export type UpcomingProfileBooking = {
  id: number;
  clubName: string;
  date: string;
  startTime: string;
  statusLabel: string;
  title: string;
  trainerName: string;
};

type GetAthleteActiveFutureBookingsInput = {
  athleteUserId: number | null;
  bookings: Booking[];
  todayDateKey?: string;
};

type GetAthleteUpcomingProfileBookingsInput = {
  athleteUserId: number | null;
  bookings: Booking[];
  clubs: Club[];
  schedule: Schedule[];
  trainers: Trainer[];
};

const ACTIVE_BOOKING_STATUSES = new Set<Booking['status']>(['confirmed', 'pending']);

const BOOKING_STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

export function getAthleteActiveFutureBookings({
  athleteUserId,
  bookings,
  todayDateKey = getDateKeyInTimeZone(),
}: GetAthleteActiveFutureBookingsInput): Booking[] {
  if (athleteUserId === null) {
    return [];
  }

  return bookings.filter(
    (booking) =>
      booking.userId === athleteUserId &&
      booking.date >= todayDateKey &&
      ACTIVE_BOOKING_STATUSES.has(booking.status),
  );
}

export function getAthleteUpcomingProfileBookings({
  athleteUserId,
  bookings,
  clubs,
  schedule,
  trainers,
}: GetAthleteUpcomingProfileBookingsInput): UpcomingProfileBooking[] {
  const activeFutureBookings = getAthleteActiveFutureBookings({
    athleteUserId,
    bookings,
  });

  if (activeFutureBookings.length === 0) {
    return [];
  }

  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  const scheduleItems = new Map(schedule.map((slot) => [slot.id, slot]));

  return activeFutureBookings
    .map((booking) => {
      const slot = scheduleItems.get(booking.scheduleId);

      return {
        id: booking.id,
        clubName: clubNames.get(getBookingClubId(booking) ?? -1) ?? 'Клуб SportHub',
        date: booking.date,
        startTime: slot?.startTime ?? 'Время уточняется',
        statusLabel: BOOKING_STATUS_LABELS[booking.status],
        title: slot?.title ?? 'Занятие SportHub',
        trainerName: trainerNames.get(getBookingTrainerId(booking) ?? -1) ?? 'Тренер SportHub',
      } satisfies UpcomingProfileBooking;
    })
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });
}
