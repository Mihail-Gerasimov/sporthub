import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { BOOKING_STATUS_TONES } from '@/components/profile/booking-status-tone';
import type { BookingStatusTone } from '@/components/profile/booking-status-tone';
import { getBookingClubId, getBookingTrainerId, getDateKeyInTimeZone } from '@/lib/utils';
import type { Booking, Club, Schedule, Trainer } from '@sporthub/types';

export type UpcomingProfileBooking = {
  bookingTypeLabel: string;
  id: number;
  clubName: string;
  date: string;
  endTime: string;
  locationLabel: string;
  startTime: string;
  statusLabel: string;
  statusTone: BookingStatusTone;
  timeLabel: string;
  title: string;
  trainerName: string;
  /** Phase 24 Step 24.14: snapshot-policy booking'а — нужен для client-side late-cancel warning. */
  cancellationPolicySnapshot?: import('@sporthub/types').CancellationPolicy;
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

// Phase 24: лейблы для всех 8 значений BookingStatus.
// Временные тексты для новых FSM-статусов — финальная UX-формулировка в Step 24.13 (Reliability UI).
const BOOKING_STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  no_show: 'Не пришёл',
  unmarked: 'Не отмечено',
  rejected_by_provider: 'Отклонена провайдером',
  cancelled_by_athlete: 'Отменена вами',
  cancelled_by_provider: 'Отменена провайдером',
};

function getBookingTypeLabel(booking: Pick<Booking, 'ownerType' | 'clubId' | 'trainerId'>) {
  if (booking.ownerType === 'trainer') {
    return 'Услуга тренера';
  }

  if (booking.ownerType === 'club') {
    return 'Услуга клуба';
  }

  if (booking.clubId !== undefined) {
    return 'Услуга клуба';
  }

  if (booking.trainerId !== undefined) {
    return 'Услуга тренера';
  }

  return 'Занятие SportHub';
}

function getBookingTimeLabel(slot: Pick<Schedule, 'startTime' | 'endTime'> | undefined) {
  if (!slot?.startTime) {
    return 'Время уточняется';
  }

  if (!slot.endTime) {
    return slot.startTime;
  }

  return `${slot.startTime} - ${slot.endTime}`;
}

function getBookingLocationLabel({
  clubName,
  slot,
}: {
  clubName: string;
  slot: Pick<Schedule, 'room'> | undefined;
}) {
  if (!slot?.room) {
    return clubName;
  }

  return `${clubName} · ${slot.room}`;
}

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
      const clubName = clubNames.get(getBookingClubId(booking) ?? -1) ?? 'Клуб SportHub';

      return {
        bookingTypeLabel: getBookingTypeLabel(booking),
        id: booking.id,
        clubName,
        date: booking.date,
        endTime: slot?.endTime ?? '',
        locationLabel: getBookingLocationLabel({
          clubName,
          slot,
        }),
        startTime: slot?.startTime ?? 'Время уточняется',
        statusLabel: BOOKING_STATUS_LABELS[booking.status],
        statusTone: BOOKING_STATUS_TONES[booking.status],
        timeLabel: getBookingTimeLabel(slot),
        title: slot?.title ?? 'Занятие SportHub',
        trainerName: trainerNames.get(getBookingTrainerId(booking) ?? -1) ?? 'Тренер SportHub',
        ...(booking.cancellationPolicySnapshot
          ? { cancellationPolicySnapshot: booking.cancellationPolicySnapshot }
          : {}),
      } satisfies UpcomingProfileBooking;
    })
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });
}
