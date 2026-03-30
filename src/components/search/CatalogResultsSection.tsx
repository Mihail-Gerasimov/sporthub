'use client';

import { ClubList } from '@/components/clubs';
import { TrainerList, type TrainerDirectoryItem } from '@/components/trainers';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Sport } from '@/types';

type CatalogResultsSectionProps = {
  clubs: Club[];
  sports: Array<Pick<Sport, 'id' | 'name' | 'icon'>>;
  trainers: TrainerDirectoryItem[];
};

export function CatalogResultsSection({ clubs, sports, trainers }: CatalogResultsSectionProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);

  return discoveryMode === 'clubs' ? (
    <ClubList clubs={clubs} sports={sports} />
  ) : (
    <TrainerList trainers={trainers} />
  );
}
