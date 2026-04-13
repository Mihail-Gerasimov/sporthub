/**
 * Тесты: PlatformActivityChart и TopEntitiesTable.
 * Phase 21 — Step 21.6.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';

import { PlatformActivityChart } from '@/components/admin/analytics/PlatformActivityChart';
import { TopEntitiesTable } from '@/components/admin/analytics/TopEntitiesTable';

/* Recharts ResizeObserver mock */
beforeAll(() => {
  if (!globalThis.ResizeObserver) {
    globalThis.ResizeObserver = class ResizeObserver {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  }
});

describe('PlatformActivityChart', () => {
  const mockData = [
    { date: '2026-04-10', count: 8 },
    { date: '2026-04-11', count: 15 },
  ];

  it('рендерится с данными — заголовок виден, пустое состояние скрыто', () => {
    render(<PlatformActivityChart data={mockData} isLoading={false} />);

    expect(screen.getByText('Активность платформы')).toBeInTheDocument();
    expect(screen.queryByText(/нет данных/i)).not.toBeInTheDocument();
  });

  it('показывает пустое состояние при data: []', () => {
    render(<PlatformActivityChart data={[]} isLoading={false} />);

    expect(screen.getByText(/нет данных/i)).toBeInTheDocument();
  });
});

describe('TopEntitiesTable', () => {
  const mockData = [
    { id: 1, name: 'Volna Club', type: 'club' as const, bookings: 25, rating: 4.8 },
    { id: 2, name: 'Марина Соколова', type: 'trainer' as const, bookings: 18, rating: 4.9 },
    { id: 3, name: 'Iron Gym', type: 'club' as const, bookings: 10, rating: 4.5 },
  ];

  it('рендерится с данными — названия и значения видны', () => {
    render(<TopEntitiesTable data={mockData} isLoading={false} />);

    expect(screen.getByText('Топ публикаций')).toBeInTheDocument();
    expect(screen.getByText('Volna Club')).toBeInTheDocument();
    expect(screen.getByText('Марина Соколова')).toBeInTheDocument();
    expect(screen.getByText('Iron Gym')).toBeInTheDocument();
    expect(screen.getByText('25')).toBeInTheDocument();
    expect(screen.getByText('4.9')).toBeInTheDocument();
  });

  it('показывает badge типа — Клуб и Тренер', () => {
    render(<TopEntitiesTable data={mockData} isLoading={false} />);

    const clubBadges = screen.getAllByText('Клуб');
    const trainerBadges = screen.getAllByText('Тренер');
    expect(clubBadges.length).toBe(2);
    expect(trainerBadges.length).toBe(1);
  });

  it('корректный порядок — по bookings desc', () => {
    render(<TopEntitiesTable data={mockData} isLoading={false} />);

    const rows = screen.getAllByRole('row');
    /* Первая строка — header, дальше данные */
    expect(rows[1]).toHaveTextContent('Volna Club');
    expect(rows[2]).toHaveTextContent('Марина Соколова');
    expect(rows[3]).toHaveTextContent('Iron Gym');
  });

  it('показывает пустое состояние при data: []', () => {
    render(<TopEntitiesTable data={[]} isLoading={false} />);

    expect(screen.getByText(/нет данных/i)).toBeInTheDocument();
  });
});
