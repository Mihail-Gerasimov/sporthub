'use client';

/*
 * TrainerList — выдача тренеров под фильтр на главной странице.
 * Step 28.10: оборачиваем карточки в <CardSlider> (Phase 28.6) с
 * accent="orange". Передаём index={i} в каждую карточку — это даёт
 * watermark номера ранга и tone-ротацию (orange/lime/blank) в hero
 * TrainerCard.
 * Шаг 38.85: видимых в ряд 1→2→4 по точкам `md`/`xl` (`visibleByBp`) — как сетка
 * тренеров эталона (`hp-trainers-grid`: 4 → 2); ниже `md` — по одной: карточка
 * тренера с лентой специализаций и ценой в 190px не помещается (эталон держит
 * две до 540 на карточке из аватара и имени).
 *
 * embedded prop удалён — нигде не использовался.
 */
import { CardSlider } from '@/components/ui';
import { filterTrainers } from '@/components/trainers/filterTrainers';
import { TrainerCard } from '@/components/trainers/TrainerCard';
import { useFilterStore } from '@/stores/useFilterStore';
import type { EntityId } from '@sporthub/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerListProps = {
  selectedTrainerId?: EntityId | null;
  trainers: TrainerDirectoryItem[];
};

export function TrainerList({ selectedTrainerId = null, trainers }: TrainerListProps) {
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
      visibleByBp={{ sm: 1, md: 2, xl: 4 }}
      total={filteredTrainers.length}
      emptyMessage="По текущему запросу тренеров не найдено. Попробуй очистить поиск или выбрать другое направление."
    >
      {filteredTrainers.map((trainer) => (
        <TrainerCard
          key={trainer.id}
          highlighted={selectedTrainerId === trainer.id}
          trainer={trainer}
        />
      ))}
    </CardSlider>
  );
}
