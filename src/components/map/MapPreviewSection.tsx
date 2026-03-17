'use client';

import { useState } from 'react';

import { ClubList } from '@/components/clubs';
import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { MapView } from '@/components/map/MapView';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, EntityId } from '@/types';

type MapPreviewSectionProps = {
  clubs: Club[];
  sports: ClubListSport[];
};

export function MapPreviewSection({ clubs, sports }: MapPreviewSectionProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const [selectedClubId, setSelectedClubId] = useState<EntityId | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(true);

  const filteredClubs = filterClubs({
    clubs,
    searchQuery,
    selectedSportId,
    sports,
  });

  const selectedClub =
    filteredClubs.find((club) => club.id === selectedClubId) ?? filteredClubs[0] ?? null;

  return (
    <section id="map" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Main zone</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">
            Карта-заглушка и активная выборка клубов
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">Step 5.6</Badge>
          {selectedClub ? (
            <Badge tone="outline">{`выбран клуб: ${selectedClub.name}`}</Badge>
          ) : (
            <Badge tone="outline">клуб не выбран</Badge>
          )}
          <Button
            aria-controls="main-zone-map-panel"
            aria-expanded={isMapExpanded}
            className="lg:hidden"
            size="sm"
            variant="outline"
            onClick={() => {
              setIsMapExpanded((value) => !value);
            }}
          >
            {isMapExpanded ? 'Скрыть карту' : 'Показать карту'}
          </Button>
        </div>
      </div>

      <div
        data-testid="main-zone-layout"
        className="grid gap-4 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)] lg:items-start"
      >
        <div
          id="main-zone-map-panel"
          data-testid="map-panel"
          data-collapsed={isMapExpanded ? 'false' : 'true'}
          className={cn(!isMapExpanded && 'hidden lg:block')}
        >
          <MapView
            clubs={filteredClubs}
            selectedClubId={selectedClub?.id ?? null}
            onSelectClub={setSelectedClubId}
          />
        </div>

        <div data-testid="list-panel">
          <ClubList clubs={clubs} selectedClubId={selectedClub?.id ?? null} sports={sports} />
        </div>
      </div>
    </section>
  );
}
