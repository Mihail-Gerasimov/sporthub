/**
 * KPI-карточки аналитики: основные метрики платформы.
 * Адаптивная сетка: 2 колонки mobile → 3 md → 6 xl.
 */
'use client';

import { Card, Skeleton } from '@/components/ui';

/** Тип KPI-данных из API аналитики */
export type KpiData = {
  totalUsers: number;
  totalAthletes: number;
  totalProviders: number;
  totalClubs: number;
  totalTrainers: number;
  totalBookings: number;
  totalReviews: number;
  averageSlotLoad: number;
};

type KpiCardsProps = {
  kpi: KpiData;
  isLoading: boolean;
};

/** Конфигурация одной KPI-карточки */
type KpiCardConfig = {
  label: string;
  getValue: (kpi: KpiData) => string;
  getSubtitle?: (kpi: KpiData) => string;
};

const KPI_CARDS: KpiCardConfig[] = [
  {
    label: 'Пользователи',
    getValue: (kpi) => String(kpi.totalUsers),
    getSubtitle: (kpi) => `${kpi.totalAthletes} спортсменов · ${kpi.totalProviders} провайдеров`,
  },
  {
    label: 'Клубы',
    getValue: (kpi) => String(kpi.totalClubs),
  },
  {
    label: 'Тренеры',
    getValue: (kpi) => String(kpi.totalTrainers),
  },
  {
    label: 'Записи',
    getValue: (kpi) => String(kpi.totalBookings),
  },
  {
    label: 'Отзывы',
    getValue: (kpi) => String(kpi.totalReviews),
  },
  {
    label: 'Загрузка слотов',
    getValue: (kpi) => `${Math.round(kpi.averageSlotLoad * 100)}%`,
  },
];

export function KpiCards({ kpi, isLoading }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-3 xl:grid-cols-6">
      {KPI_CARDS.map((card) => (
        <Card key={card.label} className="flex flex-col gap-1 p-4">
          <p className="text-xs font-medium uppercase tracking-wide text-muted">{card.label}</p>

          {isLoading ? (
            <Skeleton data-testid="kpi-skeleton" className="h-8 w-16" />
          ) : (
            <>
              <p className="font-display text-2xl font-bold text-ink">{card.getValue(kpi)}</p>
              {card.getSubtitle ? (
                <p className="text-xs text-muted">{card.getSubtitle(kpi)}</p>
              ) : null}
            </>
          )}
        </Card>
      ))}
    </div>
  );
}
