'use client';

import { create } from 'zustand';

import { DEFAULT_CITY } from '@sporthub/types';
import { normalizeCity } from '@/lib/utils';

export type DiscoveryMode = 'clubs' | 'trainers';

type FilterState = {
  discoveryMode: DiscoveryMode;
  searchQuery: string;
  selectedSportId: number | null;
  /** Выбранный город для фильтрации каталога */
  selectedCity: string;
  setDiscoveryMode: (mode: DiscoveryMode) => void;
  setSearch: (value: string) => void;
  setSport: (sportId: number | null) => void;
  setSelectedCity: (city: string) => void;
  resetFilters: () => void;
};

const initialFilterState = {
  discoveryMode: 'clubs' as DiscoveryMode,
  searchQuery: '',
  selectedSportId: null as number | null,
  selectedCity: DEFAULT_CITY,
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
  setSelectedCity: (city) => {
    set({
      selectedCity: normalizeCity(city),
    });
  },
  resetFilters: () => {
    set(initialFilterState);
  },
}));
