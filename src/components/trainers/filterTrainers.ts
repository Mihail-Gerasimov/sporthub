import type { EntityId } from '@/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type FilterTrainersOptions = {
  searchQuery: string;
  selectedSportId: EntityId | null;
  trainers: TrainerDirectoryItem[];
};

function normalize(value: string): string {
  return value.trim().toLocaleLowerCase('ru-RU');
}

export function filterTrainers({
  searchQuery,
  selectedSportId,
  trainers,
}: FilterTrainersOptions): TrainerDirectoryItem[] {
  const normalizedSearch = normalize(searchQuery);

  return trainers.filter((trainer) => {
    const matchesSport = selectedSportId === null || trainer.sportIds.includes(selectedSportId);
    const matchesSearch = normalizedSearch === '' || trainer.searchText.includes(normalizedSearch);

    return matchesSport && matchesSearch;
  });
}
