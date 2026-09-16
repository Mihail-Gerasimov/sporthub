/**
 * KPI-карточки аналитики (Phase 28.17).
 *
 * 6 метрик в адаптивной сетке: 2 col mobile → 3 col на 1024/768 → 6 col на 1280+.
 *
 * Каждая карточка: иконка 22×22 квадратик + label uppercase muted +
 * display-число (44px на 1280+, 38px на 1024, 36px на 768, 30px на 480) +
 * sub-описание (clamp 2 строки). По макету — БЕЗ спарклайнов, trend-бейджей,
 * прогресс-кольца (CSS-код для них в HTML заготовлен дизайнером, но не
 * используется).
 *
 * Карточка `is-feature` (первая, «Пользователи») получает лайм-градиентный фон,
 * лайм-цифру и лайм-иконку — единственный визуальный акцент в сетке.
 */
'use client';

import type { ReactNode } from 'react';
import { Skeleton } from '@/components/ui';
import { cn } from '@/lib/utils';

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

// SVG-иконки KPI: pure inline, stroke-based, наследуют currentColor.
// Размер 12×12 внутри 22×22 квадратика-обёртки.
const ICON_USERS: ReactNode = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 00-3-3.87" />
    <path d="M16 3.13a4 4 0 010 7.75" />
  </svg>
);

const ICON_CLUBS: ReactNode = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="M3 21V7l9-4 9 4v14" />
    <path d="M9 21v-6h6v6" />
  </svg>
);

const ICON_TRAINERS: ReactNode = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21a8 8 0 0116 0" />
  </svg>
);

const ICON_BOOKINGS: ReactNode = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 9h18M8 3v4M16 3v4" />
    <path d="M8 14l3 3 5-6" />
  </svg>
);

const ICON_REVIEWS: ReactNode = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z" />
  </svg>
);

const ICON_LOAD: ReactNode = (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeLinecap="round"
    strokeLinejoin="round"
    strokeWidth="2"
  >
    <path d="M3 3v18h18" />
    <path d="M7 14l4-4 4 4 5-6" />
  </svg>
);

/** Конфигурация одной KPI-карточки */
type KpiCardConfig = {
  label: string;
  icon: ReactNode;
  getValue: (kpi: KpiData) => string;
  getSubtitle?: (kpi: KpiData) => string;
  feature?: boolean;
};

const KPI_CARDS: KpiCardConfig[] = [
  {
    label: 'Пользователи',
    icon: ICON_USERS,
    getValue: (kpi) => String(kpi.totalUsers),
    getSubtitle: (kpi) => `${kpi.totalAthletes} спортсменов · ${kpi.totalProviders} провайдеров`,
    feature: true,
  },
  {
    label: 'Клубы',
    icon: ICON_CLUBS,
    getValue: (kpi) => String(kpi.totalClubs),
    getSubtitle: () => 'Активных площадок',
  },
  {
    label: 'Тренеры',
    icon: ICON_TRAINERS,
    getValue: (kpi) => String(kpi.totalTrainers),
    getSubtitle: () => 'С активным профилем',
  },
  {
    label: 'Записи',
    icon: ICON_BOOKINGS,
    getValue: (kpi) => String(kpi.totalBookings),
    getSubtitle: () => 'Подтверждённых за период',
  },
  {
    label: 'Отзывы',
    icon: ICON_REVIEWS,
    getValue: (kpi) => String(kpi.totalReviews),
    getSubtitle: () => 'Опубликовано',
  },
  {
    label: 'Загрузка слотов',
    icon: ICON_LOAD,
    getValue: (kpi) => `${Math.round(kpi.averageSlotLoad * 100)}%`,
    getSubtitle: () => 'Дошли / всех записей',
  },
];

export function KpiCards({ kpi, isLoading }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
      {KPI_CARDS.map((card) => {
        const isFeature = card.feature === true;
        return (
          <article
            key={card.label}
            className={cn(
              'flex min-w-0 flex-col gap-3 rounded-[16px] border bg-card p-4 sm:p-[18px] transition-colors',
              isFeature
                ? 'border-lime/30 bg-gradient-to-b from-lime/5 to-transparent'
                : 'border-line hover:border-line',
            )}
          >
            {/* head: иконка-квадратик + label */}
            <div className="flex items-center gap-2.5">
              <span
                className={cn(
                  'inline-flex h-[22px] w-[22px] shrink-0 items-center justify-center rounded-[6px] border',
                  isFeature
                    ? 'border-lime/30 bg-lime-soft text-lime-hov'
                    : 'border-line bg-card-2 text-disabled',
                )}
                aria-hidden="true"
              >
                <span className="block h-3 w-3">{card.icon}</span>
              </span>
              <span className="text-[9px] font-bold uppercase tracking-[0.18em] text-muted sm:text-[10px] sm:tracking-[0.22em]">
                {card.label}
              </span>
            </div>

            {/* value: display + tabular-nums */}
            {isLoading ? (
              <Skeleton data-testid="kpi-skeleton" className="h-10 w-16" />
            ) : (
              <p
                className={cn(
                  'm-0 break-words font-display text-[30px] leading-[0.9] tracking-tight tabular-nums sm:text-[36px] lg:text-[38px] xl:text-[44px]',
                  isFeature ? 'text-lime-hov' : 'text-ink',
                )}
              >
                {card.getValue(kpi)}
              </p>
            )}

            {/* sub: body 500 12px muted line-clamp-2 */}
            {!isLoading && card.getSubtitle ? (
              <p className="m-0 line-clamp-2 text-xs font-medium leading-[1.4] text-muted">
                {card.getSubtitle(kpi)}
              </p>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
