import type { EntityId } from '@sporthub/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type FilterTrainersOptions = {
  searchQuery: string;
  selectedSportId: EntityId | null;
  /** Фильтр по городу (case-insensitive). Пустая строка — без фильтра. */
  selectedCity?: string;
  trainers: TrainerDirectoryItem[];
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

export function filterTrainers({
  searchQuery,
  selectedCity = '',
  selectedSportId,
  trainers,
}: FilterTrainersOptions): TrainerDirectoryItem[] {
  const normalizedSearch = normalize(searchQuery);
  const normalizedCity = normalize(selectedCity);

  return trainers.filter((trainer) => {
    const matchesSport = selectedSportId === null || trainer.sportIds.includes(selectedSportId);
    const matchesCity = normalizedCity === '' || normalize(trainer.city) === normalizedCity;
    const matchesSearch = normalizedSearch === '' || trainer.searchText.includes(normalizedSearch);

    return matchesSport && matchesCity && matchesSearch;
  });
}
