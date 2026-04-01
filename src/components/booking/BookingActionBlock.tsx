'use client';

/* Client action block для booking page: проверяет состояние записи и запускает MVP create-flow. */

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { ActionNotice, Badge, Button, Card } from '@/components/ui';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { useUIStore } from '@/stores/useUIStore';

import type { Booking } from '@/types';

type BookingActionBlockProps = {
  scheduleId: number;
  slotTitle: string;
  ownerName: string;
  ownerTypeLabel: string;
  dateLabel: string;
  timeLabel: string;
  availableSpots: number;
};

type BookingListResponse = {
  success: boolean;
  data?: Booking[];
  error?: string;
};

type BookingCreateResponse = {
  success: boolean;
  data?: Booking;
  error?: string;
};

const ACTION_NOTICE_TIMEOUT_MS = 4000;

export function BookingActionBlock({
  scheduleId,
  slotTitle,
  ownerName,
  ownerTypeLabel,
  dateLabel,
  timeLabel,
  availableSpots,
}: BookingActionBlockProps) {
  const router = useRouter();
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const user = useAuthStore((state) => state.user);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const [existingBookingId, setExistingBookingId] = useState<number | null>(null);
  const [isCheckingBookingState, setIsCheckingBookingState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionNotice, setActionNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!actionNotice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setActionNotice(null);
    }, ACTION_NOTICE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [actionNotice]);

  useEffect(() => {
    if (!isAuthenticated || accountType !== 'athlete' || !athleteUserId) {
      setExistingBookingId(null);
      setIsCheckingBookingState(false);
      return undefined;
    }

    let isCancelled = false;

    async function loadCurrentBookingState() {
      setIsCheckingBookingState(true);

      try {
        const response = await fetch(`/api/bookings?userId=${athleteUserId}`);
        const result = (await response.json()) as BookingListResponse;

        if (!response.ok || !result.success) {
          if (!isCancelled) {
            setExistingBookingId(null);
          }
          return;
        }

        const duplicateBooking =
          result.data?.find((booking) => booking.scheduleId === scheduleId) ?? null;

        if (!isCancelled) {
          setExistingBookingId(duplicateBooking?.id ?? null);
        }
      } catch {
        if (!isCancelled) {
          setExistingBookingId(null);
        }
      } finally {
        if (!isCancelled) {
          setIsCheckingBookingState(false);
        }
      }
    }

    void loadCurrentBookingState();

    return () => {
      isCancelled = true;
    };
  }, [accountType, athleteUserId, isAuthenticated, scheduleId]);

  const isAthlete = isAuthenticated && accountType === 'athlete' && athleteUserId !== null;
  const hasExistingBooking = existingBookingId !== null;
  const isFull = availableSpots <= 0;

  async function handleConfirmBooking() {
    if (!athleteUserId) {
      openAuthModal();
      return;
    }

    setIsSubmitting(true);
    setActionNotice(null);

    try {
      const response = await fetch('/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId,
          userId: athleteUserId,
        }),
      });
      const result = (await response.json()) as BookingCreateResponse;

      if (!response.ok || !result.success || !result.data) {
        setActionNotice(result.error ?? 'Не удалось подтвердить запись');
        return;
      }

      setExistingBookingId(result.data.id);
      setActionNotice('Запись подтверждена. Слот закреплён за вами.');
      startTransition(() => {
        router.refresh();
      });
    } catch {
      setActionNotice('Ошибка при подтверждении записи');
    } finally {
      setIsSubmitting(false);
    }
  }

  function renderPrimaryAction() {
    if (!isAuthenticated) {
      return (
        <Button fullWidth onClick={openAuthModal}>
          Войти / Зарегистрироваться
        </Button>
      );
    }

    if (accountType !== 'athlete') {
      return (
        <Button fullWidth variant="outline" onClick={openAuthModal}>
          Сменить аккаунт
        </Button>
      );
    }

    if (hasExistingBooking) {
      return (
        <Link
          href="/profile/athlete"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Перейти в ЛК
        </Link>
      );
    }

    if (isFull) {
      return (
        <Button fullWidth disabled variant="outline">
          Мест нет
        </Button>
      );
    }

    return (
      <Button
        fullWidth
        loading={isSubmitting || isCheckingBookingState}
        onClick={() => {
          void handleConfirmBooking();
        }}
      >
        Подтвердить запись
      </Button>
    );
  }

  function renderStatusCopy() {
    if (!isAuthenticated) {
      return {
        badgeTone: 'danger' as const,
        badgeLabel: 'Нужна авторизация',
        title: 'Чтобы записаться, войдите как спортсмен',
        description: 'Запись в этом MVP-сценарии доступна только авторизованному athlete-аккаунту.',
      };
    }

    if (accountType !== 'athlete') {
      return {
        badgeTone: 'warning' as const,
        badgeLabel: 'Сессия провайдера',
        title: 'Текущий аккаунт не может записываться на занятия',
        description:
          'Для booking-flow нужен athlete-аккаунт. Переключите тип входа через auth-модалку.',
      };
    }

    if (hasExistingBooking) {
      return {
        badgeTone: 'success' as const,
        badgeLabel: 'Слот подтверждён',
        title: 'Вы уже записаны на этот слот',
        description:
          'Повторное бронирование не требуется. Запись уже сохранена и отразится в кабинете спортсмена.',
      };
    }

    if (isFull) {
      return {
        badgeTone: 'danger' as const,
        badgeLabel: 'Мест нет',
        title: 'Свободные места закончились',
        description:
          'Слот пока недоступен для новой записи. Обновите страницу позже или выберите другое занятие.',
      };
    }

    return {
      badgeTone: 'accent' as const,
      badgeLabel: 'Можно записаться',
      title: 'Подтвердите запись на выбранный слот',
      description: isCheckingBookingState
        ? 'Проверяем, нет ли у вас уже активной записи на это занятие.'
        : 'После подтверждения страница обновится через server-driven refresh без отдельного client-store.',
    };
  }

  const statusCopy = renderStatusCopy();

  return (
    <>
      <Card
        className="sticky top-6 space-y-5 p-6 sm:p-7"
        data-testid="booking-action-block"
        elevated
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusCopy.badgeTone}>{statusCopy.badgeLabel}</Badge>
            <Badge tone="outline">{ownerTypeLabel}</Badge>
          </div>

          <div>
            <h2 className="text-2xl font-semibold text-ink">Подтверждение записи</h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{statusCopy.description}</p>
          </div>
        </div>

        <div className="rounded-card border border-line bg-canvas px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
            Выбранный слот
          </p>
          <p className="mt-2 text-base font-semibold text-ink">{slotTitle}</p>
          <p className="mt-2 text-sm text-muted">{ownerName}</p>
          <p className="mt-2 text-sm text-muted">
            {dateLabel}, {timeLabel}
          </p>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-card border border-line bg-panel-strong px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
              Кто записывается
            </p>
            <p className="mt-2 text-base font-semibold text-ink">
              {isAthlete ? (user?.name ?? 'Athlete-аккаунт') : 'Гость'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {isAthlete
                ? (user?.email ?? 'email не указан')
                : 'Авторизация нужна для booking-flow'}
            </p>
          </div>

          <div className="rounded-card border border-line bg-panel px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
              Статус слота
            </p>
            <p className="mt-2 text-base font-semibold text-ink">
              {hasExistingBooking ? 'Уже забронирован вами' : `Свободно мест: ${availableSpots}`}
            </p>
            <p className="mt-1 text-sm text-muted">{statusCopy.title}</p>
          </div>
        </div>

        {renderPrimaryAction()}
      </Card>

      {actionNotice ? <ActionNotice message={actionNotice} /> : null}
    </>
  );
}
