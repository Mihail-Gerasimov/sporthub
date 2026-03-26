// Клиентский компонент кабинета провайдера: auth-гейт, шапка, сводка, quick actions.
'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

import {
  getProviderClubs,
  getProviderIncomingBookings,
  getProviderReviews,
  getProviderSummary,
  getProviderTrainers,
} from '@/components/profile/provider-helpers';
import { ProviderBookingsSection } from '@/components/profile/ProviderBookingsSection';
import { ProviderPublicationsSection } from '@/components/profile/ProviderPublicationsSection';
import { ProviderReviewsSection } from '@/components/profile/ProviderReviewsSection';
import { ProviderSettingsSection } from '@/components/profile/ProviderSettingsSection';
import { PublishClubModal } from '@/components/profile/PublishClubModal';
import { PublishTrainerModal } from '@/components/profile/PublishTrainerModal';
import { Badge, Button, Card } from '@/components/ui';
import { getPersonalCabinetConfig, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';
import type { Booking, Club, Review, Trainer } from '@/types';

type ProviderProfilePageProps = {
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  trainers?: Trainer[];
};

/** Состояние «Доступ ограничен» для неавторизованных или не-provider пользователей */
function ProviderAccessDeniedState() {
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);

  const message = isAuthenticated
    ? 'Ты вошёл как спортсмен. Кабинет представителя спортивных услуг недоступен.'
    : 'Кабинет представителя доступен только после входа.';

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-3xl flex-col gap-6">
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap gap-2">
            <Badge tone="danger">Provider only</Badge>
            {accountType === 'athlete' ? <Badge tone="outline">Athlete session</Badge> : null}
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

export function ProviderProfilePage({
  bookings = [],
  clubs = [],
  reviews = [],
  trainers = [],
}: ProviderProfilePageProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const cabinetConfig = getPersonalCabinetConfig(accountType);
  const providerUserId = user?.id ?? null;

  // Состояние открытия publish-модалок
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isTrainerModalOpen, setIsTrainerModalOpen] = useState(false);

  // Бизнес-данные провайдера
  const providerClubs = useMemo(
    () => (providerUserId !== null ? getProviderClubs(clubs, providerUserId) : []),
    [clubs, providerUserId],
  );
  const providerTrainers = useMemo(
    () => (providerUserId !== null ? getProviderTrainers(trainers, providerUserId) : []),
    [trainers, providerUserId],
  );
  const providerClubIds = useMemo(() => providerClubs.map((c) => c.id), [providerClubs]);
  const providerTrainerIds = useMemo(() => providerTrainers.map((t) => t.id), [providerTrainers]);
  const providerBookings = useMemo(
    () => getProviderIncomingBookings(bookings, providerClubIds, providerTrainerIds),
    [bookings, providerClubIds, providerTrainerIds],
  );
  const providerReviews = useMemo(
    () => getProviderReviews(reviews, providerClubIds, providerTrainerIds),
    [reviews, providerClubIds, providerTrainerIds],
  );
  const summary = useMemo(
    () => getProviderSummary(providerClubs, providerTrainers, providerBookings, providerReviews),
    [providerClubs, providerTrainers, providerBookings, providerReviews],
  );

  // Auth-гейт: не авторизован или не provider
  if (!isAuthenticated || accountType !== 'provider' || !user) {
    return <ProviderAccessDeniedState />;
  }

  return (
    <div className="min-h-screen px-6 py-8 sm:px-8 lg:px-12">
      <div className="mx-auto flex max-w-5xl flex-col gap-6">
        {/* Шапка профиля */}
        <Card className="p-6 sm:p-8">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="max-w-2xl">
              <div className="flex flex-wrap gap-2">
                <Badge tone="success">Provider session</Badge>
                <Badge tone="outline">{cabinetConfig?.title ?? 'Кабинет представителя'}</Badge>
              </div>

              <h1 className="mt-5 font-display text-4xl font-semibold tracking-tight text-ink">
                Кабинет представителя
              </h1>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
                Управляйте своими клубами и тренерами, отслеживайте записи и отзывы.
              </p>

              <div className="mt-6 grid gap-3 sm:grid-cols-2">
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

              <p className="text-sm font-semibold text-ink">{user.name}</p>

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

        {/* Сводка KPI */}
        <Card className="grid gap-4 p-6 sm:grid-cols-2 sm:p-8 lg:grid-cols-4">
          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Публикации
            </p>
            <p
              data-testid="provider-summary-publications"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {summary.publicationsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Клубов и тренеров</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Активные записи
            </p>
            <p
              data-testid="provider-summary-bookings"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {summary.activeBookingsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Входящих букингов</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Отзывы</p>
            <p
              data-testid="provider-summary-reviews"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {summary.reviewsCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">На ваши услуги</p>
          </div>

          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Рейтинг</p>
            <p
              data-testid="provider-summary-rating"
              className="mt-3 text-3xl font-semibold text-ink"
            >
              {summary.averageRating}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Средний балл отзывов</p>
          </div>
        </Card>

        {/* Мои публикации */}
        <ProviderPublicationsSection clubs={providerClubs} trainers={providerTrainers} />

        {/* Входящие записи */}
        <ProviderBookingsSection bookings={providerBookings} />

        {/* Отзывы на мои услуги */}
        <ProviderReviewsSection reviews={providerReviews} />

        {/* Настройки профиля */}
        <ProviderSettingsSection user={user} />

        {/* Быстрые действия */}
        <Card className="p-6 sm:p-8">
          <h2 className="font-display text-2xl font-semibold text-ink">Быстрые действия</h2>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Опубликуйте клуб или тренера, чтобы они появились на платформе.
          </p>

          <div className="mt-6 flex flex-wrap gap-3">
            <Button
              onClick={() => {
                setIsClubModalOpen(true);
              }}
            >
              Опубликовать клуб
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                setIsTrainerModalOpen(true);
              }}
            >
              Опубликовать тренера
            </Button>
          </div>
        </Card>

        {/* Publish-модалки */}
        <PublishClubModal
          open={isClubModalOpen}
          onClose={() => {
            setIsClubModalOpen(false);
          }}
        />
        <PublishTrainerModal
          open={isTrainerModalOpen}
          onClose={() => {
            setIsTrainerModalOpen(false);
          }}
          clubs={providerClubs.map((c) => ({ id: c.id, name: c.name }))}
        />
      </div>
    </div>
  );
}
