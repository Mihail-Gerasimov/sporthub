import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  getAthleteAchievementProgressSummary,
  getAthleteAchievements,
} from '@/components/profile/athlete-achievements';
import type { AthleteAchievementId, Booking, Review } from '@sporthub/types';

const bookings: Booking[] = [
  {
    id: 1,
    createdAt: '2026-03-10T09:00:00.000Z',
    scheduleId: 1,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-10',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 900,
  },
  {
    id: 2,
    createdAt: '2026-03-11T09:00:00.000Z',
    scheduleId: 2,
    userId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    date: '2026-03-11',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 900,
  },
  {
    id: 3,
    createdAt: '2026-03-12T09:00:00.000Z',
    scheduleId: 3,
    userId: 1,
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    date: '2026-03-12',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1200,
  },
  {
    id: 4,
    createdAt: '2026-03-13T09:00:00.000Z',
    scheduleId: 4,
    userId: 1,
    clubId: 2,
    trainerId: 3,
    sportId: 2,
    date: '2026-03-13',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 1200,
  },
  {
    id: 5,
    createdAt: '2026-03-14T09:00:00.000Z',
    scheduleId: 5,
    userId: 1,
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    date: '2026-03-14',
    status: 'completed',
    paymentStatus: 'paid',
    totalPrice: 850,
  },
];

const reviews: Review[] = [
  {
    id: 1,
    createdAt: '2026-03-14T09:00:00.000Z',
    userId: 1,
    clubId: 1,
    rating: 5,
    text: 'Отзыв 1',
  },
  {
    id: 2,
    createdAt: '2026-03-15T09:00:00.000Z',
    userId: 1,
    clubId: 3,
    rating: 5,
    text: 'Отзыв 2',
  },
  {
    id: 3,
    createdAt: '2026-03-16T09:00:00.000Z',
    userId: 1,
    trainerId: 5,
    rating: 5,
    text: 'Отзыв 3',
  },
];

describe('getAthleteAchievements', () => {
  it('включает в union новый achievement id first-booking', () => {
    expectTypeOf<AthleteAchievementId>().toEqualTypeOf<
      | 'on-time'
      | 'week-without-skips'
      | 'first-booking'
      | 'first-review'
      | 'community-voice'
      | 'explorer'
      | 'back-to-the-gym'
      | 'serious-about-sport'
    >();
  });

  it('считает открытые и прогрессируемые ачивки по текущей активности', () => {
    const achievements = getAthleteAchievements({
      athleteUserId: 1,
      bookings,
      reviews,
    });

    expect(achievements.find((achievement) => achievement.id === 'on-time')).toMatchObject({
      unlocked: true,
      current: 5,
    });
    expect(
      achievements.find((achievement) => achievement.id === 'week-without-skips'),
    ).toMatchObject({
      unlocked: true,
      current: 3,
    });
    expect(achievements.find((achievement) => achievement.id === 'community-voice')).toMatchObject({
      unlocked: true,
      current: 3,
    });
    expect(
      achievements.find((achievement) => achievement.id === 'serious-about-sport'),
    ).toMatchObject({
      unlocked: false,
      current: 5,
      target: 10,
    });
  });

  it('добавляет live-progress от активной записи без смешивания completed-only достижений', () => {
    const achievements = getAthleteAchievements({
      athleteUserId: 1,
      bookings,
      reviews,
    });
    const achievementsWithActiveBooking = getAthleteAchievements({
      activeFutureBookingsCount: 1,
      athleteUserId: 1,
      bookings: [
        ...bookings,
        {
          id: 6,
          createdAt: '2026-03-18T09:00:00.000Z',
          scheduleId: 6,
          userId: 1,
          clubId: 3,
          trainerId: 5,
          sportId: 1,
          date: '2026-03-20',
          status: 'confirmed',
          paymentStatus: 'unpaid',
          totalPrice: 850,
        },
      ],
      reviews,
    });

    const summaryWithoutActiveBooking = getAthleteAchievementProgressSummary({
      achievements,
      activeFutureBookingsCount: 0,
    });
    const summaryWithActiveBooking = getAthleteAchievementProgressSummary({
      achievements: achievementsWithActiveBooking,
      activeFutureBookingsCount: 1,
    });

    expect(achievements.find((achievement) => achievement.id === 'first-booking')).toMatchObject({
      unlocked: false,
      current: 0,
      target: 1,
      title: 'Первая запись на тренировку',
    });
    expect(
      achievementsWithActiveBooking.find((achievement) => achievement.id === 'first-booking'),
    ).toMatchObject({
      unlocked: true,
      current: 1,
      target: 1,
      title: 'Первая запись на тренировку',
    });
    expect(summaryWithoutActiveBooking).toMatchObject({
      unlockedAchievementsCount: 6,
      overallProgressPercent: 81,
      hasActiveBookingSignal: false,
    });
    expect(summaryWithActiveBooking).toMatchObject({
      unlockedAchievementsCount: 7,
      overallProgressPercent: 94,
      hasActiveBookingSignal: true,
    });
  });

  it('без активности возвращает ачивки с нулевым прогрессом', () => {
    const achievements = getAthleteAchievements({
      athleteUserId: 1,
      bookings: [],
      reviews: [],
    });

    expect(achievements).toHaveLength(8);
    expect(achievements.every((achievement) => achievement.current === 0)).toBe(true);
    expect(achievements.every((achievement) => !achievement.unlocked)).toBe(true);
  });
});
