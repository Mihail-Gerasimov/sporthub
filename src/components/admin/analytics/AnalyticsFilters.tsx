/**
 * Фильтры аналитики (Phase 28.17): segmented period + 2 кастомных select.
 *
 * Состояние controlled через родителя (AnalyticsDashboard).
 *
 * Layout:
 * — 1280+: grid `1fr auto auto` (segmented period слева, селекты справа в одной строке)
 * — 1024:  grid `1fr 1fr 1fr` + segmented period на всю строку (col-span-3)
 * — 768:   grid `1fr 1fr` + segmented period на всю строку (col-span-2)
 * — 480:   то же что 768, segmented скроллится горизонтально внутри
 *
 * Selects реализованы локально (нативный `<select>` с `appearance: none` +
 * абсолютный SVG-уголок), без трогания глобального `<Select>`. Это локальный
 * паттерн только для админки (N5 из плана).
 */
'use client';

import { useEffect, useState } from 'react';

import type { City, Sport } from '@/types';
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

/** Конфигурация чипов периода (порядок как в макете) */
const PERIOD_OPTIONS: Array<{ value: AnalyticsFiltersState['period']; label: string }> = [
  { value: 'all', label: 'Всё время' },
  { value: 'month', label: 'Месяц' },
  { value: 'week', label: 'Неделя' },
  { value: 'today', label: 'Сегодня' },
];

/** SVG-уголок для кастомных селектов (45° rotated borders, как в HTML макета) */
function ChevronDown({ active }: { active: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'pointer-events-none absolute right-3.5 top-1/2 inline-block h-2 w-2 -translate-y-[70%] rotate-45 border-b-[1.6px] border-r-[1.6px] transition-colors',
        active ? 'border-lime' : 'border-muted',
      )}
    />
  );
}

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
    <div className="grid grid-cols-2 items-end gap-3 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-[1fr_auto_auto] xl:gap-3.5">
      {/* Segmented period — на узких экранах full-width col-span, на десктопе слева */}
      <div className="scrollbar-hidden col-span-2 max-w-full overflow-x-auto lg:col-span-3 xl:col-span-1 xl:max-w-max">
        <div
          role="group"
          aria-label="Период"
          className="inline-flex items-center gap-1 rounded-full border border-line bg-card-2 p-1.5"
        >
          {PERIOD_OPTIONS.map((opt) => {
            const active = filters.period === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                disabled={isLoading}
                onClick={() => onFiltersChange({ ...filters, period: opt.value })}
                className={cn(
                  'inline-flex items-center whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-bold uppercase tracking-[0.16em] transition-colors disabled:opacity-40',
                  active ? 'bg-lime text-bg' : 'text-muted hover:text-ink',
                )}
                data-testid={`analytics-period-${opt.value}`}
              >
                {opt.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Город */}
      <FilterSelect
        label="Город"
        value={filters.city}
        active={filters.city !== ''}
        disabled={isLoading}
        onChange={(value) => onFiltersChange({ ...filters, city: value })}
        options={[
          { value: '', label: 'Все города' },
          ...cities.map((c) => ({ value: c.name, label: c.name })),
        ]}
      />

      {/* Вид спорта */}
      <FilterSelect
        label="Вид спорта"
        value={filters.sportId}
        active={filters.sportId !== ''}
        disabled={isLoading}
        onChange={(value) => onFiltersChange({ ...filters, sportId: value })}
        options={[
          { value: '', label: 'Все виды спорта' },
          ...sports.map((s) => ({ value: String(s.id), label: s.name })),
        ]}
      />
    </div>
  );
}

/** Кастомный select-wrap: dark bg + 1px line-border + lime border on focus/active */
type FilterSelectProps = {
  label: string;
  value: string;
  active: boolean;
  disabled: boolean;
  onChange: (value: string) => void;
  options: Array<{ value: string; label: string }>;
};

function FilterSelect({ label, value, active, disabled, onChange, options }: FilterSelectProps) {
  return (
    <label className="flex min-w-0 flex-col gap-1.5">
      <span className="text-[10px] font-bold uppercase tracking-[0.22em] text-muted">{label}</span>
      <span
        className={cn(
          'relative block rounded-[12px] border bg-card-2 transition-colors focus-within:border-lime',
          active ? 'border-lime' : 'border-line',
        )}
      >
        <select
          value={value}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value)}
          className="w-full cursor-pointer appearance-none bg-transparent py-[11px] pl-3.5 pr-9 text-[13px] font-semibold text-ink outline-none disabled:cursor-not-allowed disabled:opacity-40"
        >
          {options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <ChevronDown active={active} />
      </span>
    </label>
  );
}
