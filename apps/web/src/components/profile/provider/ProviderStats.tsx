// Stats провайдера (Step 25.11): метрики per-entity с drill-down per-offering
// для multi-offering тренеров. Часы проведено (completed), completion/cancel/no_show
// rates, heatmap «день × час», топ-5 offerings, ReliabilityBadge каждой entity и
// помесячный completionRate. Все расчёты на лету из bookings + schedule — без
// хранимых snapshot'ов. Default window — 12 мес, toggle «всё время».
'use client';

import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { getProviderClubs, getProviderTrainers } from '@/components/profile/provider-helpers';
import { Card, ReliabilityBadge } from '@/components/ui';
import { computeClubReliability, computeTrainerReliability } from '@sporthub/domain';
import { getWeekStartKey, zonedDateTime } from '@sporthub/domain';
import { formatMonthLabel, getCurrentMonthKey, getMonthKey, shiftMonthKey } from '@/lib/month-keys';
import { cn, findBookingSlot, getBookingClubId, getBookingTrainerId } from '@/lib/utils';
import { useAuthFaces, useAuthStore } from '@/stores/useAuthStore';
import type { Booking, Club, Offering, Schedule, Sport, Trainer } from '@sporthub/types';

const ALL_VALUE = '__all__';
type StatsWindow = 12 | 'all';

const MS_IN_DAY = 24 * 60 * 60 * 1000;

// Дни недели с понедельника (соответствует нашим locale-соглашениям).
const DAY_LABELS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'];

/**
 * Клетка тепловой карты: день недели (Пн=0..Вс=6) и час — по часам зала.
 *
 * Прежняя версия была сломана по существу: строка `${date}T${time}:00` разбиралась
 * в поясе БРАУЗЕРА, а день и час читались через `getUTCDay()` и `getUTCHours()` —
 * то есть в UTC. Разница между этими двумя поясами уезжала прямо в координаты
 * клетки: у зрителя в Самаре занятие в 10:00 попадало в колонку 6 часов, а
 * занятия раннего утра и позднего вечера переезжали ещё и на соседний день недели.
 *
 * Теперь обе координаты берутся из того, что показывают часы зала. Час читается
 * прямо из `startTime` — это и есть время зала, никакого пояса тут нет вовсе.
 * День недели считается как расстояние от понедельника той же недели: обе даты
 * берутся полуночью в поясе зала, поэтому разница — ровно целые сутки.
 */
function getDayHourKey(dateStr: string, startTime: string): { day: number; hour: number } {
  const weekStartKey = getWeekStartKey(dateStr);
  const dayOffsetMs =
    zonedDateTime(dateStr, '00:00').getTime() - zonedDateTime(weekStartKey, '00:00').getTime();
  const day = Math.round(dayOffsetMs / MS_IN_DAY);
  const hour = Number(startTime.split(':')[0]);

  return { day, hour: Number.isFinite(hour) ? hour : -1 };
}

type ProviderStatsProps = {
  bookings?: Booking[];
  clubs?: Club[];
  trainers?: Trainer[];
  offerings?: Offering[];
  schedule?: Schedule[];
  sports?: Sport[];
};

export function ProviderStats({
  bookings = [],
  clubs = [],
  trainers = [],
  offerings = [],
  schedule = [],
  sports = [],
}: ProviderStatsProps) {
  const user = useAuthStore((s) => s.user);
  const { faces } = useAuthFaces();

  const [windowSetting, setWindowSetting] = useState<StatsWindow>(12);
  const [offeringFilter, setOfferingFilter] = useState<string>(ALL_VALUE);

  // ⚠️ Шаг 35.20a. Свои публикации отбираются по ЛИЦАМ услуг из ответа
  // «кто я», а не по номеру владельца в карточке каталога: это поле из
  // публичной выдачи ушло — по нему кто угодно строил карту владельцев,
  // скачав каталог одним запросом.
  const providerClubs = useMemo(() => getProviderClubs(clubs, faces), [clubs, faces]);
  const providerTrainers = useMemo(() => getProviderTrainers(trainers, faces), [trainers, faces]);

  const clubIdSet = useMemo(() => new Set(providerClubs.map((c) => c.id)), [providerClubs]);
  const trainerIdSet = useMemo(
    () => new Set(providerTrainers.map((t) => t.id)),
    [providerTrainers],
  );

  const providerOfferings = useMemo(
    () =>
      offerings.filter(
        (offering) =>
          (offering.ownerType === 'club' && clubIdSet.has(offering.ownerId)) ||
          (offering.ownerType === 'trainer' && trainerIdSet.has(offering.ownerId)),
      ),
    [offerings, clubIdSet, trainerIdSet],
  );

  // Bookings, принадлежащие провайдеру (любой его managed-сущности).
  const providerBookings = useMemo(
    () =>
      bookings.filter((booking) => {
        const clubId = getBookingClubId(booking);
        const trainerId = getBookingTrainerId(booking);
        if (clubId !== null && clubIdSet.has(clubId)) return true;
        if (trainerId !== null && trainerIdSet.has(trainerId)) return true;
        return false;
      }),
    [bookings, clubIdSet, trainerIdSet],
  );

  // Порог окна: YYYY-MM 11 месяцев назад (включая текущий — итого 12).
  // Текущий месяц берётся по календарю зала: `now.getMonth()` в поясе браузера
  // на границе месяца отдавал соседний месяц и двигал всё окно.
  const windowStartKey = useMemo<string | null>(() => {
    if (windowSetting === 'all') return null;

    return shiftMonthKey(getCurrentMonthKey(), -11);
  }, [windowSetting]);

  // Фильтрация по окну и per-offering.
  const filteredBookings = useMemo(() => {
    return providerBookings.filter((booking) => {
      if (windowStartKey !== null && getMonthKey(booking.date) < windowStartKey) {
        return false;
      }
      if (offeringFilter !== ALL_VALUE) {
        const offeringId = Number(offeringFilter);
        if (booking.offeringId !== offeringId) return false;
      }
      return true;
    });
  }, [providerBookings, windowStartKey, offeringFilter]);

  const scheduleById = useMemo(() => new Map(schedule.map((slot) => [slot.id, slot])), [schedule]);
  const offeringById = useMemo(
    () => new Map(offerings.map((offering) => [offering.id, offering])),
    [offerings],
  );

  // Часы проведено (completed): sum durationMinutes / 60.
  const totalHours = useMemo(() => {
    let minutes = 0;
    for (const booking of filteredBookings) {
      if (booking.status !== 'completed') continue;
      const slot = findBookingSlot(booking, scheduleById);
      minutes += slot?.durationMinutes ?? 0;
    }
    return Math.round((minutes / 60) * 10) / 10;
  }, [filteredBookings, scheduleById]);

  const completionRate = useMemo(() => {
    const completed = filteredBookings.filter((b) => b.status === 'completed').length;
    const noShow = filteredBookings.filter((b) => b.status === 'no_show').length;
    const relevant = completed + noShow;
    if (relevant === 0) return null;
    return Math.round((completed / relevant) * 100);
  }, [filteredBookings]);

  const noShowRate = useMemo(() => {
    const completed = filteredBookings.filter((b) => b.status === 'completed').length;
    const noShow = filteredBookings.filter((b) => b.status === 'no_show').length;
    const relevant = completed + noShow;
    if (relevant === 0) return null;
    return Math.round((noShow / relevant) * 100);
  }, [filteredBookings]);

  const cancelRate = useMemo(() => {
    const total = filteredBookings.length;
    if (total === 0) return null;
    const cancelledByProvider = filteredBookings.filter(
      (b) => b.status === 'cancelled_by_provider',
    ).length;
    return Math.round((cancelledByProvider / total) * 100);
  }, [filteredBookings]);

  // Heatmap: 7 дней × 24 часа.
  const heatmap = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
    for (const booking of filteredBookings) {
      if (booking.status !== 'completed') continue;
      const slot = findBookingSlot(booking, scheduleById);
      if (!slot) continue;
      const { day, hour } = getDayHourKey(booking.date, slot.startTime);
      if (day >= 0 && day < 7 && hour >= 0 && hour < 24) {
        grid[day][hour] += 1;
      }
    }
    return grid;
  }, [filteredBookings, scheduleById]);

  const heatmapMax = useMemo(() => {
    let max = 0;
    for (let d = 0; d < 7; d += 1) {
      for (let h = 0; h < 24; h += 1) {
        if (heatmap[d][h] > max) max = heatmap[d][h];
      }
    }
    return max;
  }, [heatmap]);

  // Топ-5 offerings по числу completed записей.
  const topOfferings = useMemo(() => {
    const counts = new Map<number, number>();
    for (const booking of filteredBookings) {
      if (booking.status !== 'completed') continue;
      if (booking.offeringId === undefined) continue;
      counts.set(booking.offeringId, (counts.get(booking.offeringId) ?? 0) + 1);
    }
    return Array.from(counts.entries())
      .map(([offeringId, count]) => ({
        offeringId,
        title: offeringById.get(offeringId)?.title ?? `Услуга #${offeringId}`,
        count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 5);
  }, [filteredBookings, offeringById]);

  // Completion rate помесячно (по booking.date).
  const monthlyCompletionRate = useMemo(() => {
    const countsByMonth = new Map<string, { completed: number; relevant: number }>();
    for (const booking of filteredBookings) {
      if (booking.status !== 'completed' && booking.status !== 'no_show') continue;
      const key = getMonthKey(booking.date);
      const entry = countsByMonth.get(key) ?? { completed: 0, relevant: 0 };
      if (booking.status === 'completed') entry.completed += 1;
      entry.relevant += 1;
      countsByMonth.set(key, entry);
    }

    return Array.from(countsByMonth.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, { completed, relevant }]) => ({
        month: formatMonthLabel(key),
        rate: relevant === 0 ? 0 : Math.round((completed / relevant) * 100),
      }));
  }, [filteredBookings]);

  // ⚠️ Шаг 35.34. Здесь стояла плашка «Доступ ограничен» — косметика поверх
  // УЖЕ отданных данных: пускать или нет, решает серверный лейаут, и решает
  // до похода за ними. Осталась одна причина ничего не рисовать: ответ
  // «кто я» ещё в пути, и номера человека нет.
  if (!user) {
    return null;
  }

  const isProviderEmpty = providerClubs.length === 0 && providerTrainers.length === 0;

  return (
    <div className="flex flex-col gap-6" data-testid="provider-stats">
      <Card className="p-6 sm:p-8">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Статистика</h1>
        <p className="mt-3 text-sm leading-relaxed text-muted">
          Только ваши данные: часы проведено, загрузка offerings, completion/no_show/cancel rate,
          популярные слоты и рейтинг надёжности по каждой публикации.
        </p>
      </Card>

      {isProviderEmpty ? (
        <Card className="p-6 sm:p-8" data-testid="provider-stats-empty">
          <p className="text-sm leading-relaxed text-muted">
            Как только появится первый опубликованный клуб или тренер — здесь соберутся ваши
            метрики.
          </p>
        </Card>
      ) : (
        <>
          {/* Фильтры: window + per-offering. */}
          <Card className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
            <div className="flex gap-2" role="group" aria-label="Окно статистики">
              <button
                type="button"
                data-testid="provider-stats-window-12"
                aria-pressed={windowSetting === 12}
                onClick={() => setWindowSetting(12)}
                className={
                  windowSetting === 12
                    ? 'rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-ink'
                    : 'rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent'
                }
              >
                12 мес
              </button>
              <button
                type="button"
                data-testid="provider-stats-window-all"
                aria-pressed={windowSetting === 'all'}
                onClick={() => setWindowSetting('all')}
                className={
                  windowSetting === 'all'
                    ? 'rounded-pill bg-accent px-4 py-2 text-sm font-semibold text-ink'
                    : 'rounded-pill border border-line bg-panel px-4 py-2 text-sm font-semibold text-ink hover:border-accent hover:text-accent'
                }
              >
                Всё время
              </button>
            </div>

            <label className="flex min-w-[200px] flex-col gap-1 text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Per-offering drill-down
              <select
                data-testid="provider-stats-filter-offering"
                value={offeringFilter}
                onChange={(event) => setOfferingFilter(event.target.value)}
                className="rounded-pill border border-line bg-panel px-3 py-2 text-sm font-normal text-ink"
              >
                <option value={ALL_VALUE}>Все offerings</option>
                {providerOfferings.map((offering) => (
                  <option key={offering.id} value={String(offering.id)}>
                    {offering.title}
                  </option>
                ))}
              </select>
            </label>
          </Card>

          {/* KPI-ряд. */}
          <div
            className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4"
            data-testid="provider-stats-kpi"
          >
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Часы проведено
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="provider-stats-total-hours"
              >
                {totalHours}
              </p>
              <p className="mt-2 text-xs text-muted">Сумма по completed в окне</p>
            </div>
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Completion rate
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="provider-stats-completion-rate"
              >
                {completionRate === null ? '—' : `${completionRate}%`}
              </p>
              <p className="mt-2 text-xs text-muted">completed / (completed + no_show)</p>
            </div>
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                No-show rate клиентов
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="provider-stats-no-show-rate"
              >
                {noShowRate === null ? '—' : `${noShowRate}%`}
              </p>
              <p className="mt-2 text-xs text-muted">no_show / relevant</p>
            </div>
            <div className="rounded-card border border-line bg-panel p-4">
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                Cancel rate (вы)
              </p>
              <p
                className="mt-3 text-3xl font-semibold text-ink"
                data-testid="provider-stats-cancel-rate"
              >
                {cancelRate === null ? '—' : `${cancelRate}%`}
              </p>
              <p className="mt-2 text-xs text-muted">cancelled_by_provider / total</p>
            </div>
          </div>

          {/* Heatmap. */}
          <Card className="flex flex-col gap-3 p-5 sm:p-6" data-testid="provider-stats-heatmap">
            <h3 className="font-display text-lg font-semibold text-ink">
              Популярные слоты (день × час)
            </h3>
            <p className="text-xs text-muted">
              Сколько completed-занятий провели в каждом часе недели. Серый — нет записей,
              насыщенный — максимум.
            </p>
            <div className="overflow-x-auto">
              <table className="min-w-full border-separate border-spacing-1">
                <thead>
                  <tr>
                    <th />
                    {Array.from({ length: 24 }, (_, hour) => (
                      <th key={hour} className="text-[10px] font-normal text-muted">
                        {hour}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAY_LABELS.map((label, day) => (
                    <tr key={label}>
                      <th className="pr-2 text-right text-xs font-semibold text-muted">{label}</th>
                      {heatmap[day].map((count, hour) => {
                        const intensity =
                          heatmapMax === 0 ? 0 : Math.round((count / heatmapMax) * 100);
                        return (
                          <td
                            key={`${day}-${hour}`}
                            data-testid={`provider-stats-heatmap-cell-${day}-${hour}`}
                            title={`${label} ${hour}:00 — ${count}`}
                            className={cn(
                              'size-5 rounded border border-line',
                              count === 0
                                ? 'bg-canvas'
                                : intensity < 34
                                  ? 'bg-teal/20'
                                  : intensity < 67
                                    ? 'bg-teal/50'
                                    : 'bg-teal',
                            )}
                          />
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          {/* Топ-5 offerings. */}
          <Card
            className="flex flex-col gap-3 p-5 sm:p-6"
            data-testid="provider-stats-top-offerings"
          >
            <h3 className="font-display text-lg font-semibold text-ink">Топ-5 offerings</h3>
            {topOfferings.length === 0 ? (
              <p className="text-sm text-muted">Нет completed-записей в выбранном периоде</p>
            ) : (
              <ResponsiveContainer width="100%" height={260}>
                <BarChart data={topOfferings} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--ui-line)" />
                  <XAxis
                    type="number"
                    allowDecimals={false}
                    tick={{ fontSize: 12, fill: 'var(--ui-muted)' }}
                    tickLine={false}
                    axisLine={{ stroke: 'var(--ui-line)' }}
                  />
                  <YAxis
                    type="category"
                    dataKey="title"
                    width={140}
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
                  <Bar
                    dataKey="count"
                    name="Completed"
                    fill="var(--ui-accent)"
                    radius={[0, 4, 4, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </Card>

          {/* Completion rate помесячно. */}
          <Card className="flex flex-col gap-3 p-5 sm:p-6">
            <h3 className="font-display text-lg font-semibold text-ink">
              Completion rate помесячно
            </h3>
            {monthlyCompletionRate.length === 0 ? (
              <p className="text-sm text-muted">Нет данных за выбранный период</p>
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

          {/* Reliability-бейджи моих entity (useful для быстрого self-check). */}
          {providerClubs.length > 0 ? (
            <Card className="flex flex-col gap-3 p-5 sm:p-6">
              <h3 className="font-display text-lg font-semibold text-ink">
                Надёжность моих клубов
              </h3>
              <ul className="flex flex-col gap-2">
                {providerClubs.map((myClub) => {
                  const reliability = computeClubReliability(bookings, myClub.id);
                  return (
                    <li
                      key={myClub.id}
                      data-testid={`provider-stats-club-${myClub.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                    >
                      <span className="text-sm font-semibold text-ink">{myClub.name}</span>
                      <ReliabilityBadge reliability={reliability} showDetails />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {providerTrainers.length > 0 ? (
            <Card className="flex flex-col gap-3 p-5 sm:p-6">
              <h3 className="font-display text-lg font-semibold text-ink">
                Надёжность моих тренеров
              </h3>
              <ul className="flex flex-col gap-2">
                {providerTrainers.map((myTrainer) => {
                  const reliability = computeTrainerReliability(bookings, myTrainer.id);
                  return (
                    <li
                      key={myTrainer.id}
                      data-testid={`provider-stats-trainer-${myTrainer.id}`}
                      className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-canvas p-3"
                    >
                      <span className="text-sm font-semibold text-ink">{myTrainer.name}</span>
                      <ReliabilityBadge reliability={reliability} showDetails />
                    </li>
                  );
                })}
              </ul>
            </Card>
          ) : null}

          {/* Приписка о единицах для sports — для будущих per-sport разбивок; сейчас только
              как справка. */}
          {sports.length > 0 ? null : null}
        </>
      )}
    </div>
  );
}
