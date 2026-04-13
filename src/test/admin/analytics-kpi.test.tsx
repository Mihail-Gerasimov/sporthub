/**
 * Тесты KPI-карточек аналитики.
 * Phase 21 — Step 21.3.
 */
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';

import { KpiCards } from '@/components/admin/analytics/KpiCards';

const mockKpi = {
  totalUsers: 150,
  totalAthletes: 120,
  totalProviders: 30,
  totalClubs: 25,
  totalTrainers: 40,
  totalBookings: 310,
  totalReviews: 85,
  averageSlotLoad: 0.73,
};

describe('KpiCards', () => {
  it('отображает все метрики с данными', () => {
    render(<KpiCards kpi={mockKpi} isLoading={false} />);

    /* Основные значения */
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('40')).toBeInTheDocument();
    expect(screen.getByText('310')).toBeInTheDocument();
    expect(screen.getByText('85')).toBeInTheDocument();
    expect(screen.getByText('73%')).toBeInTheDocument();

    /* Подпись для пользователей */
    expect(screen.getByText(/120 спортсменов/)).toBeInTheDocument();
    expect(screen.getByText(/30 провайдеров/)).toBeInTheDocument();
  });

  it('показывает skeleton при isLoading', () => {
    const { container } = render(<KpiCards kpi={mockKpi} isLoading={true} />);

    /* Skeleton-элементы вместо значений */
    const skeletons = container.querySelectorAll('[data-testid="kpi-skeleton"]');
    expect(skeletons.length).toBeGreaterThan(0);

    /* Числовые значения НЕ отображаются */
    expect(screen.queryByText('150')).not.toBeInTheDocument();
  });

  it('отображает нулевые значения без ошибок', () => {
    const zeroKpi = {
      totalUsers: 0,
      totalAthletes: 0,
      totalProviders: 0,
      totalClubs: 0,
      totalTrainers: 0,
      totalBookings: 0,
      totalReviews: 0,
      averageSlotLoad: 0,
    };

    render(<KpiCards kpi={zeroKpi} isLoading={false} />);

    /* Нули отображаются — ищем в карточках */
    const zeros = screen.getAllByText('0');
    expect(zeros.length).toBeGreaterThanOrEqual(5);
    expect(screen.getByText('0%')).toBeInTheDocument();
  });
});
