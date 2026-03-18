'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { AthleteAchievementsSection } from '@/components/profile/AthleteAchievementsSection';
import { getAthleteAchievements } from '@/components/profile/athlete-achievements';
import { Badge, Button, Card } from '@/components/ui';
import { formatDate, getDateKeyInTimeZone } from '@/lib/utils';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Club, Review, Schedule, Trainer } from '@/types';

type AthleteProfilePageProps = {
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  schedule?: Schedule[];
  trainers?: Trainer[];
};

type AthleteSummary = {
  achievementsCount: number;
  completedVisitsCount: number;
  reviewsCount: number;
  upcomingBookingsCount: number;
};

type UpcomingProfileBooking = {
  id: number;
  clubName: string;
  date: string;
  startTime: string;
  statusLabel: string;
  title: string;
  trainerName: string;
};

const BOOKING_STATUS_LABELS: Record<Booking['status'], string> = {
  pending: 'Ожидает подтверждения',
  confirmed: 'Подтверждена',
  completed: 'Завершена',
  cancelled: 'Отменена',
};

function getUpcomingBookingsLabel(count: number) {
  const remainder10 = count % 10;
  const remainder100 = count % 100;

  if (remainder10 === 1 && remainder100 !== 11) {
    return `${count} активная запись`;
  }

  if (remainder10 >= 2 && remainder10 <= 4 && (remainder100 < 12 || remainder100 > 14)) {
    return `${count} активные записи`;
  }

  return `${count} активных записей`;
}

function getAthleteSummary({
  bookings,
  achievementsCount,
  reviews,
}: {
  bookings: Booking[];
  achievementsCount: number;
  reviews: Review[];
}): AthleteSummary {
  const todayDateKey = getDateKeyInTimeZone();
  const upcomingBookingsCount = bookings.filter(
    (booking) =>
      booking.date >= todayDateKey &&
      (booking.status === 'confirmed' || booking.status === 'pending'),
  ).length;
  const completedVisitsCount = bookings.filter((booking) => booking.status === 'completed').length;

  return {
    achievementsCount,
    completedVisitsCount,
    reviewsCount: reviews.length,
    upcomingBookingsCount,
  };
}

function getUpcomingProfileBookings({
  athleteUserId,
  bookings,
  clubs,
  schedule,
  trainers,
}: {
  athleteUserId: number | null;
  bookings: Booking[];
  clubs: Club[];
  schedule: Schedule[];
  trainers: Trainer[];
}): UpcomingProfileBooking[] {
  if (athleteUserId === null) {
    return [];
  }

  const todayDateKey = getDateKeyInTimeZone();
  const clubNames = new Map(clubs.map((club) => [club.id, club.name]));
  const trainerNames = new Map(trainers.map((trainer) => [trainer.id, trainer.name]));
  const scheduleItems = new Map(schedule.map((slot) => [slot.id, slot]));

  return bookings
    .filter(
      (booking) =>
        booking.userId === athleteUserId &&
        booking.date >= todayDateKey &&
        (booking.status === 'confirmed' || booking.status === 'pending'),
    )
    .map((booking) => {
      const slot = scheduleItems.get(booking.scheduleId);

      return {
        id: booking.id,
        clubName: clubNames.get(booking.clubId) ?? 'Клуб SportHub',
        date: booking.date,
        startTime: slot?.startTime ?? 'Время уточняется',
        statusLabel: BOOKING_STATUS_LABELS[booking.status],
        title: slot?.title ?? 'Занятие SportHub',
        trainerName: trainerNames.get(booking.trainerId) ?? 'Тренер SportHub',
      } satisfies UpcomingProfileBooking;
    })
    .sort((left, right) => {
      const leftTimestamp = `${left.date}T${left.startTime}`;
      const rightTimestamp = `${right.date}T${right.startTime}`;

      return leftTimestamp.localeCompare(rightTimestamp);
    });
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

export function AthleteProfilePage({
  bookings = [],
  clubs = [],
  reviews = [],
  schedule = [],
  trainers = [],
}: AthleteProfilePageProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const logout = useAuthStore((state) => state.logout);
  const cabinetConfig = getPersonalCabinetConfig(accountType);
  const athleteBookings = useMemo(
    () =>
      athleteUserId === null ? [] : bookings.filter((booking) => booking.userId === athleteUserId),
    [athleteUserId, bookings],
  );
  const athleteReviews = useMemo(
    () =>
      athleteUserId === null ? [] : reviews.filter((review) => review.userId === athleteUserId),
    [athleteUserId, reviews],
  );
  const athleteAchievements = useMemo(
    () =>
      getAthleteAchievements({
        athleteUserId,
        bookings: athleteBookings,
        reviews: athleteReviews,
      }),
    [athleteUserId, athleteBookings, athleteReviews],
  );
  const athleteSummary = useMemo(
    () =>
      getAthleteSummary({
        achievementsCount: athleteAchievements.filter((achievement) => achievement.unlocked).length,
        bookings: athleteBookings,
        reviews: athleteReviews,
      }),
    [athleteAchievements, athleteBookings, athleteReviews],
  );
  const upcomingBookings = useMemo(
    () =>
      getUpcomingProfileBookings({
        athleteUserId,
        bookings: athleteBookings,
        clubs,
        schedule,
        trainers,
      }),
    [athleteUserId, athleteBookings, clubs, schedule, trainers],
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
                Кабинет уже показывает сводку, ачивки и ближайшие записи из MVP-данных. Следующими
                шагами сюда будут добавляться история, избранное и пользовательские настройки.
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

        <AthleteAchievementsSection achievements={athleteAchievements} />

        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                Ближайший план
              </p>
              <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                Предстоящие записи
              </h2>
            </div>
            <Badge tone="outline">{getUpcomingBookingsLabel(upcomingBookings.length)}</Badge>
          </div>

          {upcomingBookings.length > 0 ? (
            <div className="mt-6 grid gap-4">
              {upcomingBookings.map((booking) => (
                <div
                  key={booking.id}
                  className="grid gap-4 rounded-card border border-line bg-canvas p-4 md:grid-cols-[1.3fr_0.9fr_auto]"
                >
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                      {booking.clubName}
                    </p>
                    <p className="mt-2 text-xl font-semibold text-ink">{booking.title}</p>
                    <p className="mt-2 text-sm leading-7 text-muted">{booking.trainerName}</p>
                  </div>

                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">
                      Дата и время
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {formatDate(booking.date, {
                        day: 'numeric',
                        month: 'long',
                      })}
                    </p>
                    <p className="mt-1 text-sm leading-7 text-muted">{booking.startTime}</p>
                  </div>

                  <div className="flex items-start md:justify-end">
                    <Badge tone="success">{booking.statusLabel}</Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-card border border-line bg-canvas p-5">
              <p className="text-sm leading-7 text-muted">
                Пока нет будущих записей. Новые бронирования появятся здесь после записи на занятия.
              </p>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
