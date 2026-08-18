/**
 * Клиентский дашборд аналитики (Phase 28.17).
 *
 * Рендерит:
 * 1. sec-head — eyebrow «Admin · Overview» + Bowlby «Аналитика» + sub-описание +
 *    статичный live-pill справа (lime-точка через CSS-псевдоэлемент, без анимации
 *    и без таймера — просто индикатор «данные актуальны»).
 * 2. AnalyticsFilters — segmented period + 2 кастомных select (Город / Спорт).
 * 3. KpiCards — 6 KPI-карточек (без спарклайнов / trend / ring).
 * 4. 4 чарта/таблица в 2 строки — НЕ перевёрстаны, оставлены как есть (вне scope 28.17).
 *
 * Управляет фильтрами, загрузкой данных и передачей в дочерние компоненты.
 * Контейнер max-w-[1440px] задаётся вышестоящим (admin)/layout.tsx — сам дашборд
 * растягивается во всю ширину родителя.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Sport } from '@sporthub/types';
import type { KpiData } from './KpiCards';
import type { AnalyticsFiltersState } from './AnalyticsFilters';
import { KpiCards } from './KpiCards';
import { AnalyticsFilters } from './AnalyticsFilters';
import { BookingsChart } from './BookingsChart';
import { SportPopularityChart } from './SportPopularityChart';
import { PlatformActivityChart } from './PlatformActivityChart';
import { TopEntitiesTable } from './TopEntitiesTable';

/** Тип ответа API аналитики */
type AnalyticsData = {
  kpi: KpiData;
  bookingsByDate: Array<{ date: string; count: number }>;
  sportPopularity: Array<{ sportId: number; sportName: string; count: number }>;
  topEntities: Array<{
    id: number;
    name: string;
    type: 'club' | 'trainer';
    bookings: number;
    rating: number;
  }>;
  platformActivity: Array<{ date: string; count: number }>;
};

const EMPTY_KPI: KpiData = {
  totalUsers: 0,
  totalAthletes: 0,
  totalProviders: 0,
  totalClubs: 0,
  totalTrainers: 0,
  totalBookings: 0,
  totalReviews: 0,
  averageSlotLoad: 0,
};

type AnalyticsDashboardProps = {
  sports: Sport[];
};

export function AnalyticsDashboard({ sports }: AnalyticsDashboardProps) {
  const [filters, setFilters] = useState<AnalyticsFiltersState>({
    period: 'all',
    city: '',
    sportId: '',
  });
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  /** Загрузка данных из API */
  const fetchData = useCallback(async (currentFilters: AnalyticsFiltersState) => {
    setIsLoading(true);
    try {
      const params = new URLSearchParams();
      if (currentFilters.period !== 'all') params.set('period', currentFilters.period);
      if (currentFilters.city) params.set('city', currentFilters.city);
      if (currentFilters.sportId) params.set('sportId', currentFilters.sportId);

      const queryString = params.toString();
      const url = `/api/analytics${queryString ? `?${queryString}` : ''}`;
      const res = await fetch(url);
      const json = await res.json();

      if (json.success) {
        setData(json.data);
      }
    } catch {
      // При ошибке сети — данные остаются прежними
    } finally {
      setIsLoading(false);
    }
  }, []);

  /* Загрузка при монтировании и смене фильтров */
  useEffect(() => {
    fetchData(filters);
  }, [filters, fetchData]);

  /** Обработчик смены фильтров */
  function handleFiltersChange(newFilters: AnalyticsFiltersState) {
    setFilters(newFilters);
  }

  const kpi = data?.kpi ?? EMPTY_KPI;

  return (
    <div className="flex w-full flex-col gap-5 sm:gap-[22px]">
      {/* Sec-head: eyebrow + Bowlby title + sub + live-pill справа */}
      <header className="flex flex-col items-start gap-3 sm:flex-row sm:items-end sm:justify-between sm:gap-4">
        <div className="flex min-w-0 flex-col gap-1.5">
          <p className="m-0 text-[11px] font-bold uppercase tracking-[0.22em] text-muted">
            Admin · Overview
          </p>
          <h1 className="m-0 font-display text-[24px] uppercase leading-none tracking-tight text-ink sm:text-[26px] lg:text-[28px] xl:text-[32px]">
            Аналитика
          </h1>
          <p className="m-0 mt-1 text-[13px] font-normal leading-[1.5] text-muted">
            Сводные метрики платформы за выбранный период.
          </p>
        </div>
        {/* Live-pill: статика, lime-dot через inline-flex span (не CSS ::before чтобы
         * упростить тестируемость и сохранить семантику span внутри span). */}
        <span className="inline-flex shrink-0 items-center gap-2 whitespace-nowrap rounded-full border border-line px-3 py-1.5 text-[10px] font-bold uppercase tracking-[0.18em] text-ink">
          <span
            aria-hidden="true"
            className="inline-block h-1.5 w-1.5 rounded-full bg-lime shadow-[0_0_0_3px_rgba(132,192,3,0.18)]"
          />
          live · обновлено сейчас
        </span>
      </header>

      {/* Фильтры */}
      <AnalyticsFilters
        filters={filters}
        onFiltersChange={handleFiltersChange}
        sports={sports}
        isLoading={isLoading}
      />

      {/* KPI-карточки */}
      <KpiCards kpi={kpi} isLoading={isLoading} />

      {/* Графики — первая строка (НЕ перевёрстано в 28.17, оставлено как есть) */}
      <div className="mt-2 grid grid-cols-1 gap-6 lg:grid-cols-2">
        <BookingsChart data={data?.bookingsByDate ?? []} isLoading={isLoading} />
        <SportPopularityChart data={data?.sportPopularity ?? []} isLoading={isLoading} />
      </div>

      {/* Графики — вторая строка */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <PlatformActivityChart data={data?.platformActivity ?? []} isLoading={isLoading} />
        <TopEntitiesTable data={data?.topEntities ?? []} isLoading={isLoading} />
      </div>
    </div>
  );
}
