// Client-обёртка над AthleteFavoritesSection (Step 25.6). Читает авторизованного атлета
// из useAuthStore, считает favorites через существующий getAthleteFavorites, рендерит
// AthleteFavoritesSection. Access-gate дублирует паттерн Dashboard/Stats для автономности
// маршрута; финальная дедупликация — после Step 25.17.
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { AthleteFavoritesSection } from '@/components/profile/AthleteFavoritesSection';
import { getAthleteFavorites } from '@/components/profile/athlete-favorites';
import { Badge, Button, Card } from '@/components/ui';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Club, Review, Specialty, Trainer, User } from '@/types';

type AthleteFavoritesProps = {
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  trainers?: Trainer[];
  users?: User[];
  specialties?: Specialty[];
};

function AccessDeniedCard() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);

  const message = isAuthenticated
    ? 'Ты вошёл как представитель спортивных услуг. Избранное спортсмена недоступно.'
    : 'Избранное спортсмена доступно только после входа.';

  return (
    <Card className="p-6 sm:p-8">
      <div className="flex flex-wrap gap-2">
        <Badge tone="danger">Athlete only</Badge>
        {accountType === 'provider' ? <Badge tone="outline">Provider session</Badge> : null}
      </div>
      <h1 className="mt-5 font-display text-3xl font-semibold tracking-tight text-ink">
        Доступ ограничен
      </h1>
      <p className="mt-4 text-base leading-relaxed text-muted">{message}</p>
      <div className="mt-6 flex flex-wrap gap-3">
        {!isAuthenticated ? (
          <Button onClick={() => openAuthModal()}>Войти или зарегистрироваться</Button>
        ) : null}
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Вернуться на главную
        </Link>
      </div>
    </Card>
  );
}

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
    return <AccessDeniedCard />;
  }

  return (
    <AthleteFavoritesSection
      favoriteClubs={favorites.clubs}
      favoriteTrainers={favorites.trainers}
      specialties={specialties}
    />
  );
}
