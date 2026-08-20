// Dashboard спортсмена (Step 25.3): ближайшая тренировка, pending-countdown до auto-cancel,
// reliability-секция (+ new-user placeholder), KPI, карантин-баннер (перенесён из корня).
'use client';

import Link from 'next/link';
import { useMemo } from 'react';

import {
  getAthleteActiveFutureBookings,
  getAthleteUpcomingProfileBookings,
  type UpcomingProfileBooking,
} from '@/components/profile/athlete-bookings';
import { Badge, Card, ReliabilityBadge } from '@/components/ui';
import { DISCIPLINE_CONFIG, getSlotStartAt } from '@sporthub/domain';
import { computeAthleteReliability, isAthleteInQuarantine } from '@sporthub/domain';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Booking, Club, Schedule, Trainer, User } from '@sporthub/types';

type AthleteDashboardProps = {
  bookings?: Booking[];
  clubs?: Club[];
  schedule?: Schedule[];
  trainers?: Trainer[];
  users?: User[];
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
  users = [],
}: AthleteDashboardProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const cabinetConfig = getPersonalCabinetConfig(accountType);

  const athleteBookings = useMemo(
    () =>
      athleteUserId === null ? [] : bookings.filter((booking) => booking.userId === athleteUserId),
    [athleteUserId, bookings],
  );

  const reliability = useMemo(
    () =>
      athleteUserId === null ? null : computeAthleteReliability(athleteBookings, athleteUserId),
    [athleteBookings, athleteUserId],
  );

  const athleteUser = useMemo(
    () => (athleteUserId === null ? null : (users.find((u) => u.id === athleteUserId) ?? null)),
    [users, athleteUserId],
  );

  const quarantineStatus = useMemo(
    () =>
      athleteUserId === null
        ? ({ inQuarantine: false } as const)
        : isAthleteInQuarantine(athleteBookings, athleteUserId, new Date(), {
            quarantineLiftedAt: athleteUser?.quarantineLiftedAt ?? null,
          }),
    [athleteBookings, athleteUserId, athleteUser],
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
        const slot = scheduleById.get(booking.scheduleId);

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

  const completedCount = reliability?.completedCount ?? 0;
  const upcomingCount = activeFutureBookings.length;
  const isNewUser = reliability?.isNewUser ?? true;

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AccessDeniedCard requiredRole="athlete" />;
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Карантин-баннер сверху (Phase 24 Step 24.14, смигрирован в Dashboard в 25.3). */}
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
            </div>
            <Badge tone="danger">Active</Badge>
          </div>
        </Card>
      ) : null}

      {/* Шапка: new-user → нейтральная «Сделайте первую запись», иначе — «Обзор». */}
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="outline">{cabinetConfig?.title ?? 'Кабинет спортсмена'}</Badge>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
              {isNewUser ? 'Сделайте первую запись' : 'Обзор'}
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              {isNewUser
                ? 'Выберите клуб или тренера — после первого завершённого занятия появятся метрики и рейтинг надёжности.'
                : `Привет, ${user.name}. Здесь сводка вашей активности на платформе.`}
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

      {/* Reliability-секция: для new-user — placeholder, иначе — ReliabilityBadge с деталями. */}
      {reliability ? (
        <Card className="p-6 sm:p-8" data-testid="athlete-dashboard-reliability">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-2xl font-semibold text-ink">Мой рейтинг надёжности</h2>
            {!reliability.isNewUser ? (
              <ReliabilityBadge reliability={reliability} showDetails />
            ) : null}
          </div>
          {reliability.isNewUser ? (
            <p className="mt-4 text-sm leading-relaxed text-muted">
              Рейтинг покажется после{' '}
              {DISCIPLINE_CONFIG.minCompletedForBadge - reliability.completedCount} успешных
              тренировок. Пока {reliability.completedCount} завершённых из{' '}
              {reliability.totalRelevant}.
            </p>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Completion rate
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {Math.round(reliability.completionRate * 100)}%
                </p>
                <p className="mt-1 text-xs text-muted">
                  {reliability.completedCount} из {reliability.totalRelevant}
                </p>
              </div>
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  No-show
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">{reliability.noShowCount}</p>
                <p className="mt-1 text-xs text-muted">Фиксация провайдером</p>
              </div>
              <div className="rounded-card border border-line bg-canvas p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                  Late cancel
                </p>
                <p className="mt-2 text-2xl font-semibold text-ink">
                  {reliability.lateCancelCount}
                </p>
                <p className="mt-1 text-xs text-muted">Вне окна отмены</p>
              </div>
            </div>
          )}
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
          href="/profile/athlete/schedule"
          className="inline-flex min-h-12 items-center justify-center rounded-pill border border-line bg-panel px-5 text-sm font-semibold text-ink transition-colors hover:border-accent hover:text-accent"
        >
          Моё расписание
        </Link>
      </div>
    </div>
  );
}
