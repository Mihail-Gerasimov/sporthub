/**
 * Тесты фильтров аналитики.
 * Phase 21 — Step 21.4, обновлён Step 23.4.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';

import { AnalyticsFilters } from '@/components/admin/analytics/AnalyticsFilters';
import type { Sport } from '@/types';

const mockSports: Sport[] = [
  {
    id: 1,
    name: 'Йога',
    slug: 'yoga',
    description: '',
    icon: '',
    imageUrl: '',
    isPopular: true,
    createdAt: '',
  },
  {
    id: 2,
    name: 'Бокс',
    slug: 'boxing',
    description: '',
    icon: '',
    imageUrl: '',
    isPopular: false,
    createdAt: '',
  },
];

const mockCities = [
  { id: 1, name: 'Самара', coordinates: { lat: 53.19, lng: 50.1 }, createdAt: '' },
  { id: 2, name: 'Москва', coordinates: { lat: 55.75, lng: 37.61 }, createdAt: '' },
];

const defaultFilters = { period: 'all' as const, city: '', sportId: '' };

beforeEach(() => {
  vi.spyOn(globalThis, 'fetch').mockResolvedValue({
    json: () => Promise.resolve({ success: true, data: mockCities }),
  } as Response);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('AnalyticsFilters', () => {
  it('рендерит все фильтры', async () => {
    render(
      <AnalyticsFilters
        filters={defaultFilters}
        onFiltersChange={vi.fn()}
        sports={mockSports}
        isLoading={false}
      />,
    );

    /* Чипы периода */
    expect(screen.getByText('Всё время')).toBeInTheDocument();
    expect(screen.getByText('Месяц')).toBeInTheDocument();
    expect(screen.getByText('Неделя')).toBeInTheDocument();
    expect(screen.getByText('Сегодня')).toBeInTheDocument();

    /* Селекты города и спорта */
    expect(screen.getByLabelText('Город')).toBeInTheDocument();
    expect(screen.getByLabelText('Вид спорта')).toBeInTheDocument();

    // Ждём загрузки городов
    await waitFor(() => {
      expect(screen.getByText('Самара')).toBeInTheDocument();
    });
  });

  it('клик по чипу периода вызывает onFiltersChange', () => {
    const onChange = vi.fn();
    render(
      <AnalyticsFilters
        filters={defaultFilters}
        onFiltersChange={onChange}
        sports={mockSports}
        isLoading={false}
      />,
    );

    fireEvent.click(screen.getByText('Неделя'));
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, period: 'week' });
  });

  it('смена города вызывает onFiltersChange', async () => {
    const onChange = vi.fn();
    render(
      <AnalyticsFilters
        filters={defaultFilters}
        onFiltersChange={onChange}
        sports={mockSports}
        isLoading={false}
      />,
    );

    // Ждём загрузки городов из API
    await waitFor(() => {
      expect(screen.getByText('Самара')).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText('Город'), { target: { value: 'Самара' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, city: 'Самара' });
  });

  it('смена спорта вызывает onFiltersChange', () => {
    const onChange = vi.fn();
    render(
      <AnalyticsFilters
        filters={defaultFilters}
        onFiltersChange={onChange}
        sports={mockSports}
        isLoading={false}
      />,
    );

    fireEvent.change(screen.getByLabelText('Вид спорта'), { target: { value: '1' } });
    expect(onChange).toHaveBeenCalledWith({ ...defaultFilters, sportId: '1' });
  });
});
