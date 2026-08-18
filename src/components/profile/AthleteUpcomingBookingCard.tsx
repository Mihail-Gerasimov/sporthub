'use client';

import { startTransition, useState } from 'react';
import { useRouter } from 'next/navigation';

import { Badge, Button, Modal } from '@/components/ui';
import { DISCIPLINE_CONFIG } from '@sporthub/domain';
import { formatDate } from '@/lib/utils';
import { useToastStore } from '@/stores/useToastStore';

import type { UpcomingProfileBooking } from '@/components/profile/athlete-bookings';

type AthleteUpcomingBookingCardProps = {
  athleteUserId: number | null;
  booking: UpcomingProfileBooking;
};

type BookingCancelResponse = {
  success: boolean;
  error?: string;
};

/** Phase 24 Step 24.14: client-side детектор late-cancel — покажет warning-модалку
 * до реального DELETE. Логика дублирует `computeCancelReason` сервера для UX, сервер
 * всё равно пересчитывает reason авторитетно.
 */
function isLateCancelPreview(booking: UpcomingProfileBooking, now: Date): boolean {
  const policy = booking.cancellationPolicySnapshot ?? 'free_until_24h';
  const freeUntilHours = DISCIPLINE_CONFIG.lateCancel.freeUntil[policy];
  if (!Number.isFinite(freeUntilHours)) return false;
  if (freeUntilHours === 0) return true;
  const startAt = new Date(`${booking.date}T${booking.startTime}:00`);
  const hoursBeforeStart = (startAt.getTime() - now.getTime()) / (1000 * 60 * 60);
  return hoursBeforeStart < freeUntilHours;
}

export function AthleteUpcomingBookingCard({
  athleteUserId,
  booking,
}: AthleteUpcomingBookingCardProps) {
  const router = useRouter();
  const addToast = useToastStore((state) => state.addToast);
  const [isCancelling, setIsCancelling] = useState(false);
  // Phase 24 Step 24.14: state для warning-модалки перед late-cancel.
  const [isLateWarnOpen, setIsLateWarnOpen] = useState(false);

  async function handleCancelBooking() {
    if (athleteUserId === null) {
      addToast({
        message: 'Не удалось определить пользователя для отмены записи',
        tone: 'error',
      });
      return;
    }

    setIsCancelling(true);

    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: athleteUserId,
        }),
      });
      const result = (await response.json()) as BookingCancelResponse;

      if (!response.ok || !result.success) {
        addToast({ message: result.error ?? 'Не удалось отменить запись', tone: 'error' });
        return;
      }

      addToast({
        message: 'Запись отменена. Блок ближайших занятий обновлён.',
        tone: 'success',
      });
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Ошибка при отмене записи', tone: 'error' });
    } finally {
      setIsCancelling(false);
    }
  }

  return (
    <div
      data-testid="athlete-upcoming-card"
      className="grid gap-4 rounded-card border border-line bg-canvas p-4 md:grid-cols-[1.2fr_1fr_auto]"
    >
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge tone="outline">{booking.bookingTypeLabel}</Badge>
          <Badge tone={booking.statusTone}>{booking.statusLabel}</Badge>
        </div>

        <p
          data-testid="athlete-upcoming-card-title"
          className="mt-4 text-xl font-semibold text-ink"
        >
          {booking.title}
        </p>

        <p className="mt-2 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
          Кто проводит
        </p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{booking.trainerName}</p>
      </div>

      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Дата и время</p>
        <p className="mt-2 text-base font-semibold text-ink">
          {formatDate(booking.date, {
            day: 'numeric',
            month: 'long',
          })}
        </p>
        <p className="mt-1 text-sm leading-relaxed text-muted">{booking.timeLabel}</p>

        <p className="mt-4 text-xs font-semibold uppercase tracking-[0.10em] text-muted">Место</p>
        <p className="mt-2 text-sm leading-relaxed text-muted">{booking.locationLabel}</p>
      </div>

      <div className="flex items-start md:justify-end">
        <Button
          loading={isCancelling}
          variant="outline"
          onClick={() => {
            // Phase 24 Step 24.14: если отмена late — показываем warning-модалку;
            // иначе отменяем сразу.
            if (isLateCancelPreview(booking, new Date())) {
              setIsLateWarnOpen(true);
              return;
            }
            void handleCancelBooking();
          }}
        >
          Отменить запись
        </Button>
      </div>
      <Modal open={isLateWarnOpen} onClose={() => setIsLateWarnOpen(false)} title="Поздняя отмена">
        <p className="text-sm leading-relaxed text-muted">
          Эта отмена будет засчитана как поздняя и снизит ваш рейтинг надёжности. Вы уверены, что
          хотите продолжить?
        </p>
        <div className="mt-5 flex flex-wrap justify-end gap-2">
          <Button variant="outline" onClick={() => setIsLateWarnOpen(false)}>
            Оставить запись
          </Button>
          <Button
            loading={isCancelling}
            onClick={() => {
              setIsLateWarnOpen(false);
              void handleCancelBooking();
            }}
          >
            Всё равно отменить
          </Button>
        </div>
      </Modal>
    </div>
  );
}
