'use client';

import type { Sport } from '@/types';

import { Badge, Card, Chip } from '@/components/ui';
import { SearchBar } from '@/components/search/SearchBar';
import { SportFilters } from '@/components/search/SportFilters';
import { useFilterStore } from '@/stores/useFilterStore';

type SportFilterItem = Pick<Sport, 'id' | 'name' | 'icon'>;

type SearchControlsPreviewProps = {
  clubCount: number;
  sports: SportFilterItem[];
  trainerCount: number;
};

const DISCOVERY_MODE_COPY = {
  clubs: {
    description:
      'Выбери направление, уточни запрос и сразу смотри, как меняется карта и клубная выдача без перезагрузки страницы.',
    heading: 'Поиск по клубам и направлениям',
    modeLabel: 'По клубам и направлениям',
  },
  trainers: {
    description:
      'Переключись на каталог тренеров, чтобы искать персональные услуги, направления и доступные окна без ухода с главной.',
    heading: 'Поиск по тренерам и направлениям',
    modeLabel: 'По тренерам и направлениям',
  },
} as const;

export function SearchControlsPreview({
  clubCount,
  sports,
  trainerCount,
}: SearchControlsPreviewProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId);
  const modeCopy = DISCOVERY_MODE_COPY[discoveryMode];
  const activeCatalogCount = discoveryMode === 'clubs' ? clubCount : trainerCount;
  const activeCatalogLabel = discoveryMode === 'clubs' ? 'клубов в выдаче' : 'тренеров в выдаче';

  return (
    <section id="discover" className="space-y-4">
      <Card className="space-y-5 border-accent/12 bg-panel">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Search and filters
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">{modeCopy.heading}</h2>
            <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
              {modeCopy.description}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Самара</Badge>
            <Badge tone="outline">{sports.length} направлений</Badge>
            <Badge tone="teal">
              {activeCatalogCount} {activeCatalogLabel}
            </Badge>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Chip
            active={discoveryMode === 'clubs'}
            onClick={() => {
              setDiscoveryMode('clubs');
            }}
          >
            {DISCOVERY_MODE_COPY.clubs.modeLabel}
          </Chip>
          <Chip
            active={discoveryMode === 'trainers'}
            onClick={() => {
              setDiscoveryMode('trainers');
            }}
          >
            {DISCOVERY_MODE_COPY.trainers.modeLabel}
          </Chip>
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
