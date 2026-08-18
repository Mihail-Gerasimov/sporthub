'use client';

/* Client action block для booking page: проверяет состояние записи и запускает MVP create-flow. */

import Link from 'next/link';
import { startTransition, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ACTIVE_BOOKING_STATUSES } from '@/lib/booking-status';
import type { QuarantineResult } from '@/lib/reliability';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import { useUIStore } from '@/stores/useUIStore';

import type { Booking } from '@sporthub/types';

type BookingActionBlockProps = {
  scheduleId: number;
  slotTitle: string;
  ownerName: string;
  ownerTypeLabel: string;
  dateLabel: string;
  timeLabel: string;
  availableSpots: number;
  /**
   * Step 25.7: предварительно вычисленный quarantine-статус по athlete userId.
   * Server page считает `isAthleteInQuarantine` для всех athlete-пользователей
   * и передаёт Record. Client находит запись по своему athleteUserId; если есть
   * `inQuarantine=true` — показывает disabled CTA и плашку с датой `until`.
   */
  quarantineByUserId?: Record<number, QuarantineResult>;
};

function formatQuarantineUntil(iso: string): string {
  return new Date(iso).toLocaleDateString('ru-RU', {
    day: '2-digit',
    month: 'long',
  });
}

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

export function BookingActionBlock({
  scheduleId,
  slotTitle,
  ownerName,
  ownerTypeLabel,
  dateLabel,
  timeLabel,
  availableSpots,
  quarantineByUserId,
}: BookingActionBlockProps) {
  const router = useRouter();
  const openAuthModal = useUIStore((state) => state.openAuthModal);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const user = useAuthStore((state) => state.user);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const addToast = useToastStore((state) => state.addToast);
  const [existingBookingId, setExistingBookingId] = useState<number | null>(null);
  const [isCheckingBookingState, setIsCheckingBookingState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

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

        // Phase 27 Step 27.1: ищем только active-запись (pending/confirmed) на этом слоте.
        // Финальные статусы (cancelled_*, rejected_by_provider, completed, no_show, unmarked)
        // не блокируют повторную запись — атлет может записаться заново после отмены.
        const duplicateBooking =
          result.data?.find(
            (booking) =>
              booking.scheduleId === scheduleId && ACTIVE_BOOKING_STATUSES.has(booking.status),
          ) ?? null;

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

  // Step 25.7: quarantine-статус текущего athlete. Блокирует CTA — атлет не может
  // создать новую запись, пока окно активно.
  const quarantineStatus =
    athleteUserId !== null ? (quarantineByUserId?.[athleteUserId] ?? null) : null;
  const isQuarantined = quarantineStatus?.inQuarantine === true;

  async function handleConfirmBooking() {
    if (!athleteUserId) {
      openAuthModal();
      return;
    }

    setIsSubmitting(true);

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
        addToast({ message: result.error ?? 'Не удалось подтвердить запись', tone: 'error' });
        return;
      }

      setExistingBookingId(result.data.id);
      addToast({ message: 'Запись подтверждена. Слот закреплён за вами.', tone: 'success' });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Ошибка при подтверждении записи', tone: 'error' });
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
          href="/profile/athlete/dashboard"
          className="inline-flex min-h-12 w-full items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Перейти в ЛК
        </Link>
      );
    }

    if (isQuarantined) {
      return (
        <Button fullWidth disabled variant="outline">
          Вы в карантине
        </Button>
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

    if (isQuarantined) {
      return {
        badgeTone: 'danger' as const,
        badgeLabel: 'Карантин',
        title: 'Вы временно не можете создавать новые записи',
        description:
          quarantineStatus?.reason ??
          'Из-за повторных пропусков бронирования временно ограничены. Подождите окончания окна или дождитесь снятия карантина.',
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

        {isQuarantined && quarantineStatus?.until ? (
          <div
            className="rounded-card border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-ink"
            data-testid="booking-action-quarantine-notice"
          >
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-danger">
              Карантин
            </p>
            <p className="mt-2 text-sm font-semibold text-ink">
              Вы в карантине до {formatQuarantineUntil(quarantineStatus.until)}
            </p>
            {quarantineStatus.reason ? (
              <p className="mt-1 text-xs leading-relaxed text-muted">{quarantineStatus.reason}</p>
            ) : null}
          </div>
        ) : null}

        <div className="grid gap-3">
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

      {/* Toast-уведомления рендерятся глобально через ToastStack в AppShell (Step 24.6). */}
    </>
  );
}
