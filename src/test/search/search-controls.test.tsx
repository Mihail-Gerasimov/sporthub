import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { SearchBar } from '@/components/search/SearchBar';
import { SearchControlsPreview } from '@/components/search/SearchControlsPreview';
import { SportFilters } from '@/components/search/SportFilters';
import { useFilterStore } from '@/stores/useFilterStore';

const sports = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 2, name: 'Бокс', icon: '🥊' },
  { id: 3, name: 'Плавание', icon: '🏊' },
];

describe('Search controls', () => {
  beforeEach(() => {
    useFilterStore.setState({
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('SearchBar обновляет поисковый запрос в store', () => {
    render(<SearchBar />);

    const input = screen.getByPlaceholderText('Бокс, йога, бассейн...');

    fireEvent.change(input, {
      target: { value: 'бокс рядом' },
    });

    expect(useFilterStore.getState().searchQuery).toBe('бокс рядом');
    expect(screen.getByDisplayValue('бокс рядом')).toBeInTheDocument();
  });

  it('SportFilters обновляет выбранный sportId по клику на chip', () => {
    render(<SportFilters sports={sports} />);

    fireEvent.click(screen.getByRole('button', { name: 'Йога' }));

    expect(useFilterStore.getState().selectedSportId).toBe(1);

    fireEvent.click(screen.getByRole('button', { name: 'Бокс' }));

    expect(useFilterStore.getState().selectedSportId).toBe(2);
  });

  it('preview секция реактивно показывает значения search и sport из store', () => {
    render(<SearchControlsPreview sports={sports} />);

    fireEvent.change(screen.getByPlaceholderText('Бокс, йога, бассейн...'), {
      target: { value: 'плавание' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Плавание' }));

    expect(screen.getByText('Запрос: плавание')).toBeInTheDocument();
    expect(screen.getByText('Фокус: Плавание')).toBeInTheDocument();
  });
});
