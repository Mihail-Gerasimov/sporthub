import { normalizeMatchKey } from '@sporthub/domain';
import { resolveNames } from '@/lib/utils';
import type { Club, EntityId, Sport, Tag } from '@sporthub/types';

export type ClubListSport = Pick<Sport, 'id' | 'name' | 'icon'>;

type FilterClubsOptions = {
  clubs: Club[];
  sports: ClubListSport[];
  /** Справочник тегов для резолвинга tagIds → имена в поиске */
  tags?: Tag[];
  searchQuery: string;
  selectedSportId: EntityId | null;
  /** Фильтр по городу (case-insensitive). Пустая строка — без фильтра. */
  selectedCity?: string;
};

export function filterClubs({
  clubs,
  searchQuery,
  selectedCity = '',
  selectedSportId,
  sports,
  tags = [],
}: FilterClubsOptions): Club[] {
  const normalizedSearch = normalizeMatchKey(searchQuery);
  const normalizedCity = normalizeMatchKey(selectedCity);

  return clubs.filter((club) => {
    const matchesSport = selectedSportId === null || club.sportIds.includes(selectedSportId);

    const matchesCity = normalizedCity === '' || normalizeMatchKey(club.city) === normalizedCity;

    const searchStack = [
      club.name,
      club.shortDescription,
      club.description,
      resolveNames(club.tagIds, tags).join(' '),
      sports
        .filter((sport) => club.sportIds.includes(sport.id))
        .map((sport) => sport.name)
        .join(' '),
    ]
      .join(' ')
      .toLocaleLowerCase('ru-RU');

    const matchesSearch = normalizedSearch === '' || searchStack.includes(normalizedSearch);

    return matchesSport && matchesCity && matchesSearch;
  });
}
