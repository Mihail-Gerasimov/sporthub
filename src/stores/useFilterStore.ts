'use client';

import { create } from 'zustand';

export type DiscoveryMode = 'clubs' | 'trainers';

type FilterState = {
  discoveryMode: DiscoveryMode;
  searchQuery: string;
  selectedSportId: number | null;
  setDiscoveryMode: (mode: DiscoveryMode) => void;
  setSearch: (value: string) => void;
  setSport: (sportId: number | null) => void;
  resetFilters: () => void;
};

const initialFilterState = {
  discoveryMode: 'clubs' as DiscoveryMode,
  searchQuery: '',
  selectedSportId: null,
};

export const useFilterStore = create<FilterState>()((set) => ({
  ...initialFilterState,
  setDiscoveryMode: (mode) => {
    set({
      discoveryMode: mode,
    });
  },
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
