'use client';

import type { Sport } from '@sporthub/types';

import { Chip } from '@/components/ui';
import { useFilterStore } from '@/stores/useFilterStore';

type SportFilterItem = Pick<Sport, 'id' | 'name' | 'icon'>;

type SportFiltersProps = {
  sports: SportFilterItem[];
};

export function SportFilters({ sports }: SportFiltersProps) {
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setSport = useFilterStore((state) => state.setSport);

  return (
    <div className="scrollbar-hidden overflow-x-auto">
      <div className="flex min-w-max gap-2 pb-2">
        <Chip
          active={selectedSportId === null}
          onClick={() => {
            setSport(null);
          }}
        >
          <span>Все</span>
        </Chip>

        {sports.map((sport) => (
          <Chip
            key={sport.id}
            active={selectedSportId === sport.id}
            onClick={() => {
              setSport(sport.id);
            }}
          >
            <span className="mr-2" aria-hidden="true">
              {sport.icon}
            </span>
            <span>{sport.name}</span>
          </Chip>
        ))}
      </div>
    </div>
  );
}
