'use client';

import type { Club, EntityId } from '@/types';

import { Badge, Card } from '@/components/ui';
import { ClubCard } from '@/components/clubs/ClubCard';
import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { useFilterStore } from '@/stores/useFilterStore';

type ClubListProps = {
  clubs: Club[];
  sports: ClubListSport[];
  selectedClubId?: EntityId | null;
  embedded?: boolean;
};

export function ClubList({
  clubs,
  embedded = false,
  selectedClubId = null,
  sports,
}: ClubListProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);

  const filteredClubs = filterClubs({
    clubs,
    searchQuery,
    selectedSportId,
    sports,
  });

  const content =
    filteredClubs.length > 0 ? (
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredClubs.map((club) => (
          <ClubCard
            key={club.id}
            club={club}
            highlighted={selectedClubId === club.id}
            sports={sports}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-card border border-dashed border-line bg-canvas p-6 text-sm leading-7 text-muted">
        По текущему запросу клубов не найдено. Попробуй очистить поиск или выбрать другой вид
        спорта.
      </div>
    );

  if (embedded) {
    return content;
  }

  return (
    <section id="club-list" className="space-y-4">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
              Club list
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Клубы под текущие фильтры</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{filteredClubs.length} в выдаче</Badge>
            {selectedSportId ? (
              <Badge tone="outline">
                {sports.find((sport) => sport.id === selectedSportId)?.name ??
                  `sportId ${selectedSportId}`}
              </Badge>
            ) : null}
          </div>
        </div>

        {content}
      </Card>
    </section>
  );
}
