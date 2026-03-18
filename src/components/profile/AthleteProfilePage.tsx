'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import { getDateKeyInTimeZone } from '@/lib/utils';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Review } from '@/types';

type AthleteProfilePageProps = {
  bookings?: Booking[];
  reviews?: Review[];
};

type AthleteSummary = {
  achievementsCount: number;
  completedVisitsCount: number;
  reviewsCount: number;
  upcomingBookingsCount: number;
};

function getUnlockedAchievementsCount({
  completedVisitsCount,
  reviews,
}: {
  completedVisitsCount: number;
  reviews: Review[];
}) {
  let unlockedCount = 0;
  const uniqueClubCount = new Set(
    reviews.flatMap((review) => (review.clubId ? [review.clubId] : [])),
  ).size;

  if (reviews.length >= 1) {
    unlockedCount += 1;
  }

  if (reviews.length >= 3) {
    unlockedCount += 1;
  }

  if (uniqueClubCount >= 2) {
    unlockedCount += 1;
  }

  if (completedVisitsCount >= 3) {
    unlockedCount += 1;
  }

  if (completedVisitsCount >= 10) {
    unlockedCount += 1;
  }

  return unlockedCount;
}

function getAthleteSummary({
  athleteUserId,
  bookings,
  reviews,
}: {
  athleteUserId: number | null;
  bookings: Booking[];
  reviews: Review[];
}): AthleteSummary {
  if (athleteUserId === null) {
    return {
      achievementsCount: 0,
      completedVisitsCount: 0,
      reviewsCount: 0,
      upcomingBookingsCount: 0,
    };
  }

  const todayDateKey = getDateKeyInTimeZone();
  const athleteBookings = bookings.filter((booking) => booking.userId === athleteUserId);
  const athleteReviews = reviews.filter((review) => review.userId === athleteUserId);
  const upcomingBookingsCount = athleteBookings.filter(
    (booking) =>
      booking.date >= todayDateKey &&
      (booking.status === 'confirmed' || booking.status === 'pending'),
  ).length;
  const completedVisitsCount = athleteBookings.filter(
    (booking) => booking.status === 'completed',
  ).length;

  return {
    achievementsCount: getUnlockedAchievementsCount({
      completedVisitsCount,
      reviews: athleteReviews,
    }),
    completedVisitsCount,
    reviewsCount: athleteReviews.length,
    upcomingBookingsCount,
  };
}

function AthleteAccessDeniedState() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);

  const message = isAuthenticated
    ? 'Ты вошёл как представитель спортивных услуг. Кабинет спортсмена недоступен.'
    : 'Кабинет спортсмена доступен только после входа.';

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <Badge tone="danger">Athlete only</Badge>
            {accountType === 'provider' ? <Badge tone="outline">Provider session</Badge> : null}
          </div>

          <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-ink">
            Доступ ограничен
          </h1>
          <p className="mt-4 text-base leading-8 text-muted">{message}</p>

          <div className="mt-8 flex flex-wrap gap-3">
            {!isAuthenticated ? (
              <Button
                onClick={() => {
                  openAuthModal();
                }}
              >
                Войти или зарегистрироваться
              </Button>
            ) : null}

            <Link
              href="/"
              className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
            >
              Вернуться на главную
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
}

export function AthleteProfilePage({ bookings = [], reviews = [] }: AthleteProfilePageProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const logout = useAuthStore((state) => state.logout);
  const cabinetConfig = getPersonalCabinetConfig(accountType);
  const athleteSummary = useMemo(
    () =>
      getAthleteSummary({
        athleteUserId,
        bookings,
        reviews,
      }),
    [athleteUserId, bookings, reviews],
  );

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AthleteAccessDeniedState />;
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">Athlete session</Badge>
                <Badge tone="outline">{cabinetConfig?.title ?? 'Кабинет спортсмена'}</Badge>
              </div>

              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-ink">
                Кабинет спортсмена
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-8 text-muted">
                Базовый athlete-only кабинет уже подключён к текущему auth-flow. Следующими шагами
                сюда будут добавляться сводка, предстоящие записи, ачивки и история.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Email
                  </p>
                  <p className="mt-3 text-base font-semibold text-ink">{user.email}</p>
                </div>

                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                    Телефон
                  </p>
                  <p className="mt-3 text-base font-semibold text-ink">
                    {user.phone ?? 'Будет добавлен позже'}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col items-end gap-3">
              <div
                role="img"
                aria-label={`Аватар ${user.name}`}
                className="flex size-20 items-center justify-center rounded-card border border-line bg-canvas text-2xl font-semibold uppercase text-ink"
              >
                {user.name.trim().charAt(0)}
              </div>

              <Button
                variant="outline"
                onClick={() => {
                  logout();
                }}
              >
                Выйти
              </Button>
            </div>
          </div>
        </Card>

        <Card className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8">
          <div className="sm:col-span-2">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                  Быстрая сводка
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  Профиль и активность
                </h2>
              </div>
              <Badge tone="outline">{cabinetConfig?.title}</Badge>
            </div>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Имя спортсмена
            </p>
            <p className="mt-3 text-lg font-semibold text-ink">{user.name}</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Ближайшие записи
            </p>
            <p
              data-testid="athlete-summary-upcoming"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.upcomingBookingsCount}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">Активных слотов в ближайшем плане</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
              Посещения
            </p>
            <p
              data-testid="athlete-summary-visits"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.completedVisitsCount}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">Завершённых занятий в истории</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Отзывы</p>
            <p
              data-testid="athlete-summary-reviews"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.reviewsCount}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">Оставленных отзывов в MVP</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">Ачивки</p>
            <p
              data-testid="athlete-summary-achievements"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.achievementsCount}
            </p>
            <p className="mt-2 text-sm leading-7 text-muted">
              Открытых MVP-достижений по текущей активности
            </p>
          </div>
        </Card>
      </div>
    </div>
  );
}
