'use client';

import { create } from 'zustand';

type FilterState = {
  searchQuery: string;
  selectedSportId: number | null;
  setSearch: (value: string) => void;
  setSport: (sportId: number | null) => void;
  resetFilters: () => void;
};

const initialFilterState = {
  searchQuery: '',
  selectedSportId: null,
};

export const useFilterStore = create<FilterState>()((set) => ({
  ...initialFilterState,
  setSearch: (value) => {
    set({
      searchQuery: value,
    });
  },
  setSport: (sportId) => {
    set({
      selectedSportId: sportId,
    });
  },
  resetFilters: () => {
    set(initialFilterState);
  },
}));
