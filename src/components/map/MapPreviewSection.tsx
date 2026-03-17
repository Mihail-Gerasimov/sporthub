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
    <section id="clubs" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">Club map</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Клубы на карте и в списке</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Фильтры сверху сразу перестраивают метки и карточки. Карта остаётся главным акцентом
            секции, а список клубов идёт ниже единым широким блоком без тесного деления пополам.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{`В выдаче: ${filteredClubs.length}`}</Badge>
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

      <div data-testid="main-zone-layout" className="flex flex-col gap-4">
        <div
          id="main-zone-map-panel"
          data-testid="map-panel"
          data-collapsed={isMapExpanded ? 'false' : 'true'}
          className={cn('w-full', !isMapExpanded && 'hidden lg:block')}
        >
          <MapView
            clubs={filteredClubs}
            selectedClubId={selectedClub?.id ?? null}
            onSelectClub={setSelectedClubId}
          />
        </div>

        <div data-testid="list-panel" className="w-full">
          <ClubList clubs={clubs} selectedClubId={selectedClub?.id ?? null} sports={sports} />
        </div>
      </div>
    </section>
  );
}
