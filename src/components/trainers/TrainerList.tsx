'use client';

import { Badge, Card } from '@/components/ui';
import { filterTrainers } from '@/components/trainers/filterTrainers';
import { TrainerCard } from '@/components/trainers/TrainerCard';
import { useFilterStore } from '@/stores/useFilterStore';
import type { EntityId } from '@/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerListProps = {
  embedded?: boolean;
  selectedTrainerId?: EntityId | null;
  trainers: TrainerDirectoryItem[];
};

export function TrainerList({
  embedded = false,
  selectedTrainerId = null,
  trainers,
}: TrainerListProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);

  const filteredTrainers = filterTrainers({
    searchQuery,
    selectedSportId,
    trainers,
  });

  const content =
    filteredTrainers.length > 0 ? (
      <div className="grid gap-4 lg:grid-cols-2">
        {filteredTrainers.map((trainer) => (
          <TrainerCard
            key={trainer.id}
            highlighted={selectedTrainerId === trainer.id}
            trainer={trainer}
          />
        ))}
      </div>
    ) : (
      <div className="rounded-card border border-dashed border-line bg-canvas p-6 text-sm leading-relaxed text-muted">
        По текущему запросу тренеров не найдено. Попробуй очистить поиск или выбрать другое
        направление.
      </div>
    );

  if (embedded) {
    return content;
  }

  return (
    <section id="trainer-list" className="space-y-4">
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
              Trainer list
            </p>
            <h2 className="mt-2 text-2xl font-semibold text-ink">Тренеры под текущие фильтры</h2>
          </div>

          <div className="flex flex-wrap gap-2">
            <Badge tone="accent">{filteredTrainers.length} в выдаче</Badge>
          </div>
        </div>

        {content}
      </Card>
    </section>
  );
}
