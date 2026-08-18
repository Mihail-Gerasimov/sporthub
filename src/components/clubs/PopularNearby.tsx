'use client';

import { useRef } from 'react';

import { ClubCard } from '@/components/clubs/ClubCard';
import { PopularTrainers } from '@/components/trainers';
import { Badge, Button, Card } from '@/components/ui';
import type { ReliabilityResult } from '@sporthub/domain';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, EntityId, Sport, Tag } from '@sporthub/types';

import type { TrainerDirectoryItem } from '@/components/trainers';

type PopularNearbySport = Pick<Sport, 'id' | 'name' | 'icon'>;

type PopularNearbyProps = {
  clubs: Club[];
  sports: PopularNearbySport[];
  /** Справочник тегов для резолвинга tagIds → имена в карточках */
  tags?: Tag[];
  trainers: TrainerDirectoryItem[];
  /** Phase 25 Step 25.13: map id→reliability для клубов. */
  reliabilityByClubId?: Map<EntityId, ReliabilityResult>;
  /** Phase 25 Step 25.13: map id→reliability для тренеров. */
  reliabilityByTrainerId?: Map<EntityId, ReliabilityResult>;
};

const POPULAR_NEARBY_SCROLL_STEP = 360;

function sortByPopularity(clubs: Club[]): Club[] {
  return [...clubs].sort((left, right) => {
    if (right.rating !== left.rating) {
      return right.rating - left.rating;
    }

    if (right.reviewCount !== left.reviewCount) {
      return right.reviewCount - left.reviewCount;
    }

    return left.distanceKm - right.distanceKm;
  });
}

export function PopularNearby({
  clubs,
  sports,
  tags = [],
  trainers,
  reliabilityByClubId,
  reliabilityByTrainerId,
}: PopularNearbyProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const popularClubs = sortByPopularity(clubs).slice(0, 6);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  if (discoveryMode === 'trainers') {
    return <PopularTrainers trainers={trainers} reliabilityByTrainerId={reliabilityByTrainerId} />;
  }

  function scrollCarousel(direction: 'left' | 'right') {
    scrollContainerRef.current?.scrollBy({
      left: direction === 'left' ? -POPULAR_NEARBY_SCROLL_STEP : POPULAR_NEARBY_SCROLL_STEP,
      behavior: 'smooth',
    });
  }

  return (
    <section id="highlights" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Nearby highlights
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Популярное рядом</h2>
          <p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted sm:text-base">
            Быстрый горизонтальный ряд с клубами, которые сильнее всего выделяются по рейтингу и
            отзывам.
          </p>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Badge tone="accent">Топ по рейтингу</Badge>
          <Badge tone="outline">MVP без геолокации</Badge>
        </div>
      </div>

      {popularClubs.length === 0 ? (
        <Card data-testid="popular-nearby-empty" className="bg-panel-strong">
          <p className="text-sm leading-relaxed text-muted">
            Клубный каталог пока пуст. После первой публикации здесь появятся новые клубы, которые
            можно будет открыть из главной страницы.
          </p>
        </Card>
      ) : (
        <>
          <div className="-mx-6 px-6 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12">
            <div className="mb-3 flex items-center justify-start gap-2">
              <Button
                size="sm"
                variant="outline"
                className="min-w-10 px-0"
                aria-label="Прокрутить популярные клубы влево"
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
                aria-label="Прокрутить популярные клубы вправо"
                onClick={() => {
                  scrollCarousel('right');
                }}
              >
                <span aria-hidden="true">→</span>
              </Button>
            </div>

            <div
              ref={scrollContainerRef}
              data-testid="popular-nearby-scroll"
              className="scrollbar-hidden overflow-x-auto py-3"
            >
              <div className="flex min-w-max items-stretch gap-4">
                {popularClubs.map((club, i) => (
                  <div
                    key={club.id}
                    className="flex h-full w-[19.5rem] shrink-0 snap-start sm:w-[22rem]"
                  >
                    <ClubCard
                      club={club}
                      sports={sports}
                      tags={tags}
                      index={i}
                      reliability={reliabilityByClubId?.get(club.id)}
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <Card className="bg-panel-strong">
            <p className="text-sm leading-relaxed text-muted">
              На MVP блок «рядом» пока не использует геолокацию. Здесь показывается топ-клубов по
              рейтингу и отзывам, чтобы быстро подсветить сильные места каталога.
            </p>
          </Card>
        </>
      )}
    </section>
  );
}
