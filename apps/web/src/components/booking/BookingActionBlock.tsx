'use client';

/* Client action block для booking page: проверяет состояние записи и запускает MVP create-flow.
 *
 * ⚠️ Фаза 35, этап Э0a: плашка и заблокированная кнопка при санкциях за неявки убраны
 * вместе с самим механизмом — вход в запись больше ничем, кроме мест и уже созданной
 * записи, не ограничен. */

import Link from 'next/link';

import {
  cabinetSectionPath,
  DEFAULT_CABINET_SECTION,
  PERSONAL_CABINET_PATH,
} from '@/lib/service-faces';
import { startTransition, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Card } from '@/components/ui';
import { ACTIVE_BOOKING_STATUSES } from '@sporthub/domain';
import { BOOKING_REQUIRES_LOGIN } from '@/lib/auth-prompts';
import { selectBookingActorUserId, useAuthStore } from '@/stores/useAuthStore';
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
  const user = useAuthStore((state) => state.user);
  // ⚠️ Шаг 35.34. Записывается человек, а не «тип учётной записи». `null` —
  // гость либо служебная запись: у неё базового набора человека нет.
  const actorUserId = useAuthStore(selectBookingActorUserId);
  const addToast = useToastStore((state) => state.addToast);
  const [existingBookingId, setExistingBookingId] = useState<number | null>(null);
  const [isCheckingBookingState, setIsCheckingBookingState] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (actorUserId === null) {
      setExistingBookingId(null);
      setIsCheckingBookingState(false);
      return undefined;
    }

    let isCancelled = false;

    async function loadCurrentBookingState() {
      setIsCheckingBookingState(true);

      try {
        // ⚠️ Номера пользователя в адресе больше нет: маршрут отдаёт записи ТОГО,
        // КТО СПРАШИВАЕТ, и берёт его из сессии. Прежний параметр был
        // предъявлением личности — подставив чужой, читали чужие записи.
        const response = await fetch('/api/bookings');
        const result = (await response.json()) as BookingListResponse;

        if (!response.ok || !result.success) {
          if (!isCancelled) {
            setExistingBookingId(null);
          }
          return;
        }

        // Phase 27 Step 27.1: ищем только active-запись (pending/confirmed) на этом слоте.
        // Финальные статусы (cancelled_*, rejected_by_provider, completed, no_show, unmarked)
        // не блокируют повторную запись — записаться заново можно после отмены.
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
  }, [actorUserId, scheduleId]);

  const canBook = actorUserId !== null;
  const hasExistingBooking = existingBookingId !== null;
  const isFull = availableSpots <= 0;

  async function handleConfirmBooking() {
    if (actorUserId === null) {
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
        // Записывается тот, чья сессия: номер в теле сервер игнорирует,
        // и слать его — значит делать вид, что решение за клиентом.
        body: JSON.stringify({ scheduleId }),
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

    if (hasExistingBooking) {
      return (
        <Link
          href={cabinetSectionPath(PERSONAL_CABINET_PATH, DEFAULT_CABINET_SECTION)}
          className="inline-flex min-h-12 w-full items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent-strong"
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
        title: BOOKING_REQUIRES_LOGIN,
        description: 'Запись доступна вошедшему человеку — учётная запись у всех одна.',
      };
    }

    if (hasExistingBooking) {
      return {
        badgeTone: 'success' as const,
        badgeLabel: 'Слот подтверждён',
        title: 'Вы уже записаны на этот слот',
        description:
          'Повторное бронирование не требуется. Запись уже сохранена и отразится в личном кабинете.',
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
        className="sticky top-24 space-y-5 border-lime/30 p-5 shadow-floating sm:p-6"
        data-testid="booking-action-block"
        elevated
      >
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone={statusCopy.badgeTone}>{statusCopy.badgeLabel}</Badge>
            <Badge tone="outline">{ownerTypeLabel}</Badge>
          </div>

          <div>
            <p className="t-eyebrow text-lime-hov">Booking summary</p>
            <h2 className="mt-2 font-display text-2xl font-black text-ink">
              Подтверждение записи
            </h2>
            <p className="mt-2 text-sm leading-relaxed text-muted">{statusCopy.description}</p>
          </div>
        </div>

        <div className="rounded-card-lg border border-line bg-card-2 px-4 py-4">
          <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
            Выбранный слот
          </p>
          <p className="mt-2 text-base font-semibold text-ink">{slotTitle}</p>
          <p className="mt-2 text-sm text-muted">{ownerName}</p>
          <p className="mt-2 text-sm text-muted">
            {dateLabel}, {timeLabel}
          </p>
        </div>

        <div className="grid gap-3">
          <div className="rounded-card-lg border border-line bg-card-2 px-4 py-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
              Кто записывается
            </p>
            <p className="mt-2 text-base font-semibold text-ink">
              {canBook ? (user?.name ?? 'Без имени') : 'Гость'}
            </p>
            <p className="mt-1 text-sm text-muted">
              {canBook ? (user?.email ?? 'email не указан') : 'Авторизация нужна для booking-flow'}
            </p>
          </div>

          <div className="rounded-card-lg border border-line bg-card px-4 py-4">
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
