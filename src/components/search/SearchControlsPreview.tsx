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
      <Card className="space-y-5 border-accent/12 bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Search and filters
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Поиск по клубам и занятиям</h2>
            <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
              Выбери направление, уточни запрос и сразу смотри, как меняется карта и клубная выдача
              без перезагрузки страницы.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Самара</Badge>
            <Badge tone="outline">{sports.length} направлений</Badge>
          </div>
        </div>

        <SearchBar />
        <SportFilters sports={sports} />

        <div className="flex flex-wrap gap-3">
          <Badge tone="outline">Запрос: {searchQuery.trim() || 'не задан'}</Badge>
          <Badge tone="teal">Фокус: {selectedSport?.name ?? 'все направления'}</Badge>
        </div>
      </Card>
    </section>
  );
}
