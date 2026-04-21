// Клиентский компонент кабинета провайдера: auth-гейт, шапка, сводка, quick actions.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useRef, useState } from 'react';

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
import { mapClubToFormState, mapTrainerToFormState } from '@/lib/contracts/reverse-mapping';
import type { ClubFormState, TrainerFormState } from '@/lib/schemas/publish';
import { getPersonalCabinetConfig, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import { useUIStore } from '@/stores/useUIStore';
import type {
  Amenity,
  Booking,
  Club,
  EntityId,
  Offering,
  Review,
  Schedule,
  Specialty,
  Sport,
  Tag,
  Trainer,
  User,
  WorkFormat,
} from '@/types';

type ProviderProfilePageProps = {
  amenities?: Amenity[];
  bookings?: Booking[];
  clubs?: Club[];
  reviews?: Review[];
  schedule?: Schedule[];
  specialties?: Specialty[];
  sports?: Sport[];
  tags?: Tag[];
  trainers?: Trainer[];
  users?: User[];
  workFormats?: WorkFormat[];
};

type PublishModalMode = 'create' | 'edit';

type TrainerClubOption = {
  id: EntityId;
  name: string;
};

type ClubEditBootstrapResponse = {
  error?: string;
  success?: boolean;
  data?: {
    club?: Club;
    primaryOffering?: Offering | null;
    schedule?: Schedule[];
  };
};

type TrainerEditBootstrapResponse = {
  error?: string;
  success?: boolean;
  data?: {
    trainer?: Trainer;
    affiliatedClub?: Pick<Club, 'id' | 'name'> | null;
    primaryOffering?: Offering | null;
    schedule?: Schedule[];
  };
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
  amenities = [],
  bookings = [],
  clubs = [],
  reviews = [],
  schedule = [],
  specialties = [],
  sports = [],
  tags = [],
  trainers = [],
  users = [],
  workFormats = [],
}: ProviderProfilePageProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const logout = useAuthStore((state) => state.logout);
  const cabinetConfig = getPersonalCabinetConfig(accountType);
  const providerUserId = user?.id ?? null;
  const router = useRouter();

  // Состояние открытия и режима publish/edit модалок
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isTrainerModalOpen, setIsTrainerModalOpen] = useState(false);
  const [clubModalMode, setClubModalMode] = useState<PublishModalMode>('create');
  const [trainerModalMode, setTrainerModalMode] = useState<PublishModalMode>('create');
  const [clubEditEntityId, setClubEditEntityId] = useState<EntityId | null>(null);
  const [trainerEditEntityId, setTrainerEditEntityId] = useState<EntityId | null>(null);
  const [clubInitialData, setClubInitialData] = useState<ClubFormState | null>(null);
  const [trainerInitialData, setTrainerInitialData] = useState<TrainerFormState | null>(null);
  const [trainerEditClubOption, setTrainerEditClubOption] = useState<TrainerClubOption | null>(
    null,
  );
  const addToast = useToastStore((state) => state.addToast);
  const editBootstrapRequestIdRef = useRef(0);

  function handlePublishSuccess(message: string) {
    addToast({ message, tone: 'success' });
    startTransition(() => {
      router.refresh();
    });
  }

  /** Инвалидирует предыдущие bootstrap-запросы, чтобы поздний ответ не открыл устаревшую модалку. */
  function invalidatePendingEditBootstrap() {
    editBootstrapRequestIdRef.current += 1;
  }

  /** Полный сброс состояния модалки клуба к create-режиму. */
  function resetClubModalState() {
    setIsClubModalOpen(false);
    setClubModalMode('create');
    setClubEditEntityId(null);
    setClubInitialData(null);
  }

  /** Полный сброс состояния модалки тренера к create-режиму. */
  function resetTrainerModalState() {
    setIsTrainerModalOpen(false);
    setTrainerModalMode('create');
    setTrainerEditEntityId(null);
    setTrainerInitialData(null);
    setTrainerEditClubOption(null);
  }

  /** Открывает create-модалку клуба и одновременно отменяет возможный незавершённый edit-bootstrap. */
  function handleOpenCreateClubModal() {
    invalidatePendingEditBootstrap();
    setClubModalMode('create');
    setClubEditEntityId(null);
    setClubInitialData(null);
    setIsClubModalOpen(true);
  }

  /** Открывает create-модалку тренера и одновременно отменяет возможный незавершённый edit-bootstrap. */
  function handleOpenCreateTrainerModal() {
    invalidatePendingEditBootstrap();
    setTrainerModalMode('create');
    setTrainerEditEntityId(null);
    setTrainerInitialData(null);
    setTrainerEditClubOption(null);
    setIsTrainerModalOpen(true);
  }

  async function handleDeletePublication(entityType: 'club' | 'trainer', entityId: EntityId) {
    const endpoint = entityType === 'club' ? `/api/clubs/${entityId}` : `/api/trainers/${entityId}`;

    try {
      const response = await fetch(endpoint, { method: 'DELETE' });
      const result = await response.json();

      if (result.success) {
        addToast({ message: 'Публикация удалена', tone: 'success' });
        startTransition(() => {
          router.refresh();
        });
      } else {
        addToast({ message: result.error ?? 'Не удалось удалить публикацию', tone: 'error' });
      }
    } catch {
      addToast({ message: 'Ошибка при удалении публикации', tone: 'error' });
    }
  }

  /** Загружает bootstrap редактирования и открывает нужную модалку только после успешного ответа API. */
  async function handleEditPublication(entityType: 'club' | 'trainer', entityId: EntityId) {
    const requestId = editBootstrapRequestIdRef.current + 1;
    editBootstrapRequestIdRef.current = requestId;

    try {
      if (entityType === 'club') {
        const response = await fetch(`/api/clubs/${entityId}`);
        const result = (await response.json()) as ClubEditBootstrapResponse;

        if (requestId !== editBootstrapRequestIdRef.current) {
          return;
        }

        const club = result.data?.club;
        const primaryOffering = result.data?.primaryOffering;
        const schedule = result.data?.schedule;

        if (
          !response.ok ||
          result.success !== true ||
          !club ||
          !primaryOffering ||
          !Array.isArray(schedule)
        ) {
          addToast({
            message: result.error ?? 'Не удалось загрузить клуб для редактирования',
            tone: 'error',
          });
          return;
        }

        setClubModalMode('edit');
        setClubEditEntityId(entityId);
        setClubInitialData(mapClubToFormState(club, primaryOffering, schedule));
        setIsClubModalOpen(true);
        return;
      }

      const response = await fetch(`/api/trainers/${entityId}`);
      const result = (await response.json()) as TrainerEditBootstrapResponse;

      if (requestId !== editBootstrapRequestIdRef.current) {
        return;
      }

      const trainer = result.data?.trainer;
      const primaryOffering = result.data?.primaryOffering;
      const schedule = result.data?.schedule;

      if (
        !response.ok ||
        result.success !== true ||
        !trainer ||
        !primaryOffering ||
        !Array.isArray(schedule)
      ) {
        addToast({
          message: result.error ?? 'Не удалось загрузить тренера для редактирования',
          tone: 'error',
        });
        return;
      }

      setTrainerModalMode('edit');
      setTrainerEditEntityId(entityId);
      setTrainerInitialData(mapTrainerToFormState(trainer, primaryOffering, schedule));
      setTrainerEditClubOption(
        result.data?.affiliatedClub
          ? {
              id: result.data.affiliatedClub.id,
              name: result.data.affiliatedClub.name,
            }
          : null,
      );
      setIsTrainerModalOpen(true);
    } catch {
      if (requestId !== editBootstrapRequestIdRef.current) {
        return;
      }

      addToast({
        message: 'Ошибка при загрузке публикации для редактирования',
        tone: 'error',
      });
    }
  }

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
    () =>
      getProviderIncomingBookings({
        bookings,
        clubs,
        providerClubIds,
        providerTrainerIds,
        schedule,
        trainers,
        users,
      }),
    [bookings, clubs, providerClubIds, providerTrainerIds, schedule, trainers, users],
  );
  const providerReviews = useMemo(
    () => getProviderReviews(reviews, providerClubIds, providerTrainerIds),
    [reviews, providerClubIds, providerTrainerIds],
  );
  const summary = useMemo(
    () => getProviderSummary(providerClubs, providerTrainers, providerBookings, providerReviews),
    [providerClubs, providerTrainers, providerBookings, providerReviews],
  );
  const providerClubOptions = useMemo<TrainerClubOption[]>(
    () => providerClubs.map((club) => ({ id: club.id, name: club.name })),
    [providerClubs],
  );
  const trainerModalClubOptions = useMemo<TrainerClubOption[]>(() => {
    if (!trainerEditClubOption) {
      return providerClubOptions;
    }

    const optionAlreadyExists = providerClubOptions.some(
      (club) => club.id === trainerEditClubOption.id,
    );

    return optionAlreadyExists
      ? providerClubOptions
      : [...providerClubOptions, trainerEditClubOption];
  }, [providerClubOptions, trainerEditClubOption]);

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

              <div className="mt-5 flex flex-wrap items-baseline gap-3">
                <h1 className="font-display text-4xl font-semibold tracking-tight text-ink">
                  Кабинет представителя
                </h1>
                {user.id != null ? (
                  <span className="text-sm font-mono text-muted">ID: #{user.id}</span>
                ) : null}
              </div>
              <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted">
                Управляйте своими клубами и тренерами, отслеживайте записи и отзывы.
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
        <ProviderPublicationsSection
          clubs={providerClubs}
          trainers={providerTrainers}
          onEdit={handleEditPublication}
          onDelete={handleDeletePublication}
        />

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
                handleOpenCreateClubModal();
              }}
            >
              Опубликовать клуб
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                handleOpenCreateTrainerModal();
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
            resetClubModalState();
          }}
          onSuccess={handlePublishSuccess}
          userId={providerUserId}
          mode={clubModalMode}
          entityId={clubEditEntityId}
          initialData={clubInitialData}
          sports={sports}
          tags={tags}
          amenities={amenities}
        />
        <PublishTrainerModal
          open={isTrainerModalOpen}
          onClose={() => {
            resetTrainerModalState();
          }}
          onSuccess={handlePublishSuccess}
          clubs={trainerModalClubOptions}
          userId={providerUserId}
          mode={trainerModalMode}
          entityId={trainerEditEntityId}
          initialData={trainerInitialData}
          sports={sports}
          specialties={specialties}
          workFormats={workFormats}
        />
      </div>
      {/* Toast-уведомления рендерятся глобально через ToastStack в AppShell (Step 24.6). */}
    </div>
  );
}
