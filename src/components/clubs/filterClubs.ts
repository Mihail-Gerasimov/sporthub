import { normalizeSearchText } from '@/lib/utils';
import type { Club, EntityId, Sport } from '@/types';

export type ClubListSport = Pick<Sport, 'id' | 'name' | 'icon'>;

type FilterClubsOptions = {
  clubs: Club[];
  sports: ClubListSport[];
  searchQuery: string;
  selectedSportId: EntityId | null;
};

export function filterClubs({
  clubs,
  searchQuery,
  selectedSportId,
  sports,
}: FilterClubsOptions): Club[] {
  const normalizedSearch = normalizeSearchText(searchQuery);

  return clubs.filter((club) => {
    const matchesSport = selectedSportId === null || club.sportIds.includes(selectedSportId);

    const searchStack = normalizeSearchText(
      [
        club.name,
        club.shortDescription,
        club.description,
        club.tags.join(' '),
        sports
          .filter((sport) => club.sportIds.includes(sport.id))
          .map((sport) => sport.name)
          .join(' '),
      ].join(' '),
    );

    const matchesSearch = normalizedSearch === '' || searchStack.includes(normalizedSearch);

    return matchesSport && matchesSearch;
  });
}
