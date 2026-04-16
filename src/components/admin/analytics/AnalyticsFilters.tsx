/**
 * Фильтры аналитики: период (чипы), город и вид спорта (select).
 * Состояние управляется родителем через controlled props.
 */
'use client';

import { useEffect, useState } from 'react';

import type { City, Sport } from '@/types';
import { Select } from '@/components/ui';
import { cn } from '@/lib/utils';

/** Тип фильтров аналитики */
export type AnalyticsFiltersState = {
  period: 'today' | 'week' | 'month' | 'all';
  city: string;
  sportId: string;
};

type AnalyticsFiltersProps = {
  filters: AnalyticsFiltersState;
  onFiltersChange: (filters: AnalyticsFiltersState) => void;
  sports: Sport[];
  isLoading: boolean;
};

/** Конфигурация чипов периода */
const PERIOD_OPTIONS: Array<{ value: AnalyticsFiltersState['period']; label: string }> = [
  { value: 'all', label: 'Всё время' },
  { value: 'month', label: 'Месяц' },
  { value: 'week', label: 'Неделя' },
  { value: 'today', label: 'Сегодня' },
];

export function AnalyticsFilters({
  filters,
  onFiltersChange,
  sports,
  isLoading,
}: AnalyticsFiltersProps) {
  // Динамический список городов для фильтра
  const [cities, setCities] = useState<City[]>([]);

  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCities(json.data);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:flex-wrap">
      {/* Чипы периода */}
      <div className="flex flex-wrap gap-2">
        {PERIOD_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={isLoading}
            onClick={() => onFiltersChange({ ...filters, period: opt.value })}
            className={cn(
              'rounded-pill border px-4 py-1.5 text-sm font-medium transition-colors',
              filters.period === opt.value
                ? 'border-accent bg-accent text-white'
                : 'border-line bg-panel text-muted hover:border-accent hover:text-accent',
            )}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Город */}
      <div className="min-w-[160px]">
        <Select
          label="Город"
          value={filters.city}
          disabled={isLoading}
          onChange={(e) => onFiltersChange({ ...filters, city: e.target.value })}
        >
          <option value="">Все города</option>
          {cities.map((c) => (
            <option key={c.id} value={c.name}>
              {c.name}
            </option>
          ))}
        </Select>
      </div>

      {/* Вид спорта */}
      <div className="min-w-[180px]">
        <Select
          label="Вид спорта"
          value={filters.sportId}
          disabled={isLoading}
          onChange={(e) => onFiltersChange({ ...filters, sportId: e.target.value })}
        >
          <option value="">Все виды спорта</option>
          {sports.map((s) => (
            <option key={s.id} value={String(s.id)}>
              {s.name}
            </option>
          ))}
        </Select>
      </div>
    </div>
  );
}
