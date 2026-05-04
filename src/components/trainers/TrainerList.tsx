'use client';

/*
 * TrainerList — выдача тренеров под фильтр на главной странице.
 * Step 28.10: оборачиваем карточки в <CardSlider> (Phase 28.6) с
 * accent="orange". Передаём index={i} в каждую карточку — это даёт
 * watermark номера ранга и tone-ротацию (orange/lime/blank) в hero
 * TrainerCard.
 *
 * embedded prop удалён — нигде не использовался.
 */
import { CardSlider } from '@/components/ui';
import { filterTrainers } from '@/components/trainers/filterTrainers';
import { TrainerCard } from '@/components/trainers/TrainerCard';
import type { ReliabilityResult } from '@/lib/reliability';
import { useFilterStore } from '@/stores/useFilterStore';
import type { EntityId } from '@/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerListProps = {
  selectedTrainerId?: EntityId | null;
  trainers: TrainerDirectoryItem[];
  /** Phase 25 Step 25.13: опциональная map id→reliability для компактного бейджа. */
  reliabilityByTrainerId?: Map<EntityId, ReliabilityResult>;
};

export function TrainerList({
  selectedTrainerId = null,
  trainers,
  reliabilityByTrainerId,
}: TrainerListProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const selectedCity = useFilterStore((state) => state.selectedCity);

  const filteredTrainers = filterTrainers({
    searchQuery,
    selectedCity,
    selectedSportId,
    trainers,
  });

  return (
    <CardSlider
      eyebrow="Trainer list"
      title="Тренеры под текущие фильтры"
      accent="orange"
      sliderId="trainer-list"
      total={filteredTrainers.length}
      emptyMessage="По текущему запросу тренеров не найдено. Попробуй очистить поиск или выбрать другое направление."
    >
      {filteredTrainers.map((trainer, i) => (
        <TrainerCard
          key={trainer.id}
          highlighted={selectedTrainerId === trainer.id}
          trainer={trainer}
          index={i}
          reliability={reliabilityByTrainerId?.get(trainer.id)}
        />
      ))}
    </CardSlider>
  );
}
