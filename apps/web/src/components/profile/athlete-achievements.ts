import {
  CANCELLED_BOOKING_STATUSES,
  COMPLETED_BOOKING_STATUSES,
  zonedDateTime,
} from '@sporthub/domain';
import type { AthleteAchievementId, Booking, Review } from '@sporthub/types';

export type AthleteAchievement = {
  id: AthleteAchievementId;
  title: string;
  description: string;
  current: number;
  target: number;
  unlocked: boolean;
};

export type AthleteAchievementProgressSummary = {
  hasActiveBookingSignal: boolean;
  overallProgressPercent: number;
  unlockedAchievementsCount: number;
};

type GetAthleteAchievementsInput = {
  activeFutureBookingsCount?: number;
  athleteUserId: number | null;
  bookings: Booking[];
  reviews: Review[];
};

/**
 * Начало дня записи в миллисекундах. Момент строит общий помощник — по поясу зала.
 *
 * Раньше здесь стояла единственная во фронте явная привязка к UTC (`T00:00:00Z`).
 * На порядок и на окно «три занятия за семь дней» это не влияло: там важна только
 * разница между днями, а она одинакова в любом поясе. Но формула момента в проекте
 * одна, и исключений у неё быть не должно — иначе следующая правка снова разойдётся.
 */
function getDateValue(date: string) {
  return zonedDateTime(date, '00:00').getTime();
}

function getCompletedBookings(bookings: Booking[], athleteUserId: number | null) {
  if (athleteUserId === null) {
    return [];
  }

  return bookings
    .filter((booking) => booking.userId === athleteUserId && booking.status === 'completed')
    .sort((left, right) => {
      const leftTimestamp = getDateValue(left.date);
      const rightTimestamp = getDateValue(right.date);

      return leftTimestamp - rightTimestamp;
    });
}

function getBookingStreakWithoutCancellation(bookings: Booking[], athleteUserId: number | null) {
  // STUB: полноценный streak без отмен корректно заработает после post-MVP перехода
  // к soft-delete или явному lifecycle completed/cancelled. В текущем MVP с hard-delete
  // вычисление не должно ломать кабинет, а реальные данные обычно возвращают 0.
  if (athleteUserId === null) {
    return 0;
  }

  // Phase 24: streak проведённых тренировок — считаем от самых свежих назад, пока
  // не упрёмся в отмену. Переход на FSM-наборы: completed-like (проведение) vs
  // cancelled-like (отмена/отказ). no_show и unmarked в streak не учитываются —
  // это "прошло, но не проведено", нейтральный финал без положительного вклада.
  const bookingHistory = bookings
    .filter(
      (booking) =>
        booking.userId === athleteUserId &&
        (COMPLETED_BOOKING_STATUSES.has(booking.status) ||
          CANCELLED_BOOKING_STATUSES.has(booking.status)),
    )
    .sort((left, right) => {
      const leftTimestamp = getDateValue(left.date);
      const rightTimestamp = getDateValue(right.date);

      return rightTimestamp - leftTimestamp;
    });

  let streak = 0;

  for (const booking of bookingHistory) {
    if (booking.status === 'completed') {
      streak += 1;
      continue;
    }

    if (CANCELLED_BOOKING_STATUSES.has(booking.status)) {
      break;
    }

    // no_show / unmarked — нейтральные финалы, не ломают streak и не засчитываются.
  }

  return streak;
}

function getMaxCompletedBookingsWithinSevenDays(bookings: Booking[]) {
  if (bookings.length === 0) {
    return 0;
  }

  const bookingDates = bookings.map((booking) => getDateValue(booking.date));
  let maxCount = 0;

  for (let index = 0; index < bookingDates.length; index += 1) {
    const windowStart = bookingDates[index];
    const windowEnd = windowStart + 6 * 24 * 60 * 60 * 1000;
    const windowCount = bookingDates.filter(
      (bookingDate) => bookingDate >= windowStart && bookingDate <= windowEnd,
    ).length;

    if (windowCount > maxCount) {
      maxCount = windowCount;
    }
  }

  return maxCount;
}

function getOverallProgressPercent(achievements: AthleteAchievement[]) {
  const totalProgress = achievements.reduce((accumulator, achievement) => {
    return accumulator + achievement.current / achievement.target;
  }, 0);
  const totalUnits = achievements.length;

  if (totalUnits === 0) {
    return 0;
  }

  return Math.round((totalProgress / totalUnits) * 100);
}

export function getAthleteAchievements({
  activeFutureBookingsCount = 0,
  athleteUserId,
  bookings,
  reviews,
}: GetAthleteAchievementsInput): AthleteAchievement[] {
  const completedBookings = getCompletedBookings(bookings, athleteUserId);
  const athleteReviews =
    athleteUserId === null ? [] : reviews.filter((review) => review.userId === athleteUserId);
  const completedVisitsCount = completedBookings.length;
  const reviewsCount = athleteReviews.length;
  const bookingStreakWithoutCancellation = getBookingStreakWithoutCancellation(
    bookings,
    athleteUserId,
  );
  const maxCompletedWithinSevenDays = getMaxCompletedBookingsWithinSevenDays(completedBookings);
  const uniqueClubIds = new Set([
    ...completedBookings.map((booking) => booking.clubId),
    ...athleteReviews.flatMap((review) => (review.clubId ? [review.clubId] : [])),
  ]);
  const uniqueClubCount = uniqueClubIds.size;
  const achievements: AthleteAchievement[] = [];

  achievements.push({
    id: 'first-booking',
    title: 'Первая запись на тренировку',
    description: 'Сделать первую активную запись на тренировку.',
    current: Math.min(activeFutureBookingsCount, 1),
    target: 1,
    unlocked: activeFutureBookingsCount > 0,
  });

  achievements.push(
    {
      id: 'on-time',
      title: 'Вовремя',
      description: '5 посещений подряд без отмен.',
      current: Math.min(bookingStreakWithoutCancellation, 5),
      target: 5,
      unlocked: bookingStreakWithoutCancellation >= 5,
    },
    {
      id: 'week-without-skips',
      title: 'Неделя без пропусков',
      description: '3 занятия за 7 дней.',
      current: Math.min(maxCompletedWithinSevenDays, 3),
      target: 3,
      unlocked: maxCompletedWithinSevenDays >= 3,
    },
    {
      id: 'first-review',
      title: 'Первый отзыв',
      description: 'Оставить первый отзыв.',
      current: Math.min(reviewsCount, 1),
      target: 1,
      unlocked: reviewsCount >= 1,
    },
    {
      id: 'community-voice',
      title: 'Голос сообщества',
      description: 'Оставить 3 отзыва.',
      current: Math.min(reviewsCount, 3),
      target: 3,
      unlocked: reviewsCount >= 3,
    },
    {
      id: 'explorer',
      title: 'Исследователь',
      description: 'Открыть 2 разных клуба.',
      current: Math.min(uniqueClubCount, 2),
      target: 2,
      unlocked: uniqueClubCount >= 2,
    },
    {
      id: 'back-to-the-gym',
      title: 'Возвращение в зал',
      description: 'Завершить 3 занятия.',
      current: Math.min(completedVisitsCount, 3),
      target: 3,
      unlocked: completedVisitsCount >= 3,
    },
    {
      id: 'serious-about-sport',
      title: 'На спорте всерьёз',
      description: 'Завершить 10 занятий.',
      current: Math.min(completedVisitsCount, 10),
      target: 10,
      unlocked: completedVisitsCount >= 10,
    },
  );

  return achievements;
}

export function getAthleteAchievementProgressSummary({
  achievements,
  activeFutureBookingsCount,
}: {
  achievements: AthleteAchievement[];
  activeFutureBookingsCount: number;
}): AthleteAchievementProgressSummary {
  const hasActiveBookingSignal = activeFutureBookingsCount > 0;

  return {
    hasActiveBookingSignal,
    overallProgressPercent: getOverallProgressPercent(achievements),
    unlockedAchievementsCount: achievements.filter((achievement) => achievement.unlocked).length,
  };
}
