/**
 * Тесты графиков аналитики: BookingsChart и SportPopularityChart.
 * Phase 21 — Step 21.5.
 *
 * ResponsiveContainer не рендерит SVG в jsdom (нулевые размеры контейнера).
 * SVG-рендеринг Recharts подтверждён в analytics-smoke.test.tsx.
 * Здесь проверяем: заголовки, пустое состояние, skeleton.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

import { BookingsChart } from '@/components/admin/analytics/BookingsChart';
import { SportPopularityChart } from '@/components/admin/analytics/SportPopularityChart';

/* Recharts использует ResizeObserver — в jsdom его нет, мокаем как class */
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('BookingsChart', () => {
  const mockData = [
    { date: '2026-04-10', count: 5 },
    { date: '2026-04-11', count: 12 },
    { date: '2026-04-12', count: 8 },
  ];

  it('рендерится с данными — заголовок виден, пустое состояние скрыто', () => {
    render(<BookingsChart data={mockData} isLoading={false} />);

    expect(screen.getByText('Записи за период')).toBeInTheDocument();
    expect(screen.queryByText(/нет данных/i)).not.toBeInTheDocument();
  });

  it('показывает пустое состояние при data: []', () => {
    render(<BookingsChart data={[]} isLoading={false} />);

    expect(screen.getByText('Записи за период')).toBeInTheDocument();
    expect(screen.getByText(/нет данных/i)).toBeInTheDocument();
  });

  it('показывает skeleton при isLoading', () => {
    const { container } = render(<BookingsChart data={mockData} isLoading={true} />);

    const skeleton = container.querySelector('[data-testid="chart-skeleton"]');
    expect(skeleton).toBeInTheDocument();
    expect(screen.queryByText(/нет данных/i)).not.toBeInTheDocument();
  });
});

describe('SportPopularityChart', () => {
  const mockData = [
    { sportName: 'Плавание', count: 15 },
    { sportName: 'Бокс', count: 8 },
    { sportName: 'Йога', count: 22 },
  ];

  it('рендерится с данными — заголовок виден, пустое состояние скрыто', () => {
    render(<SportPopularityChart data={mockData} isLoading={false} />);

    expect(screen.getByText('Популярные виды спорта')).toBeInTheDocument();
    expect(screen.queryByText(/нет данных/i)).not.toBeInTheDocument();
  });

  it('показывает пустое состояние при data: []', () => {
    render(<SportPopularityChart data={[]} isLoading={false} />);

    expect(screen.getByText('Популярные виды спорта')).toBeInTheDocument();
    expect(screen.getByText(/нет данных/i)).toBeInTheDocument();
  });
});
