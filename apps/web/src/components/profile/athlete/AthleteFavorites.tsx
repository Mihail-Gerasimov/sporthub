// Client-обёртка над AthleteFavoritesSection (Step 25.6). Читает авторизованного атлета
// из useAuthStore, считает favorites через существующий getAthleteFavorites, рендерит
// AthleteFavoritesSection. Access-gate дублирует паттерн Dashboard/Stats для автономности
// маршрута; финальная дедупликация — после Step 25.17.
'use client';

import { useMemo } from 'react';

import { AthleteFavoritesSection } from '@/components/profile/AthleteFavoritesSection';
import { getAthleteFavorites } from '@/components/profile/athlete-favorites';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Booking, Club, Review, Specialty, Trainer, User } from '@sporthub/types';

type AthleteFavoritesProps = {
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  trainers?: Trainer[];
  users?: User[];
  specialties?: Specialty[];
};

export function AthleteFavorites({
  bookings = [],
  clubs = [],
  reviews = [],
  trainers = [],
  users = [],
  specialties = [],
}: AthleteFavoritesProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);

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
        users,
      }),
    [athleteUserId, athleteBookings, clubs, athleteReviews, trainers, users],
  );

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AccessDeniedCard requiredRole="athlete" />;
  }

  return (
    <AthleteFavoritesSection
      favoriteClubs={favorites.clubs}
      favoriteTrainers={favorites.trainers}
      specialties={specialties}
    />
  );
}
