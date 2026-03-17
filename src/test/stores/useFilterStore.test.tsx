import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { useFilterStore } from '@/stores/useFilterStore';

function FilterStoreProbe() {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setSearch = useFilterStore((state) => state.setSearch);
  const setSport = useFilterStore((state) => state.setSport);
  const resetFilters = useFilterStore((state) => state.resetFilters);

  return (
    <section>
      <p data-testid="search-value">{searchQuery || 'пусто'}</p>
      <p data-testid="sport-value">{selectedSportId ?? 'не выбран'}</p>
      <input
        aria-label="Поисковый запрос"
        value={searchQuery}
        onChange={(event) => {
          setSearch(event.target.value);
        }}
      />
      <button
        type="button"
        onClick={() => {
          setSport(8);
        }}
      >
        Выбрать пилатес
      </button>
      <button type="button" onClick={resetFilters}>
        Сбросить фильтры
      </button>
    </section>
  );
}

describe('useFilterStore', () => {
  beforeEach(() => {
    useFilterStore.setState({
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('управляет поиском и выбранным спортом через actions', () => {
    act(() => {
      useFilterStore.getState().setSearch('йога');
      useFilterStore.getState().setSport(3);
    });

    expect(useFilterStore.getState().searchQuery).toBe('йога');
    expect(useFilterStore.getState().selectedSportId).toBe(3);

    act(() => {
      useFilterStore.getState().resetFilters();
    });

    expect(useFilterStore.getState().searchQuery).toBe('');
    expect(useFilterStore.getState().selectedSportId).toBeNull();
  });

  it('реактивно обновляет значения в компонентах', () => {
    render(<FilterStoreProbe />);

    fireEvent.change(screen.getByLabelText('Поисковый запрос'), {
      target: { value: 'бассейн' },
    });

    expect(screen.getByTestId('search-value')).toHaveTextContent('бассейн');

    fireEvent.click(screen.getByRole('button', { name: 'Выбрать пилатес' }));

    expect(screen.getByTestId('sport-value')).toHaveTextContent('8');

    fireEvent.click(screen.getByRole('button', { name: 'Сбросить фильтры' }));

    expect(screen.getByTestId('search-value')).toHaveTextContent('пусто');
    expect(screen.getByTestId('sport-value')).toHaveTextContent('не выбран');
  });
});
