'use client';

import { useState } from 'react';

import { ClubList } from '@/components/clubs';
import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { MapView } from '@/components/map/MapView';
import { filterTrainers, TrainerList, TrainerMapView } from '@/components/trainers';
import { Badge, Button } from '@/components/ui';
import { cn } from '@/lib/utils';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, EntityId } from '@/types';

import type { TrainerDirectoryItem } from '@/components/trainers';

type MapPreviewSectionProps = {
  clubs: Club[];
  sports: ClubListSport[];
  trainers: TrainerDirectoryItem[];
};

export function MapPreviewSection({ clubs, sports, trainers }: MapPreviewSectionProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);

  const filteredClubs = filterClubs({
    clubs,
    searchQuery,
    selectedSportId,
    sports,
  });
  const filteredTrainers = filterTrainers({
    searchQuery,
    selectedSportId,
    trainers,
  });

  const isTrainerMode = discoveryMode === 'trainers';
  const activeResultCount = isTrainerMode ? filteredTrainers.length : filteredClubs.length;
  const activeHeading = isTrainerMode ? 'Тренеры на карте и в списке' : 'Клубы на карте и в списке';
  const activeDescription = isTrainerMode
    ? 'Фильтры сверху перестраивают точки тренеров, их карточки и ближайшие окна записи. На карте остаются именно персональные услуги и площадки, где тренер ведёт занятия.'
    : 'Фильтры сверху сразу перестраивают метки и карточки. Карта остаётся главным акцентом секции, а список клубов идёт ниже единым широким блоком без тесного деления пополам.';

  return (
    <section id="results" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            {isTrainerMode ? 'Trainer map' : 'Club map'}
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">{activeHeading}</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            {activeDescription}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Badge tone="accent">{`В выдаче: ${activeResultCount}`}</Badge>
        </div>
      </div>

      {isTrainerMode ? (
        <TrainerResults trainers={filteredTrainers} />
      ) : (
        <ClubResults clubs={filteredClubs} sports={sports} />
      )}
    </section>
  );
}

function ClubResults({ clubs, sports }: { clubs: Club[]; sports: ClubListSport[] }) {
  const [selectedClubId, setSelectedClubId] = useState<EntityId | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(true);
  const selectedClub = clubs.find((club) => club.id === selectedClubId) ?? clubs[0] ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
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

      <div data-testid="main-zone-layout" className="flex flex-col gap-4">
        <div
          id="main-zone-map-panel"
          data-testid="map-panel"
          data-collapsed={isMapExpanded ? 'false' : 'true'}
          className={cn('w-full', !isMapExpanded && 'hidden lg:block')}
        >
          <MapView
            clubs={clubs}
            selectedClubId={selectedClub?.id ?? null}
            onSelectClub={setSelectedClubId}
          />
        </div>

        <div data-testid="list-panel" className="w-full">
          <ClubList clubs={clubs} selectedClubId={selectedClub?.id ?? null} sports={sports} />
        </div>
      </div>
    </>
  );
}

function TrainerResults({ trainers }: { trainers: TrainerDirectoryItem[] }) {
  const [selectedTrainerId, setSelectedTrainerId] = useState<EntityId | null>(null);
  const [isMapExpanded, setIsMapExpanded] = useState(true);
  const selectedTrainer =
    trainers.find((trainer) => trainer.id === selectedTrainerId) ?? trainers[0] ?? null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        {selectedTrainer ? (
          <Badge tone="outline">{`выбран тренер: ${selectedTrainer.name}`}</Badge>
        ) : (
          <Badge tone="outline">тренер не выбран</Badge>
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

      <div data-testid="main-zone-layout" className="flex flex-col gap-4">
        <div
          id="main-zone-map-panel"
          data-testid="map-panel"
          data-collapsed={isMapExpanded ? 'false' : 'true'}
          className={cn('w-full', !isMapExpanded && 'hidden lg:block')}
        >
          <TrainerMapView
            selectedTrainerId={selectedTrainer?.id ?? null}
            trainers={trainers}
            onSelectTrainer={setSelectedTrainerId}
          />
        </div>

        <div data-testid="list-panel" className="w-full">
          <TrainerList selectedTrainerId={selectedTrainer?.id ?? null} trainers={trainers} />
        </div>
      </div>
    </>
  );
}
