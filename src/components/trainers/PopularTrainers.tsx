'use client';

import { useRef } from 'react';

import { Badge, Button, Card } from '@/components/ui';
import { TrainerCard } from '@/components/trainers/TrainerCard';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type PopularTrainersProps = {
  trainers: TrainerDirectoryItem[];
};

const POPULAR_TRAINERS_SCROLL_STEP = 360;

function sortByPopularity(trainers: TrainerDirectoryItem[]): TrainerDirectoryItem[] {
  return [...trainers].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    if (right.reviewCount !== left.reviewCount) {
      return right.reviewCount - left.reviewCount;
    }

    return (
      (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY)
    );
  });
}

export function PopularTrainers({ trainers }: PopularTrainersProps) {
  const popularTrainers = sortByPopularity(trainers).slice(0, 6);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  function scrollCarousel(direction: 'left' | 'right') {
    scrollContainerRef.current?.scrollBy({
      left: direction === 'left' ? -POPULAR_TRAINERS_SCROLL_STEP : POPULAR_TRAINERS_SCROLL_STEP,
      behavior: 'smooth',
    });
  }

  return (
    <section id="highlights" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Trainer highlights
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Популярные тренеры</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Горизонтальный ряд с тренерами, которые сильнее всего выделяются по рейтингу, отзывам и
            плотности персонального спроса.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone="accent">Топ по рейтингу</Badge>
          <Badge tone="outline">Персональные услуги</Badge>
        </div>
      </div>

      <div className="-mx-6 px-6 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
        <div className="mb-3 flex items-center justify-start gap-2">
          <Button
            size="sm"
            variant="outline"
            className="min-w-10 px-0"
            aria-label="Прокрутить популярных тренеров влево"
            onClick={() => {
              scrollCarousel('left');
            }}
          >
            <span aria-hidden="true">←</span>
          </Button>
          <Button
            size="sm"
            variant="outline"
            className="min-w-10 px-0"
            aria-label="Прокрутить популярных тренеров вправо"
            onClick={() => {
              scrollCarousel('right');
            }}
          >
            <span aria-hidden="true">→</span>
          </Button>
        </div>

        <div
          ref={scrollContainerRef}
          data-testid="popular-trainers-scroll"
          className="scrollbar-hidden overflow-x-auto py-3"
        >
          <div className="flex min-w-max items-stretch gap-4">
            {popularTrainers.map((trainer) => (
              <div
                key={trainer.id}
                className="flex h-full w-[19.5rem] shrink-0 snap-start sm:w-[22rem]"
              >
                <TrainerCard trainer={trainer} variant="carousel" />
              </div>
            ))}
          </div>
        </div>
      </div>

      <Card className="bg-panel-strong">
        <p className="text-sm leading-relaxed text-muted">
          В trainer-mode блок строится вокруг самих тренеров и их услуг, а не вокруг клубной выдачи.
          Здесь собраны самые заметные профили с ближайшими окнами для записи.
        </p>
      </Card>
    </section>
  );
}
