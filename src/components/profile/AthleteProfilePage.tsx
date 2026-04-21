'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import { AthleteAchievementsSection } from '@/components/profile/AthleteAchievementsSection';
import { AthleteFeedbackSettingsSection } from '@/components/profile/AthleteFeedbackSettingsSection';
import { AthleteFavoritesSection } from '@/components/profile/AthleteFavoritesSection';
import { AthleteHistorySection } from '@/components/profile/AthleteHistorySection';
import { AthleteUpcomingBookingCard } from '@/components/profile/AthleteUpcomingBookingCard';
import {
  getAthleteActiveFutureBookings,
  getAthleteUpcomingProfileBookings,
} from '@/components/profile/athlete-bookings';
import {
  getAthleteAchievementProgressSummary,
  getAthleteAchievements,
} from '@/components/profile/athlete-achievements';
import { getAthleteFavorites } from '@/components/profile/athlete-favorites';
import { getAthleteHistoryItems } from '@/components/profile/athlete-history';
import { getAthleteReviewItems } from '@/components/profile/athlete-review-items';
import { Badge, Button, Card, ReliabilityBadge } from '@/components/ui';
import { computeAthleteReliability, isAthleteInQuarantine } from '@/lib/reliability';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Club, Review, Schedule, Specialty, Trainer, User } from '@/types';

type AthleteProfilePageProps = {
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  schedule?: Schedule[];
  /** Справочник специализаций для отображения в избранных тренерах */
  specialties?: Specialty[];
  trainers?: Trainer[];
  users?: User[];
};

type AthleteSummary = {
  achievementsCount: number;
  completedVisitsCount: number;
  reviewsCount: number;
  upcomingBookingsCount: number;
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
  upcomingBookingsCount,
  reviews,
}: {
  bookings: Booking[];
  achievementsCount: number;
  upcomingBookingsCount: number;
  reviews: Review[];
}): AthleteSummary {
  const completedVisitsCount = bookings.filter((booking) => booking.status === 'completed').length;

  return {
    achievementsCount,
    completedVisitsCount,
    reviewsCount: reviews.length,
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
          <p className="mt-4 text-base leading-relaxed text-muted">{message}</p>

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
  specialties = [],
  trainers = [],
  users = [],
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
  // Phase 24 Step 24.13: reliability атлета считается client-side на основе bookings.
  const athleteReliability = useMemo(
    () =>
      athleteUserId === null ? null : computeAthleteReliability(athleteBookings, athleteUserId),
    [athleteBookings, athleteUserId],
  );
  // Phase 24 Step 24.14: статус карантина — плашка сверху кабинета, если inQuarantine.
  // Step 24.15: учитываем админское снятие (User.quarantineLiftedAt).
  const athleteUser = useMemo(
    () => (athleteUserId === null ? null : (users.find((u) => u.id === athleteUserId) ?? null)),
    [users, athleteUserId],
  );
  const quarantineStatus = useMemo(
    () =>
      athleteUserId === null
        ? { inQuarantine: false as const }
        : isAthleteInQuarantine(athleteBookings, athleteUserId, new Date(), {
            quarantineLiftedAt: athleteUser?.quarantineLiftedAt ?? null,
          }),
    [athleteBookings, athleteUserId, athleteUser],
  );
  const athleteReviews = useMemo(
    () =>
      athleteUserId === null ? [] : reviews.filter((review) => review.userId === athleteUserId),
    [athleteUserId, reviews],
  );
  const activeFutureBookings = useMemo(
    () =>
      getAthleteActiveFutureBookings({
        athleteUserId,
        bookings: athleteBookings,
      }),
    [athleteUserId, athleteBookings],
  );
  const athleteAchievements = useMemo(
    () =>
      getAthleteAchievements({
        activeFutureBookingsCount: activeFutureBookings.length,
        athleteUserId,
        bookings: athleteBookings,
        reviews: athleteReviews,
      }),
    [activeFutureBookings.length, athleteUserId, athleteBookings, athleteReviews],
  );
  const athleteAchievementProgressSummary = useMemo(
    () =>
      getAthleteAchievementProgressSummary({
        achievements: athleteAchievements,
        activeFutureBookingsCount: activeFutureBookings.length,
      }),
    [activeFutureBookings.length, athleteAchievements],
  );
  const athleteSummary = useMemo(
    () =>
      getAthleteSummary({
        achievementsCount: athleteAchievementProgressSummary.unlockedAchievementsCount,
        bookings: athleteBookings,
        upcomingBookingsCount: activeFutureBookings.length,
        reviews: athleteReviews,
      }),
    [
      activeFutureBookings.length,
      athleteAchievementProgressSummary.unlockedAchievementsCount,
      athleteBookings,
      athleteReviews,
    ],
  );
  const upcomingBookings = useMemo(
    () =>
      getAthleteUpcomingProfileBookings({
        athleteUserId,
        bookings: athleteBookings,
        clubs,
        schedule,
        trainers,
      }),
    [athleteUserId, athleteBookings, clubs, schedule, trainers],
  );
  const historyItems = useMemo(
    () =>
      getAthleteHistoryItems({
        athleteUserId,
        bookings: athleteBookings,
        clubs,
        reviews: athleteReviews,
        schedule,
        trainers,
      }),
    [athleteUserId, athleteBookings, athleteReviews, clubs, schedule, trainers],
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
    [athleteUserId, athleteBookings, athleteReviews, clubs, trainers, users],
  );
  const reviewItems = useMemo(
    () =>
      getAthleteReviewItems({
        athleteUserId,
        clubs,
        reviews: athleteReviews,
        trainers,
      }),
    [athleteUserId, athleteReviews, clubs, trainers],
  );

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AthleteAccessDeniedState />;
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* Phase 24 Step 24.14: плашка карантина — сверху, если атлет в quarantine. */}
        {quarantineStatus.inQuarantine ? (
          <Card
            className="border-danger/40 bg-danger/10 p-5 sm:p-6"
            data-testid="athlete-quarantine-banner"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-danger">
                  Карантин
                </p>
                <p className="mt-2 text-lg font-semibold text-ink">
                  Вы временно не можете создавать новые записи
                </p>
                <p className="mt-2 text-sm leading-relaxed text-muted">
                  {quarantineStatus.reason ??
                    'Из-за повторных пропусков новые бронирования временно ограничены.'}
                </p>
                {quarantineStatus.until ? (
                  <p className="mt-1 text-sm text-muted">
                    Карантин действует до{' '}
                    <span className="font-semibold text-ink">
                      {new Date(quarantineStatus.until).toLocaleDateString('ru-RU', {
                        day: '2-digit',
                        month: 'long',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    .
                  </p>
                ) : null}
                <p className="mt-2 text-xs text-muted">
                  Репутация восстанавливается после первой успешно проведённой тренировки по
                  окончании карантина.
                </p>
              </div>
              <Badge tone="danger">Active</Badge>
            </div>
          </Card>
        ) : null}
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">Athlete session</Badge>
                <Badge tone="outline">{cabinetConfig?.title ?? 'Кабинет спортсмена'}</Badge>
              </div>

              <div className="mt-5 flex flex-wrap items-baseline gap-3">
                <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
                  Кабинет спортсмена
                </h1>
                {user.id != null ? (
                  <span className="text-sm font-mono text-muted">ID: #{user.id}</span>
                ) : null}
              </div>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
                Кабинет уже собран как цельная MVP-страница спортсмена: со сводкой, ачивками,
                историей, избранным и отзывами. Дальше пойдём в сценарий записи и подтверждения.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-3">
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Email
                  </p>
                  <p className="mt-3 text-base font-semibold text-ink">{user.email}</p>
                </div>

                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Телефон
                  </p>
                  <p className="mt-3 text-base font-semibold text-ink">
                    {user.phone ?? 'Будет добавлен позже'}
                  </p>
                </div>

                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Город
                  </p>
                  <p className="mt-3 text-base font-semibold text-ink">
                    {user.city ? `г. ${user.city}` : 'не указан'}
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
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
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
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Имя спортсмена
            </p>
            <p className="mt-3 text-lg font-semibold text-ink">{user.name}</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Ближайшие записи
            </p>
            <p
              data-testid="athlete-summary-upcoming"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.upcomingBookingsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Активных слотов в ближайшем плане
            </p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Посещения
            </p>
            <p
              data-testid="athlete-summary-visits"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.completedVisitsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Завершённых занятий в истории</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Отзывы</p>
            <p
              data-testid="athlete-summary-reviews"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.reviewsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Оставленных отзывов в MVP</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Ачивки</p>
            <p
              data-testid="athlete-summary-achievements"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {athleteSummary.achievementsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Открытых MVP-достижений по текущей активности
            </p>
          </div>
        </Card>

        <AthleteAchievementsSection
          achievements={athleteAchievements}
          progressSummary={athleteAchievementProgressSummary}
        />

        {/* Phase 24 Step 24.13: «Мой рейтинг надёжности».
            Показываем ReliabilityBadge атлета + числа completed/no_show/late_cancel.
            Для new user (completed<5) — плашка «Нужно ещё N записей до показа рейтинга». */}
        {athleteReliability ? (
          <Card className="p-6 sm:p-8" data-testid="athlete-reliability-section">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Надёжность
                </p>
                <h2 className="mt-2 font-display text-3xl font-semibold text-ink">
                  Мой рейтинг надёжности
                </h2>
              </div>
              <ReliabilityBadge reliability={athleteReliability} showDetails />
            </div>
            {athleteReliability.isNewUser ? (
              <p className="mt-4 text-sm leading-relaxed text-muted">
                Рейтинг покажется после {5 - athleteReliability.completedCount} успешных тренировок.
                Пока {athleteReliability.completedCount} завершённых из{' '}
                {athleteReliability.totalRelevant}.
              </p>
            ) : (
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Выполнено
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {Math.round(athleteReliability.completionRate * 100)}%
                  </p>
                  <p className="mt-1 text-xs text-muted">
                    {athleteReliability.completedCount} из {athleteReliability.totalRelevant}
                  </p>
                </div>
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Не пришёл
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {athleteReliability.noShowCount}
                  </p>
                  <p className="mt-1 text-xs text-muted">Фиксация провайдером</p>
                </div>
                <div className="rounded-card border border-line bg-canvas p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                    Поздняя отмена
                  </p>
                  <p className="mt-2 text-2xl font-semibold text-ink">
                    {athleteReliability.lateCancelCount}
                  </p>
                  <p className="mt-1 text-xs text-muted">Вне окна отмены</p>
                </div>
              </div>
            )}
          </Card>
        ) : null}

        <Card className="p-6 sm:p-8" data-testid="athlete-upcoming-section">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
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
                <AthleteUpcomingBookingCard
                  key={booking.id}
                  athleteUserId={athleteUserId}
                  booking={booking}
                />
              ))}
            </div>
          ) : (
            <div className="mt-6 rounded-card border border-line bg-canvas p-5">
              <p className="text-sm leading-relaxed text-muted">
                Пока нет будущих записей. Новые бронирования появятся здесь после записи на занятия.
              </p>
            </div>
          )}
        </Card>

        <AthleteHistorySection historyItems={historyItems} />

        <AthleteFavoritesSection
          favoriteClubs={favorites.clubs}
          favoriteTrainers={favorites.trainers}
          specialties={specialties}
        />

        <AthleteFeedbackSettingsSection
          accountTitle={cabinetConfig?.title ?? 'Кабинет спортсмена'}
          reviewItems={reviewItems}
          user={user}
        />

        {/* Toast-уведомления рендерятся глобально через ToastStack в AppShell (Step 24.6). */}
      </div>
    </div>
  );
}
