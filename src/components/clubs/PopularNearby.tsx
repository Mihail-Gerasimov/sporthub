import { Badge, Card } from '@/components/ui';
import { ClubCard } from '@/components/clubs/ClubCard';
import type { Club, Sport } from '@/types';

type PopularNearbySport = Pick<Sport, 'id' | 'name' | 'icon'>;

type PopularNearbyProps = {
  clubs: Club[];
  sports: PopularNearbySport[];
};

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

export function PopularNearby({ clubs, sports }: PopularNearbyProps) {
  const popularClubs = sortByPopularity(clubs).slice(0, 6);

  return (
    <section id="popular-nearby" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Nearby highlights
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Популярное рядом</h2>
          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted sm:text-base">
            Быстрый горизонтальный ряд с клубами, которые сильнее всего выделяются по рейтингу и
            отзывам.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Топ по рейтингу</Badge>
          <Badge tone="outline">MVP без геолокации</Badge>
        </div>
      </div>

      <div
        data-testid="popular-nearby-scroll"
        className="-mx-6 overflow-x-auto px-6 py-3 sm:-mx-8 sm:px-8 lg:-mx-12 lg:px-12"
      >
        <div className="flex min-w-max items-stretch gap-4">
          {popularClubs.map((club) => (
            <div key={club.id} className="flex h-full w-[19.5rem] shrink-0 snap-start sm:w-[22rem]">
              <ClubCard club={club} sports={sports} variant="carousel" />
            </div>
          ))}
        </div>
      </div>

      <Card className="bg-panel-strong">
        <p className="text-sm leading-7 text-muted">
          На MVP блок «рядом» пока не использует геолокацию. Здесь показывается топ-клубов по
          рейтингу и отзывам, чтобы быстро подсветить сильные места каталога.
        </p>
      </Card>
    </section>
  );
}
