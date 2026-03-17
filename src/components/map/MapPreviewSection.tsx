'use client';

import { useState } from 'react';

import { ClubList } from '@/components/clubs';
import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { MapView } from '@/components/map/MapView';
import { Badge, Card } from '@/components/ui';
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
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Map preview
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">
              Карта-заглушка и активная выборка клубов
            </h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">Step 5.5</Badge>
            {selectedClub ? (
              <Badge tone="outline">{`выбран клуб: ${selectedClub.name}`}</Badge>
            ) : (
              <Badge tone="outline">клуб не выбран</Badge>
            )}
          </div>
        </div>

        <MapView
          clubs={filteredClubs}
          selectedClubId={selectedClub?.id ?? null}
          onSelectClub={setSelectedClubId}
        />

        <ClubList
          clubs={clubs}
          embedded
          selectedClubId={selectedClub?.id ?? null}
          sports={sports}
        />
      </Card>
    </section>
  );
}
