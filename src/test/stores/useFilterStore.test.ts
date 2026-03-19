import { beforeEach, describe, expect, it } from 'vitest';

import { useFilterStore } from '@/stores/useFilterStore';

describe('useFilterStore', () => {
  beforeEach(() => {
    useFilterStore.getState().resetFilters();
  });

  it('по умолчанию работает в club discovery mode', () => {
    expect(useFilterStore.getState()).toMatchObject({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });

  it('переключает discovery mode и reset возвращает initial state', () => {
    useFilterStore.getState().setDiscoveryMode('trainers');
    useFilterStore.getState().setSearch('марина');
    useFilterStore.getState().setSport(3);

    expect(useFilterStore.getState()).toMatchObject({
      discoveryMode: 'trainers',
      searchQuery: 'марина',
      selectedSportId: 3,
    });

    useFilterStore.getState().resetFilters();

    expect(useFilterStore.getState()).toMatchObject({
      discoveryMode: 'clubs',
      searchQuery: '',
      selectedSportId: null,
    });
  });
});
