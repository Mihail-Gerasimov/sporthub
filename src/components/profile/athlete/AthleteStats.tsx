// Stats атлета (Step 25.5): две секции — Достижения и Метрики. Достижения монтируют
// существующий AthleteAchievementsSection без изменений. Метрики — стрики, часы,
// активность помесячно, completionRate помесячно, FSM-разбивка, reliability с деталями.
// Всё считается на лету из bookings + schedule + reliability без хранимых snapshot'ов.
'use client';

import { useMemo, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AthleteAchievementsSection } from '@/components/profile/AthleteAchievementsSection';
import {
  getAthleteAchievementProgressSummary,
  getAthleteAchievements,
} from '@/components/profile/athlete-achievements';
import { getAthleteActiveFutureBookings } from '@/components/profile/athlete-bookings';
import { Badge, Card, ReliabilityBadge } from '@/components/ui';
import { computeCurrentStreak, computeMaxStreak } from '@/lib/athlete-streaks';
import { DISCIPLINE_CONFIG } from '@/lib/discipline-config';
import { computeAthleteReliability } from '@/lib/reliability';
import {
  getPersonalCabinetConfig,
  selectAthleteActionUserId,
  useAuthStore,
} from '@/stores/useAuthStore';
import { AccessDeniedCard } from '@/components/profile/AccessDeniedCard';
import type { Booking, Club, Review, Schedule, Sport, Trainer } from '@/types';

type StatsWindow = 12 | 'all';

export interface AthleteStatsProps {
  bookings?: Booking[];
  clubs?: Club[];
  trainers?: Trainer[];
  sports?: Sport[];
  reviews?: Review[];
  schedule?: Schedule[];
}

const FSM_SLICE_COLORS = {
  completed: 'var(--ui-success)',
  noShow: 'var(--ui-danger)',
  cancelled: 'var(--ui-warning)',
} as const;

const MONTH_LABEL_FORMATTER = new Intl.DateTimeFormat('ru-RU', {
  month: 'short',
  year: 'numeric',
});

/** YYYY-MM ключ месяца по ISO-дате YYYY-MM-DD. */
function getMonthKey(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/** Человекочитаемая подпись месяца для оси X (например, «апр. 2026»). */
function formatMonthLabel(monthKey: string): string {
  return MONTH_LABEL_FORMATTER.format(new Date(`${monthKey}-01T00:00:00`));
}

/** Подсчёт минут длительности слота из scheduleId. 0, если слот не найден. */
function getBookingMinutes(booking: Booking, scheduleById: Map<number, Schedule>): number {
  const slot = scheduleById.get(booking.scheduleId);

  return slot?.durationMinutes ?? 0;
}

/**
 * Генерирует последовательность YYYY-MM ключей между двумя датами (включительно).
 * Нужна для заполнения помесячных графиков «пустыми» месяцами, чтобы линия не рвалась.
 */
function generateMonthRange(startKey: string, endKey: string): string[] {
  if (startKey > endKey) {
    return [];
  }

  const result: string[] = [];
  let cursor = new Date(`${startKey}-01T00:00:00`);
  const end = new Date(`${endKey}-01T00:00:00`);

  while (cursor.getTime() <= end.getTime()) {
    const year = cursor.getFullYear();
    const month = String(cursor.getMonth() + 1).padStart(2, '0');

    result.push(`${year}-${month}`);
    cursor = new Date(cursor.getFullYear(), cursor.getMonth() + 1, 1);
  }

  return result;
}

export function AthleteStats({
  bookings = [],
  clubs = [],
  trainers = [],
  sports = [],
  reviews = [],
  schedule = [],
}: AthleteStatsProps) {
  const user = useAuthStore((state) => state.user);
  const accountType = useAuthStore((state) => state.accountType);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const athleteUserId = useAuthStore(selectAthleteActionUserId);
  const cabinetConfig = getPersonalCabinetConfig(accountType);

  const [windowSetting, setWindowSetting] = useState<StatsWindow>(12);

  const athleteBookings = useMemo(
    () =>
      athleteUserId === null ? [] : bookings.filter((booking) => booking.userId === athleteUserId),
    [bookings, athleteUserId],
  );

  const activeFutureBookings = useMemo(
    () => getAthleteActiveFutureBookings({ athleteUserId, bookings: athleteBookings }),
    [athleteUserId, athleteBookings],
  );

  const athleteReviews = useMemo(
    () =>
      athleteUserId === null ? [] : reviews.filter((review) => review.userId === athleteUserId),
    [reviews, athleteUserId],
  );

  const achievements = useMemo(
    () =>
      getAthleteAchievements({
        activeFutureBookingsCount: activeFutureBookings.length,
        athleteUserId,
        bookings: athleteBookings,
        reviews: athleteReviews,
      }),
    [activeFutureBookings.length, athleteUserId, athleteBookings, athleteReviews],
  );

  const progressSummary = useMemo(
    () =>
      getAthleteAchievementProgressSummary({
        achievements,
        activeFutureBookingsCount: activeFutureBookings.length,
      }),
    [achievements, activeFutureBookings.length],
  );

  const reliability = useMemo(
    () =>
      athleteUserId === null ? null : computeAthleteReliability(athleteBookings, athleteUserId),
    [athleteBookings, athleteUserId],
  );

  const currentStreak = useMemo(
    () => (athleteUserId === null ? 0 : computeCurrentStreak(athleteBookings, athleteUserId)),
    [athleteBookings, athleteUserId],
  );

  const maxStreak = useMemo(
    () => (athleteUserId === null ? 0 : computeMaxStreak(athleteBookings, athleteUserId)),
    [athleteBookings, athleteUserId],
  );

  const scheduleById = useMemo(() => new Map(schedule.map((slot) => [slot.id, slot])), [schedule]);
  const sportName = useMemo(() => new Map(sports.map((sport) => [sport.id, sport.name])), [sports]);
  const clubName = useMemo(() => new Map(clubs.map((club) => [club.id, club.name])), [clubs]);
  const trainerName = useMemo(
    () => new Map(trainers.map((trainer) => [trainer.id, trainer.name])),
    [trainers],
  );

  // Фильтр по окну: для 12-месячного окна берём начало-месяц 11 мес назад от текущего.
  const windowStartKey = useMemo<string | null>(() => {
    if (windowSetting === 'all') return null;

    const now = new Date();
    const windowStart = new Date(now.getFullYear(), now.getMonth() - 11, 1);
    const year = windowStart.getFullYear();
    const month = String(windowStart.getMonth() + 1).padStart(2, '0');

    return `${year}-${month}`;
  }, [windowSetting]);

  const windowedCompleted = useMemo(() => {
    return athleteBookings.filter((booking) => {
      if (booking.status !== 'completed') return false;
      if (windowStartKey === null) return true;

      return getMonthKey(booking.date) >= windowStartKey;
    });
  }, [athleteBookings, windowStartKey]);

  const totalMinutes = useMemo(
    () =>
      windowedCompleted.reduce((acc, booking) => acc + getBookingMinutes(booking, scheduleById), 0),
    [windowedCompleted, scheduleById],
  );

  const hoursBySport = useMemo(() => {
    const minutesBySport = new Map<number, number>();

    for (const booking of windowedCompleted) {
      const minutes = getBookingMinutes(booking, scheduleById);

      minutesBySport.set(booking.sportId, (minutesBySport.get(booking.sportId) ?? 0) + minutes);
    }

    return Array.from(minutesBySport.entries())
      .map(([sportId, minutes]) => ({
        sportName: sportName.get(sportId) ?? `Спорт #${sportId}`,
        hours: Math.round((minutes / 60) * 10) / 10,
      }))
      .sort((a, b) => b.hours - a.hours);
  }, [windowedCompleted, scheduleById, sportName]);

  const hoursByPartner = useMemo(() => {
    const minutesByPartner = new Map<string, number>();

    for (const booking of windowedCompleted) {
      const minutes = getBookingMinutes(booking, scheduleById);

      if (booking.trainerId !== undefined) {
        const key = `trainer:${booking.trainerId}`;

        minutesByPartner.set(key, (minutesByPartner.get(key) ?? 0) + minutes);

        continue;
      }

      if (booking.clubId !== undefined) {
        const key = `club:${booking.clubId}`;

        minutesByPartner.set(key, (minutesByPartner.get(key) ?? 0) + minutes);
      }
    }

    return Array.from(minutesByPartner.entries())
      .map(([key, minutes]) => {
        const [type, rawId] = key.split(':');
        const id = Number(rawId);
        const label =
          type === 'trainer'
            ? (trainerName.get(id) ?? `Тренер #${id}`)
            : (clubName.get(id) ?? `Клуб #${id}`);

        return {
          partner: label,
          hours: Math.round((minutes / 60) * 10) / 10,
        };
      })
      .sort((a, b) => b.hours - a.hours);
  }, [windowedCompleted, scheduleById, clubName, trainerName]);

  const monthlyActivity = useMemo(() => {
    if (windowedCompleted.length === 0) return [];

    const countsByMonth = new Map<string, number>();

    for (const booking of windowedCompleted) {
      const key = getMonthKey(booking.date);

      countsByMonth.set(key, (countsByMonth.get(key) ?? 0) + 1);
    }

    const sortedKeys = Array.from(countsByMonth.keys()).sort();
    const firstKey =
      windowStartKey !== null
        ? windowStartKey
        : (sortedKeys[0] ?? sortedKeys[sortedKeys.length - 1]);
    const lastKey = sortedKeys[sortedKeys.length - 1];

    if (!firstKey || !lastKey) return [];

    return generateMonthRange(firstKey, lastKey).map((key) => ({
      month: formatMonthLabel(key),
      count: countsByMonth.get(key) ?? 0,
    }));
  }, [windowedCompleted, windowStartKey]);

  // Месячный completionRate — (completed / (completed + no_show + late-cancel)) по месяцу booking.date.
  const monthlyCompletionRate = useMemo(() => {
    const countsByMonth = new Map<string, { completed: number; relevant: number }>();

    for (const booking of athleteBookings) {
      if (booking.status !== 'completed' && booking.status !== 'no_show') {
        if (!(booking.status === 'cancelled_by_athlete' && booking.cancelReason === 'late')) {
          continue;
        }
      }

      const key = getMonthKey(booking.date);

      if (windowStartKey !== null && key < windowStartKey) continue;

      const entry = countsByMonth.get(key) ?? { completed: 0, relevant: 0 };

      if (booking.status === 'completed') {
        entry.completed += 1;
      }
      entry.relevant += 1;
      countsByMonth.set(key, entry);
    }

    return Array.from(countsByMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { completed, relevant }]) => ({
        month: formatMonthLabel(key),
        rate: relevant === 0 ? 0 : Math.round((completed / relevant) * 100),
      }));
  }, [athleteBookings, windowStartKey]);

  // FSM-разбивка — общая по всей истории атлета (не зависит от окна).
  const fsmBreakdown = useMemo(() => {
    let completed = 0;
    let noShow = 0;
    let cancelled = 0;

    for (const booking of athleteBookings) {
      if (booking.status === 'completed') completed += 1;
      else if (booking.status === 'no_show') noShow += 1;
      else if (
        booking.status === 'cancelled_by_athlete' ||
        booking.status === 'cancelled_by_provider' ||
        booking.status === 'rejected_by_provider'
      ) {
        cancelled += 1;
      }
    }

    return { completed, noShow, cancelled };
  }, [athleteBookings]);

  const fsmPieData = useMemo(
    () =>
      [
        { name: 'Завершённые', value: fsmBreakdown.completed, fill: FSM_SLICE_COLORS.completed },
        { name: 'Неявки', value: fsmBreakdown.noShow, fill: FSM_SLICE_COLORS.noShow },
        { name: 'Отменённые', value: fsmBreakdown.cancelled, fill: FSM_SLICE_COLORS.cancelled },
      ].filter((slice) => slice.value > 0),
    [fsmBreakdown],
  );

  const hasAnyBookings = athleteBookings.length > 0;

  if (!isAuthenticated || accountType !== 'athlete' || !user) {
    return <AccessDeniedCard requiredRole="athlete" />;
  }

  const totalHours = Math.round((totalMinutes / 60) * 10) / 10;

  return (
    <div className="flex flex-col gap-6">
      <Card className="p-6 sm:p-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <div className="flex flex-wrap gap-2">
              <Badge tone="outline">{cabinetConfig?.title ?? 'Кабинет спортсмена'}</Badge>
            </div>
            <h1 className="mt-4 font-display text-3xl font-semibold tracking-tight text-ink">
              Статистика и достижения
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-muted">
              Ваши стрики, часы на тренировках, месячная активность и рейтинг надёжности в одном
              месте.
            </p>
          </div>
        </div>
      </Card>

      {/* Секция 1: Достижения. */}
      <section data-testid="athlete-stats-achievements">
        <AthleteAchievementsSection achievements={achievements} progressSummary={progressSummary} />
      </section>

      {/* Секция 2: Метрики либо empty-плашка, если у атлета нет никаких записей. */}
      {hasAnyBookings ? (
        <section className="flex flex-col gap-6" data-testid="athlete-stats-metrics">
          {/* Toggle окна: 12 мес ↔ всё время. */}
          <Card className="p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Окно</p>
                <p className="mt-1 text-sm text-ink">
                  Часы, активность и completion rate — за выбранный период.
                </p>
              </div>
              <div className="flex gap-2" role="group" aria-label="Выбор окна статистики">
                <button
                  type="button"
                  aria-pressed={windowSetting === 12}
                  onClick={() => setWindowSetting(12)}
                  className={
                    windowSetting === 12
                      ? 'rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-panel'
                      : 'rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent'
                  }
                >
                  12 мес
                </button>
                <button
                  type="button"
                  aria-pressed={windowSetting === 'all'}
                  onClick={() => setWindowSetting('all')}
                  className={
                    windowSetting === 'all'
                      ? 'rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-panel'
                      : 'rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent'
                  }
                >
                  Всё время
                </button>
              </div>
            </div>
          </Card>

          {/* KPI: стрики + часы. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Текущий стрик
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="athlete-stats-streak-current"
              >
                {currentStreak}
              </p>
              <p className="mt-2 text-xs text-muted">Недель подряд с тренировками</p>
            </div>
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Максимальный стрик
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="athlete-stats-streak-max"
              >
                {maxStreak}
              </p>
              <p className="mt-2 text-xs text-muted">Лучшая серия недель за всё время</p>
            </div>
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Всего часов
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="athlete-stats-total-hours"
              >
                {totalHours}
              </p>
              <p className="mt-2 text-xs text-muted">В выбранном окне</p>
            </div>
          </div>

          {/* Часы по видам спорта. */}
          <Card className="flex flex-col gap-3 p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold text-ink">Часы по видам спорта</h3>
            {hoursBySport.length === 0 ? (
              <p className="text-sm text-muted">Нет данных за выбранный период</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hoursBySport}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
                  <XAxis
                    dataKey="sportName"
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ui-panel)',
                      border: '1px solid var(--ui-line)',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="hours" name="Часы" fill="var(--ui-teal)" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Часы по клубам/тренерам. */}
          <Card className="flex flex-col gap-3 p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold text-ink">
              Часы по клубам и тренерам
            </h3>
            {hoursByPartner.length === 0 ? (
              <p className="text-sm text-muted">Нет данных за выбранный период</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={hoursByPartner} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
                  <XAxis
                    type="number"
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="partner"
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                    width={120}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ui-panel)',
                      border: '1px solid var(--ui-line)',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                  <Bar dataKey="hours" name="Часы" fill="var(--ui-accent)" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Активность по месяцам. */}
          <Card className="flex flex-col gap-3 p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold text-ink">Активность по месяцам</h3>
            {monthlyActivity.length === 0 ? (
              <p className="text-sm text-muted">Нет данных за выбранный период</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <LineChart data={monthlyActivity}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                  />
                  <YAxis
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                    allowDecimals={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ui-panel)',
                      border: '1px solid var(--ui-line)',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                  <Line
                    type="monotone"
                    dataKey="count"
                    name="Завершённые"
                    stroke="var(--ui-teal)"
                    strokeWidth={2}
                    dot={{ r: 4, fill: 'var(--ui-teal)' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Completion rate помесячно. */}
          <Card className="flex flex-col gap-3 p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold text-ink">
              Completion rate помесячно
            </h3>
            {monthlyCompletionRate.length === 0 ? (
              <p className="text-sm text-muted">
                Рейтинг надёжности помесячно появится после первой завершённой тренировки.
              </p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={monthlyCompletionRate}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
                  <XAxis
                    dataKey="month"
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                  />
                  <YAxis
                    domain={[0, 100]}
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                    unit="%"
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'var(--ui-panel)',
                      border: '1px solid var(--ui-line)',
                      borderRadius: '8px',
                      fontSize: '13px',
                    }}
                  />
                  <Bar
                    dataKey="rate"
                    name="Completion rate %"
                    fill="var(--ui-success)"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* FSM-разбивка: pie-диаграмма + текстовая легенда. */}
          <Card
            className="flex flex-col gap-3 p-5 sm:p-6"
            data-testid="athlete-stats-fsm-breakdown"
          >
            <h3 className="font-display text-lg font-semibold text-ink">Распределение статусов</h3>
            {fsmPieData.length === 0 ? (
              <p className="text-sm text-muted">Нет данных — пока не было relevant-событий.</p>
            ) : (
              <div className="grid gap-4 md:grid-cols-[1fr_1fr] md:items-center">
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie
                      data={fsmPieData}
                      dataKey="value"
                      nameKey="name"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {fsmPieData.map((slice) => (
                        <Cell key={slice.name} fill={slice.fill} />
                      ))}
                    </Pie>
                    <Tooltip />
                    <Legend />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="flex flex-col gap-2 text-sm text-ink">
                  <li className="flex items-center justify-between gap-3 border-b border-line pb-2">
                    <span className="text-muted">Завершённые</span>
                    <span className="font-semibold">{fsmBreakdown.completed}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3 border-b border-line pb-2">
                    <span className="text-muted">Неявки</span>
                    <span className="font-semibold">{fsmBreakdown.noShow}</span>
                  </li>
                  <li className="flex items-center justify-between gap-3">
                    <span className="text-muted">Отменённые</span>
                    <span className="font-semibold">{fsmBreakdown.cancelled}</span>
                  </li>
                </ul>
              </div>
            )}
          </Card>

          {/* Рейтинг надёжности: общая картина с деталями (аналог Dashboard). */}
          {reliability ? (
            <Card className="p-6 sm:p-8" data-testid="athlete-stats-reliability">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-display text-2xl font-semibold text-ink">
                  Мой рейтинг надёжности
                </h2>
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
                    <p className="mt-2 text-2xl font-semibold text-ink">
                      {reliability.noShowCount}
                    </p>
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
        </section>
      ) : (
        <Card className="p-6 sm:p-8" data-testid="athlete-stats-empty">
          <p className="text-base leading-relaxed text-muted">
            Пока нет данных для метрик. Как только вы запишетесь на первую тренировку, здесь
            появятся стрики, часы и рейтинг надёжности.
          </p>
        </Card>
      )}
    </div>
  );
}
