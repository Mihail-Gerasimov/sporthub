// Единый список bookings атлета (Step 25.4): фильтры по FSM-группе, группировка по неделям,
// drawer с таймлайном (AthleteBookingTimeline) и FSM-действиями (Cancel с late-warning,
// переход к публикации). Клиентский компонент — читает useAuthStore для athleteUserId.
'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { startTransition, useMemo, useState } from 'react';

import { AthleteBookingTimeline } from '@/components/profile/athlete/AthleteBookingTimeline';
import { BOOKING_STATUS_TONES } from '@/components/profile/booking-status-tone';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import { Badge, Button, Card, Modal } from '@/components/ui';
import {
  DISCIPLINE_CONFIG,
  getWeekStartKey,
  hoursUntilSlotStart,
  shiftDateKey,
} from '@sporthub/domain';
import { cn, findBookingSlot, formatDate } from '@/lib/utils';
import { selectAthleteActionUserId, useAuthStore } from '@/stores/useAuthStore';
import { useToastStore } from '@/stores/useToastStore';
import type { Booking, Club, Schedule, Sport, Trainer } from '@sporthub/types';
import { ATHLETE_BOOKING_STATUS_LABELS } from '@/components/profile/booking-status-labels';

type ScheduleFilter = 'all' | 'active' | 'completed' | 'cancelled';

interface AthleteScheduleProps {
  bookings?: Booking[];
  schedule?: Schedule[];
  clubs?: Club[];
  trainers?: Trainer[];
  sports?: Sport[];
}

type EnrichedBooking = {
  booking: Booking;
  slot?: Schedule;
  title: string;
  clubName: string;
  trainerName: string;
};

const FILTER_LABEL: Record<ScheduleFilter, string> = {
  all: 'Все',
  active: 'Активные',
  completed: 'Завершённые',
  cancelled: 'Отменённые',
};

/** FSM-группы — соответствуют визуальным табам. */
function inFilterGroup(status: Booking['status'], filter: ScheduleFilter): boolean {
  if (filter === 'all') {
    return true;
  }

  if (filter === 'active') {
    return status === 'pending' || status === 'confirmed';
  }

  if (filter === 'completed') {
    return status === 'completed' || status === 'no_show' || status === 'unmarked';
  }

  return (
    status === 'cancelled_by_athlete' ||
    status === 'cancelled_by_provider' ||
    status === 'rejected_by_provider'
  );
}

/**
 * Подпись диапазона недели: «1 июн — 7 июн».
 *
 * Обе границы — календарные дни, а не моменты: конец недели получается сдвигом ключа
 * на шесть суток, форматирование идёт по ключу. Прежняя версия строила полночь в поясе
 * браузера и возвращала её через `toISOString().slice(0, 10)` — то есть день в UTC.
 * Для любого пояса восточнее UTC (в том числе для нашей Самары) это всегда предыдущая
 * дата: заголовок недели показывал 31 мая вместо 1 июня.
 */
function formatWeekLabel(weekStart: string): string {
  const weekEnd = shiftDateKey(weekStart, 6);
  const options: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short' };

  return `${formatDate(weekStart, options)} — ${formatDate(weekEnd, options)}`;
}

/** client-side превью late-cancel (сервер пересчитывает авторитетно).
 *
 * Часы до начала считает общий помощник по поясу зала: своя формула строила момент
 * в поясе браузера и промахивалась мимо окна ровно на смещение пояса зрителя.
 */
function isLateCancel(
  slot: Pick<Schedule, 'date' | 'startTime'> | undefined,
  policy: Booking['cancellationPolicySnapshot'],
  now: Date,
): boolean {
  if (!slot) {
    return false;
  }

  const freeUntilHours = DISCIPLINE_CONFIG.lateCancel.freeUntil[policy ?? 'free_until_24h'];

  if (!Number.isFinite(freeUntilHours)) {
    return false;
  }

  if (freeUntilHours === 0) {
    return true;
  }

  return hoursUntilSlotStart(slot, now) < freeUntilHours;
}

export function AthleteSchedule({
  bookings = [],
  schedule = [],
  clubs = [],
  trainers = [],
}: AthleteScheduleProps) {
  // Phase 27 Step 27.8: auth-guard через useAuthStore — паттерн как в AthleteDashboard:160.
  // Без этого гость (без auth-cookie) видел пустой UI с фильтрами вместо AccessDeniedCard.
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const [filter, setFilter] = useState<ScheduleFilter>('all');
  const [openedBookingId, setOpenedBookingId] = useState<number | null>(null);

  const athleteBookings = useMemo(
    () =>
      athleteUserId === null ? [] : bookings.filter((booking) => booking.userId === athleteUserId),
    [bookings, athleteUserId],
  );

  const filtered = useMemo(
    () => athleteBookings.filter((booking) => inFilterGroup(booking.status, filter)),
    [athleteBookings, filter],
  );

  const scheduleById = useMemo(() => new Map(schedule.map((slot) => [slot.id, slot])), [schedule]);
  const clubById = useMemo(() => new Map(clubs.map((club) => [club.id, club])), [clubs]);
  const trainerById = useMemo(
    () => new Map(trainers.map((trainer) => [trainer.id, trainer])),
    [trainers],
  );

  const enriched = useMemo<EnrichedBooking[]>(
    () =>
      filtered
        .map((booking) => {
          const slot = findBookingSlot(booking, scheduleById);
          const clubName =
            (booking.clubId !== undefined ? clubById.get(booking.clubId)?.name : undefined) ?? '';
          const trainerName =
            (booking.trainerId !== undefined
              ? trainerById.get(booking.trainerId)?.name
              : undefined) ?? '';

          return {
            booking,
            slot,
            title: slot?.title ?? 'Занятие SportHub',
            clubName,
            trainerName,
          };
        })
        .sort((a, b) => b.booking.date.localeCompare(a.booking.date)),
    [filtered, scheduleById, clubById, trainerById],
  );

  // Группируем по неделям в порядке убывания (ближайшая → прошлые).
  const grouped = useMemo(() => {
    const map = new Map<string, EnrichedBooking[]>();

    enriched.forEach((item) => {
      const weekStart = getWeekStartKey(item.booking.date);
      const arr = map.get(weekStart);

      if (arr) {
        arr.push(item);
      } else {
        map.set(weekStart, [item]);
      }
    });

    return Array.from(map.entries()).sort(([a], [b]) => b.localeCompare(a));
  }, [enriched]);

  const opened = useMemo(() => {
    if (openedBookingId === null) {
      return null;
    }

    return athleteBookings.find((booking) => booking.id === openedBookingId) ?? null;
  }, [openedBookingId, athleteBookings]);

  const openedEnriched = useMemo(() => {
    if (!opened) {
      return null;
    }

    const slot = findBookingSlot(opened, scheduleById);
    const clubName =
      (opened.clubId !== undefined ? clubById.get(opened.clubId)?.name : undefined) ?? '';

    return {
      booking: opened,
      slot,
      title: slot?.title ?? 'Занятие SportHub',
      clubName,
    };
  }, [opened, scheduleById, clubById]);

  // Phase 27 Step 27.8: гость или чужая роль — AccessDeniedCard, как на 14 остальных подмаршрутах.
  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AccessDeniedCard requiredRole="athlete" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Фильтры по FSM-группе. */}
      <div className="flex flex-wrap gap-2">
        {(Object.keys(FILTER_LABEL) as ScheduleFilter[]).map((key) => (
          <button
            key={key}
            type="button"
            onClick={() => setFilter(key)}
            className={cn(
              'rounded-pill px-4 py-2 text-sm font-semibold transition-colors',
              filter === key
                ? 'bg-accent text-ink'
                : 'border border-line bg-panel text-ink hover:border-accent hover:text-accent',
            )}
          >
            {FILTER_LABEL[key]}
          </button>
        ))}
      </div>

      {enriched.length === 0 ? (
        <Card className="p-6 sm:p-8">
          <p className="text-base leading-relaxed text-muted">
            {filter === 'all'
              ? 'У вас нет записей. Найдите тренировку и запишитесь — она появится здесь.'
              : 'У вас нет записей по выбранному фильтру.'}
          </p>
        </Card>
      ) : (
        grouped.map(([weekStart, items]) => (
          <section key={weekStart} className="flex flex-col gap-3">
            <h3
              className="text-xs font-semibold uppercase tracking-[0.10em] text-muted"
              data-testid="athlete-schedule-week-header"
            >
              {formatWeekLabel(weekStart)}
            </h3>
            <ul className="flex flex-col gap-3">
              {items.map((item) => (
                <li key={item.booking.id}>
                  <BookingRow item={item} onOpen={() => setOpenedBookingId(item.booking.id)} />
                </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <AthleteBookingDrawer
        enrichedBooking={openedEnriched}
        onClose={() => setOpenedBookingId(null)}
      />
    </div>
  );
}

function BookingRow({ item, onOpen }: { item: EnrichedBooking; onOpen: () => void }) {
  const { booking, slot, title, clubName, trainerName } = item;

  return (
    <div className="grid gap-3 rounded-card border border-line bg-canvas p-4 md:grid-cols-[1.2fr_1fr_auto] md:items-center">
      <div>
        <div className="flex flex-wrap gap-2">
          <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
            {ATHLETE_BOOKING_STATUS_LABELS[booking.status]}
          </Badge>
        </div>
        <p className="mt-3 text-base font-semibold text-ink">{title}</p>
        <p className="mt-1 text-xs text-muted">{trainerName || clubName || 'Занятие SportHub'}</p>
      </div>
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Дата</p>
        <p className="mt-1 text-sm font-semibold text-ink">
          {formatDate(booking.date, { day: 'numeric', month: 'long' })}
        </p>
        {slot?.startTime ? (
          <p className="mt-1 text-xs text-muted">
            {slot.startTime}
            {slot.endTime ? ` – ${slot.endTime}` : ''}
          </p>
        ) : null}
      </div>
      <div className="flex items-start md:justify-end">
        <Button variant="outline" onClick={onOpen}>
          Детали
        </Button>
      </div>
    </div>
  );
}

function AthleteBookingDrawer({
  enrichedBooking,
  onClose,
}: {
  enrichedBooking: {
    booking: Booking;
    slot?: Schedule;
    title: string;
    clubName: string;
  } | null;
  onClose: () => void;
}) {
  const router = useRouter();
  const addToast = useToastStore((state) => state.addToast);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const [isLateWarnOpen, setIsLateWarnOpen] = useState(false);
  const [isCancelling, setIsCancelling] = useState(false);

  const open = enrichedBooking !== null;
  const booking = enrichedBooking?.booking ?? null;
  const slot = enrichedBooking?.slot;
  const title = enrichedBooking?.title ?? 'Запись';
  const clubName = enrichedBooking?.clubName ?? '';

  const canCancel = booking?.status === 'pending' || booking?.status === 'confirmed';

  async function performCancel() {
    if (!booking || athleteUserId === null) {
      addToast({ message: 'Не удалось определить пользователя для отмены', tone: 'error' });
      return;
    }

    setIsCancelling(true);
    try {
      const response = await fetch(`/api/bookings/${booking.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: athleteUserId }),
      });
      const result = (await response.json()) as { success: boolean; error?: string };

      if (!response.ok || !result.success) {
        addToast({ message: result.error ?? 'Не удалось отменить запись', tone: 'error' });
        return;
      }

      addToast({ message: 'Запись отменена.', tone: 'success' });
      onClose();
      startTransition(() => {
        router.refresh();
      });
    } catch {
      addToast({ message: 'Ошибка при отмене записи', tone: 'error' });
    } finally {
      setIsCancelling(false);
    }
  }

  function handleCancelClick() {
    if (!booking) {
      return;
    }

    if (isLateCancel(slot, booking.cancellationPolicySnapshot, new Date())) {
      setIsLateWarnOpen(true);
      return;
    }

    void performCancel();
  }

  return (
    <>
      <Modal open={open} onClose={onClose} title={title}>
        {booking ? (
          <div className="flex flex-col gap-5">
            <div className="flex flex-wrap gap-2">
              <Badge tone={BOOKING_STATUS_TONES[booking.status]}>
                {ATHLETE_BOOKING_STATUS_LABELS[booking.status]}
              </Badge>
            </div>
            {slot ? (
              <p className="text-sm text-muted">
                {formatDate(booking.date, { day: 'numeric', month: 'long' })} · {slot.startTime}
                {slot.endTime ? ` – ${slot.endTime}` : ''}
                {clubName ? ` · ${clubName}` : ''}
              </p>
            ) : null}

            <div>
              <h4 className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                История
              </h4>
              <div className="mt-3">
                <AthleteBookingTimeline history={booking.statusHistory ?? []} />
              </div>
            </div>

            <div className="flex flex-wrap gap-3">
              {canCancel ? (
                <Button variant="outline" loading={isCancelling} onClick={handleCancelClick}>
                  Отменить запись
                </Button>
              ) : null}
              {booking.clubId !== undefined ? (
                <Link
                  href={`/clubs/${booking.clubId}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Посмотреть клуб
                </Link>
              ) : null}
              {booking.trainerId !== undefined ? (
                <Link
                  href={`/trainers/${booking.trainerId}`}
                  className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
                >
                  Посмотреть тренера
                </Link>
              ) : null}
            </div>
          </div>
        ) : null}
      </Modal>

      {/* Warning при late-cancel — отдельная модалка поверх drawer'а. */}
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
              void performCancel();
            }}
          >
            Отменить всё равно
          </Button>
        </div>
      </Modal>
    </>
  );
}
