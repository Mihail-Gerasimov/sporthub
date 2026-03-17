'use client';

import type { Sport } from '@/types';

import { Badge, Card } from '@/components/ui';
import { SearchBar } from '@/components/search/SearchBar';
import { SportFilters } from '@/components/search/SportFilters';
import { useFilterStore } from '@/stores/useFilterStore';

type SportFilterItem = Pick<Sport, 'id' | 'name' | 'icon'>;

type SearchControlsPreviewProps = {
  sports: SportFilterItem[];
};

export function SearchControlsPreview({ sports }: SearchControlsPreviewProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId);

  return (
    <section id="discover" className="space-y-4">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Search controls
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Быстрый поиск и спортивные фильтры
            </h2>
          </div>
          <Badge tone="accent">Step 5.3</Badge>
        </div>

        <SearchBar />
        <SportFilters sports={sports} />

        <div className="flex flex-wrap gap-3">
          <Badge tone="outline">search: {searchQuery.trim() || 'пусто'}</Badge>
          <Badge tone="teal">sport: {selectedSport?.name ?? 'не выбран'}</Badge>
        </div>
      </Card>
    </section>
  );
}
