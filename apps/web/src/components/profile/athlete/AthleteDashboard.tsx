// Dashboard спортсмена (Step 25.3): ближайшая тренировка, pending-countdown до auto-cancel, KPI.
//
// ⚠️ Фаза 38, шаг 38.25: секция «Мой рейтинг надёжности» вырезана вместе с механизмом
// (решение заказчика 15.09.2026). Счётчик посещений считается по записям напрямую;
// «первая запись ещё не сделана» — это ноль завершённых, а не порог бейджа.
//
// ⚠️ Фаза 35, этап Э0a: верхний баннер о санкциях за неявки убран вместе с самим
// механизмом. С ним ушёл и список пользователей во входных свойствах — он был нужен
// ровно затем, чтобы достать оттуда отметку о ручном послаблении.
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import {
  getAthleteActiveFutureBookings,
  getAthleteUpcomingProfileBookings,
  type UpcomingProfileBooking,
} from '@/components/profile/athlete-bookings';
import { Badge, Card } from '@/components/ui';
import { DISCIPLINE_CONFIG, getSlotStartAt } from '@sporthub/domain';
import {
  cabinetSectionPath,
  PERSONAL_CABINET_PATH,
  PERSONAL_CABINET_TITLE,
} from '@/lib/service-faces';
import { selectBookingActorUserId, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Schedule, Trainer } from '@sporthub/types';
import { findBookingSlot } from '@/lib/utils';

type AthleteDashboardProps = {
  bookings?: Booking[];
  clubs?: Club[];
  schedule?: Schedule[];
  trainers?: Trainer[];
};

/** Остаток мс до авто-отмены pending (1h до старта слота). Отрицательный — окно уже прошло.
 *
 * Момент начала берётся у общего помощника — того же, по которому авто-отмену считает
 * бэкенд. Своя копия формулы строила момент в поясе браузера: при смещении в четыре
 * часа отсчёт до часового окна показывал произвольное число, вплоть до «скоро» у
 * записи, до которой ещё сутки.
 */
function getAutoCancelRemainingMs(slot: Pick<Schedule, 'date' | 'startTime'>, now: Date): number {
  const startAt = getSlotStartAt(slot).getTime();
  const cancelAt = startAt - DISCIPLINE_CONFIG.pending.autoCancelHoursBeforeStart * 60 * 60 * 1000;

  return cancelAt - now.getTime();
}

/** User-friendly countdown в формате «Nч Mмин» или «Mмин». */
function formatRemaining(ms: number): string {
  if (ms <= 0) {
    return 'скоро';
  }

  const totalMinutes = Math.floor(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours > 0) {
    return `${hours}ч ${minutes}мин`;
  }

  return `${minutes}мин`;
}

export function AthleteDashboard({
  bookings = [],
  clubs = [],
  schedule = [],
  trainers = [],
}: AthleteDashboardProps) {
  const user = useAuthStore((state) => state.user);
  // ⚠️ Шаг 35.34. Номер берётся у вошедшего человека, а не у «типа учётной
  // записи — спортсмен»: типа больше нет, а записи и отзывы есть у всех.
  const athleteUserId = useAuthStore(selectBookingActorUserId);

  const athleteBookings = useMemo(
    () =>
      athleteUserId === null ? [] : bookings.filter((booking) => booking.userId === athleteUserId),
    [athleteUserId, bookings],
  );

  const upcomingProfileBookings = useMemo(
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

  const activeFutureBookings = useMemo(
    () =>
      getAthleteActiveFutureBookings({
        athleteUserId,
        bookings: athleteBookings,
      }),
    [athleteUserId, athleteBookings],
  );

  // Ближайшая подтверждённая тренировка — первая confirmed в отсортированном списке upcoming.
  const nextConfirmed: UpcomingProfileBooking | null = useMemo(() => {
    const confirmed = upcomingProfileBookings.find((item) => item.statusLabel === 'Подтверждена');

    return confirmed ?? null;
  }, [upcomingProfileBookings]);

  // Pending-записи для обратного отсчёта до auto-cancel.
  const pendingBookings = useMemo(() => {
    const scheduleById = new Map(schedule.map((slot) => [slot.id, slot]));
    const now = new Date();

    return athleteBookings
      .filter((booking) => booking.status === 'pending')
      .map((booking) => {
        const slot = findBookingSlot(booking, scheduleById);

        if (!slot) {
          return null;
        }

        return {
          id: booking.id,
          title: slot.title,
          date: slot.date,
          startTime: slot.startTime,
          endTime: slot.endTime,
          remainingMs: getAutoCancelRemainingMs(slot, now),
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);
  }, [athleteBookings, schedule]);

  const completedCount = athleteBookings.filter((booking) => booking.status === 'completed').length;
  const upcomingCount = activeFutureBookings.length;
  // Пока ни одного завершённого занятия — кабинет зовёт сделать первую запись.
  const hasHistory = completedCount > 0;

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Шапка: без истории — нейтральная «Сделайте первую запись», иначе — «Обзор». */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="outline">{PERSONAL_CABINET_TITLE}</Badge>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
              {hasHistory ? 'Обзор' : 'Сделайте первую запись'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {hasHistory
                ? `Привет, ${user.name}. Здесь сводка вашей активности на платформе.`
                : 'Выберите клуб или тренера — после первого завершённого занятия здесь появится сводка.'}
            </p>
            {/* Мета-инфо пользователя (Phase 26 Step 26.5 — перенос из удалённого монолита). */}
            <div className="mt-3 flex flex-wrap items-center gap-3 text-sm text-muted">
              {user.id != null ? (
                <span
                  data-testid="athlete-dashboard-account-id"
                  className="font-mono text-xs"
                >{`ID: #${user.id}`}</span>
              ) : null}
              <span data-testid="athlete-dashboard-city">
                {user.city ? `г. ${user.city}` : 'не указан'}
              </span>
            </div>
          </div>
        </div>

        {/* KPI: completed + upcoming. Для new-user показываем 0/0 нейтрально. */}
        <div className="mt-6 grid gap-3 sm:grid-cols-2" data-testid="athlete-dashboard-kpi">
          <div className="rounded-card border border-line bg-canvas p-4">
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Ближайшие записи
            </p>
            <p
              className="mt-3 text-3xl font-semibold text-ink"
              data-testid="athlete-dashboard-kpi-upcoming"
            >
              {upcomingCount}
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
              className="mt-3 text-3xl font-semibold text-ink"
              data-testid="athlete-dashboard-kpi-completed"
            >
              {completedCount}
            </p>
            <p className="mt-2 text-sm leading-relaxed text-muted">Завершённых занятий в истории</p>
          </div>
        </div>
      </Card>

      {/* Ближайшая тренировка (confirmed): карточка с временем и локацией. */}
      {nextConfirmed ? (
        <Card className="p-6 sm:p-8" data-testid="athlete-dashboard-next">
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Ближайшая тренировка
          </p>
          <h2 className="mt-2 font-display text-2xl font-semibold text-ink">
            {nextConfirmed.title}
          </h2>
          <p className="mt-1 text-sm text-muted">
            {nextConfirmed.timeLabel} · {nextConfirmed.locationLabel}
          </p>
          <p className="mt-1 text-xs text-muted">{nextConfirmed.bookingTypeLabel}</p>
        </Card>
      ) : null}

      {/* Pending-блок с обратным отсчётом до auto-cancel. */}
      {pendingBookings.length > 0 ? (
        <Card className="p-6 sm:p-8" data-testid="athlete-dashboard-pending">
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Ожидают подтверждения
          </p>
          <ul className="mt-4 flex flex-col gap-3">
            {pendingBookings.map((item) => (
              <li key={item.id} className="rounded-card border border-line bg-canvas p-4">
                <p className="text-base font-semibold text-ink">{item.title}</p>
                <p className="mt-1 text-sm text-muted">
                  {item.date} · {item.startTime}–{item.endTime}
                </p>
                <p className="mt-2 text-xs text-muted">
                  Осталось {formatRemaining(item.remainingMs)} до авто-отмены, если провайдер не
                  подтвердит.
                </p>
              </li>
            ))}
          </ul>
        </Card>
      ) : null}

      {/* Быстрые действия. */}
      <div className="flex flex-wrap gap-3">
        <Link
          href="/"
          className="inline-flex min-h-12 items-center justify-center rounded-pill bg-accent px-5 text-sm font-semibold text-ink transition-colors hover:bg-accent/90"
        >
          Найти тренировку
        </Link>
        <Link
          href={cabinetSectionPath(PERSONAL_CABINET_PATH, 'schedule')}
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Моё расписание
        </Link>
      </div>
    </div>
  );
}
