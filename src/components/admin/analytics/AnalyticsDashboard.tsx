/**
 * Клиентский дашборд аналитики.
 * Управляет фильтрами, загрузкой данных и передачей в дочерние компоненты.
 */
'use client';

import { useCallback, useEffect, useState } from 'react';

import type { Sport } from '@/types';
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
    <div className="w-full max-w-7xl">
      {/* Заголовок */}
      <div className="mb-6">
        <h1 className="font-display text-3xl font-semibold tracking-tight text-ink">Аналитика</h1>
        <p className="mt-1 text-sm text-muted">Ключевые метрики и динамика платформы</p>
      </div>

      {/* Фильтры */}
      <div className="mb-6">
        <AnalyticsFilters
          filters={filters}
          onFiltersChange={handleFiltersChange}
          sports={sports}
          isLoading={isLoading}
        />
      </div>

      {/* KPI-карточки */}
      <div className="mb-8">
        <KpiCards kpi={kpi} isLoading={isLoading} />
      </div>

      {/* Графики — первая строка */}
      <div className="mb-6 grid grid-cols-1 gap-6 lg:grid-cols-2">
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
