// Бизнес-логика провайдер-кабинета: фильтрация клубов, тренеров, букингов, отзывов и сводка.
import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { BOOKING_STATUS_TONES } from '@/components/profile/booking-status-tone';
import type { BookingStatusTone } from '@/components/profile/booking-status-tone';
import {
  findBookingSlot,
  getBookingClubId,
  getBookingTrainerId,
  getDateKeyInTimeZone,
  getScheduleClubId,
  getScheduleTrainerId,
} from '@/lib/utils';
import type { Booking, Club, Review, Schedule, Trainer, User } from '@sporthub/types';

/** Сводка KPI провайдера для дэшборда */
export type ProviderSummary = {
  publicationsCount: number;
  activeBookingsCount: number;
  reviewsCount: number;
  averageRating: number;
};

export type ProviderIncomingBooking = {
  athleteEmail: string;
  athleteName: string;
  /** Phase 24 Step 24.13: id атлета для резолва его reliability в UI. */
  athleteUserId: number;
  bookingTypeLabel: string;
  contextLabel: string;
  date: string;
  endTime: string;
  id: number;
  locationLabel: string;
  paymentLabel: string;
  startTime: string;
  statusLabel: string;
  statusTone: BookingStatusTone;
  timeLabel: string;
  title: string;
  totalPrice: number;
};

type GetProviderIncomingBookingsInput = {
  bookings: Booking[];
  clubs?: Club[];
  providerClubIds: number[];
  providerTrainerIds: number[];
  schedule?: Schedule[];
  todayDateKey?: string;
  trainers?: Trainer[];
  users?: User[];
};

// Phase 24: лейблы для всех 8 значений BookingStatus.
// Временные тексты для новых FSM-статусов — финальная UX-формулировка в Step 24.13 (Reliability UI).
const BOOKING_STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  no_show: 'Не пришёл',
  unmarked: 'Не отмечено',
  rejected_by_provider: 'Отклонена',
  cancelled_by_athlete: 'Отменена спортсменом',
  cancelled_by_provider: 'Отменена вами',
};

const PAYMENT_STATUS_LABELS: Record<Booking['paymentStatus'], string> = {
  paid: 'Оплачено',
  unpaid: 'Не оплачено',
  refunded: 'Возврат оформлен',
};

/** Возвращает короткую человекочитаемую метку типа входящей записи. */
function getProviderBookingTypeLabel(
  booking: Pick<Booking, 'ownerType' | 'clubId' | 'trainerId'>,
): string {
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

  return 'Запись SportHub';
}

/** Собирает строку времени слота в единый лейбл для карточки. */
function getProviderBookingTimeLabel(slot: Pick<Schedule, 'startTime' | 'endTime'> | undefined) {
  if (!slot?.startTime) {
    return 'Время уточняется';
  }

  if (!slot.endTime) {
    return slot.startTime;
  }

  return `${slot.startTime} - ${slot.endTime}`;
}

/** Возвращает краткий контекст «к кому / куда», чтобы не путать записи между публикациями. */
function getProviderBookingContextLabel({
  booking,
  clubName,
  trainerName,
}: {
  booking: Pick<Booking, 'ownerType' | 'trainerId'>;
  clubName: string;
  trainerName: string;
}) {
  if (booking.ownerType === 'trainer' || booking.trainerId !== undefined) {
    return clubName === 'Локация уточняется' ? trainerName : `${trainerName} · ${clubName}`;
  }

  return clubName;
}

/** Собирает строку локации слота: площадка и комната, если она есть. */
function getProviderBookingLocationLabel({
  clubName,
  slot,
  trainerName,
}: {
  clubName: string;
  slot: Pick<Schedule, 'room'> | undefined;
  trainerName: string;
}) {
  const baseLabel = clubName !== 'Локация уточняется' ? clubName : trainerName;

  if (!slot?.room) {
    return baseLabel;
  }

  return `${baseLabel} · ${slot.room}`;
}

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
  input: GetProviderIncomingBookingsInput,
): ProviderIncomingBooking[] {
  const {
    bookings,
    clubs = [],
    providerClubIds,
    providerTrainerIds,
    schedule = [],
    todayDateKey = getDateKeyInTimeZone(new Date()),
    trainers = [],
    users = [],
  } = input;
  const clubIdSet = new Set(providerClubIds);
  const trainerIdSet = new Set(providerTrainerIds);
  const clubById = new Map(clubs.map((club) => [club.id, club]));
  const trainerById = new Map(trainers.map((trainer) => [trainer.id, trainer]));
  const scheduleById = new Map(schedule.map((slot) => [slot.id, slot]));
  const userById = new Map(users.map((user) => [user.id, user]));

  return bookings
    .filter(
      (booking) => booking.date >= todayDateKey && ACTIVE_BOOKING_STATUSES.has(booking.status),
    )
    .filter((booking) => {
      const bookingClubId = getBookingClubId(booking);
      const bookingTrainerId = getBookingTrainerId(booking);

      if (bookingClubId !== null && clubIdSet.has(bookingClubId)) {
        return true;
      }

      if (bookingTrainerId !== null && trainerIdSet.has(bookingTrainerId)) {
        return true;
      }

      return false;
    })
    .map((booking) => {
      const slot = findBookingSlot(booking, scheduleById);
      const athlete = userById.get(booking.userId);
      const resolvedClubId = getBookingClubId(booking) ?? (slot ? getScheduleClubId(slot) : null);
      const resolvedTrainerId =
        getBookingTrainerId(booking) ?? (slot ? getScheduleTrainerId(slot) : null);
      const clubName =
        resolvedClubId !== null
          ? (clubById.get(resolvedClubId)?.name ?? 'Локация уточняется')
          : 'Локация уточняется';
      const trainerName =
        resolvedTrainerId !== null
          ? (trainerById.get(resolvedTrainerId)?.name ?? 'Тренер SportHub')
          : 'Тренер SportHub';
      const startTime = slot?.startTime ?? 'Время уточняется';

      return {
        athleteEmail: athlete?.email ?? 'Email уточняется',
        athleteName: athlete?.name ?? 'Спортсмен SportHub',
        athleteUserId: booking.userId,
        bookingTypeLabel: getProviderBookingTypeLabel(booking),
        contextLabel: getProviderBookingContextLabel({
          booking,
          clubName,
          trainerName,
        }),
        date: booking.date,
        endTime: slot?.endTime ?? '',
        id: booking.id,
        locationLabel: getProviderBookingLocationLabel({
          clubName,
          slot,
          trainerName,
        }),
        paymentLabel: PAYMENT_STATUS_LABELS[booking.paymentStatus],
        startTime,
        statusLabel: BOOKING_STATUS_LABELS[booking.status],
        statusTone: BOOKING_STATUS_TONES[booking.status],
        timeLabel: getProviderBookingTimeLabel(slot),
        title: slot?.title ?? 'Занятие SportHub',
        totalPrice: booking.totalPrice,
      } satisfies ProviderIncomingBooking;
    })
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
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
  providerBookings: ProviderIncomingBooking[],
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
