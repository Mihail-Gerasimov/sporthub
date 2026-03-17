'use client';

import type { Club, Sport } from '@/types';

import { Badge, Card } from '@/components/ui';
import { ClubCard } from '@/components/clubs/ClubCard';
import { useFilterStore } from '@/stores/useFilterStore';

type ClubListSport = Pick<Sport, 'id' | 'name' | 'icon'>;

type ClubListProps = {
  clubs: Club[];
  sports: ClubListSport[];
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

export function ClubList({ clubs, sports }: ClubListProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);

  const normalizedSearch = normalize(searchQuery);

  const filteredClubs = clubs.filter((club) => {
    const matchesSport = selectedSportId === null || club.sportIds.includes(selectedSportId);

    const searchStack = [
      club.name,
      club.shortDescription,
      club.description,
      club.tags.join(' '),
      sports
        .filter((sport) => club.sportIds.includes(sport.id))
        .map((sport) => sport.name)
        .join(' '),
    ]
      .join(' ')
      .toLocaleLowerCase('ru-RU');

    const matchesSearch = normalizedSearch === '' || searchStack.includes(normalizedSearch);

    return matchesSport && matchesSearch;
  });

  return (
    <section id="clubs" className="space-y-4">
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

        {filteredClubs.length > 0 ? (
          <div className="grid gap-4 lg:grid-cols-2">
            {filteredClubs.map((club) => (
              <ClubCard key={club.id} club={club} sports={sports} />
            ))}
          </div>
        ) : (
          <div className="rounded-card border border-dashed border-line bg-canvas p-6 text-sm leading-7 text-muted">
            По текущему запросу клубов не найдено. Попробуй очистить поиск или выбрать другой вид
            спорта.
          </div>
        )}
      </Card>
    </section>
  );
}
