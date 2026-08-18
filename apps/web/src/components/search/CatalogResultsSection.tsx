'use client';

import { ClubList } from '@/components/clubs';
import { TrainerList, type TrainerDirectoryItem } from '@/components/trainers';
import type { ReliabilityResult } from '@sporthub/domain';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, EntityId, Sport, Tag } from '@sporthub/types';

type CatalogResultsSectionProps = {
  clubs: Club[];
  sports: Array<Pick<Sport, 'id' | 'name' | 'icon'>>;
  /** Справочник тегов для резолвинга tagIds → имена в карточках клубов */
  tags: Tag[];
  trainers: TrainerDirectoryItem[];
  /** Phase 25 Step 25.13: reliability maps для публичных бейджей. */
  reliabilityByClubId?: Map<EntityId, ReliabilityResult>;
  reliabilityByTrainerId?: Map<EntityId, ReliabilityResult>;
};

export function CatalogResultsSection({
  clubs,
  sports,
  tags,
  trainers,
  reliabilityByClubId,
  reliabilityByTrainerId,
}: CatalogResultsSectionProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);

  return discoveryMode === 'clubs' ? (
    <ClubList clubs={clubs} sports={sports} tags={tags} reliabilityByClubId={reliabilityByClubId} />
  ) : (
    <TrainerList trainers={trainers} reliabilityByTrainerId={reliabilityByTrainerId} />
  );
}
