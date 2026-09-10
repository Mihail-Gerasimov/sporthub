// Client-обёртка над AthleteFavoritesSection (Step 25.6). Читает авторизованного атлета
// из useAuthStore, считает favorites через существующий getAthleteFavorites, рендерит
// AthleteFavoritesSection. Access-gate дублирует паттерн Dashboard/Stats для автономности
// маршрута; финальная дедупликация — после Step 25.17.
'use client';

import { useMemo } from 'react';

import { AthleteFavoritesSection } from '@/components/profile/AthleteFavoritesSection';
import { getAthleteFavorites } from '@/components/profile/athlete-favorites';
import { selectBookingActorUserId, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Review, Specialty, Trainer, User } from '@sporthub/types';

type AthleteFavoritesProps = {
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  trainers?: Trainer[];
  /** Избранные клубы человека — приходят с сервера ответом «кто я». */
  favoriteClubIds?: readonly number[];
  specialties?: Specialty[];
};

export function AthleteFavorites({
  bookings = [],
  clubs = [],
  reviews = [],
  trainers = [],
  favoriteClubIds = [],
  specialties = [],
}: AthleteFavoritesProps) {
  const user = useAuthStore((state) => state.user);
  // ⚠️ Шаг 35.34. Номер берётся у вошедшего человека, а не у «типа учётной
  // записи — спортсмен»: типа больше нет, а записи и отзывы есть у всех.
  const athleteUserId = useAuthStore(selectBookingActorUserId);

  const athleteBookings = useMemo(
    () =>
      athleteUserId === null ? [] : bookings.filter((booking) => booking.userId === athleteUserId),
    [bookings, athleteUserId],
  );

  const athleteReviews = useMemo(
    () =>
      athleteUserId === null ? [] : reviews.filter((review) => review.userId === athleteUserId),
    [reviews, athleteUserId],
  );

  const favorites = useMemo(
    () =>
      getAthleteFavorites({
        athleteUserId,
        bookings: athleteBookings,
        clubs,
        reviews: athleteReviews,
        trainers,
        favoriteClubIds,
      }),
    [athleteUserId, athleteBookings, clubs, athleteReviews, trainers, favoriteClubIds],
  );

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <AthleteFavoritesSection
      favoriteClubs={favorites.clubs}
      favoriteTrainers={favorites.trainers}
      specialties={specialties}
    />
  );
}
