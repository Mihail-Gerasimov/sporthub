import { normalizeMatchKey } from '@sporthub/domain';
import type { EntityId } from '@sporthub/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type FilterTrainersOptions = {
  searchQuery: string;
  selectedSportId: EntityId | null;
  /** Фильтр по городу (case-insensitive). Пустая строка — без фильтра. */
  selectedCity?: string;
  trainers: TrainerDirectoryItem[];
};

export function filterTrainers({
  searchQuery,
  selectedCity = '',
  selectedSportId,
  trainers,
}: FilterTrainersOptions): TrainerDirectoryItem[] {
  const normalizedSearch = normalizeMatchKey(searchQuery);
  const normalizedCity = normalizeMatchKey(selectedCity);

  return trainers.filter((trainer) => {
    const matchesSport = selectedSportId === null || trainer.sportIds.includes(selectedSportId);
    const matchesCity = normalizedCity === '' || normalizeMatchKey(trainer.city) === normalizedCity;
    const matchesSearch = normalizedSearch === '' || trainer.searchText.includes(normalizedSearch);

    return matchesSport && matchesCity && matchesSearch;
  });
}
