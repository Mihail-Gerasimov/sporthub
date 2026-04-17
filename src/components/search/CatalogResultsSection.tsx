'use client';

import { ClubList } from '@/components/clubs';
import { TrainerList, type TrainerDirectoryItem } from '@/components/trainers';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Sport, Tag } from '@/types';

type CatalogResultsSectionProps = {
  clubs: Club[];
  sports: Array<Pick<Sport, 'id' | 'name' | 'icon'>>;
  /** Справочник тегов для резолвинга tagIds → имена в карточках клубов */
  tags: Tag[];
  trainers: TrainerDirectoryItem[];
};

export function CatalogResultsSection({
  clubs,
  sports,
  tags,
  trainers,
}: CatalogResultsSectionProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);

  return discoveryMode === 'clubs' ? (
    <ClubList clubs={clubs} sports={sports} tags={tags} />
  ) : (
    <TrainerList trainers={trainers} />
  );
}
