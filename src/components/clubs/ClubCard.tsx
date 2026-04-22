import Link from 'next/link';

import { Badge, Card, Rating, ReliabilityBadge } from '@/components/ui';
import { buildDictMap, cn, formatCityDisplay, formatPrice } from '@/lib/utils';
import type { Club, Sport, Tag } from '@/types';
import type { ReliabilityResult } from '@/lib/reliability';

type ClubCardSport = Pick<Sport, 'id' | 'name' | 'icon'>;

type ClubCardProps = {
  club: Club;
  sports: ClubCardSport[];
  /** Справочник тегов для резолвинга tagIds → имена */
  tags?: Tag[];
  highlighted?: boolean;
  variant?: 'default' | 'carousel';
  /**
   * Phase 25 Step 25.13: публичная симметрия репутации. Если передан —
   * рендерим компактный `ReliabilityBadge` рядом с Rating.
   */
  reliability?: ReliabilityResult;
};

function getCoverPalette(clubId: number): string {
  const palettes = [
    'from-accent/92 via-accent-strong/86 to-[#4f291f]',
    'from-teal/92 via-[#0f5961] to-[#17343f]',
    'from-[#c86b43] via-[#7c3623] to-[#1d252b]',
    'from-[#275860] via-[#18323d] to-[#0e171c]',
  ];

  return palettes[clubId % palettes.length];
}

export function ClubCard({
  club,
  highlighted = false,
  sports,
  tags = [],
  variant = 'default',
  reliability,
}: ClubCardProps) {
  const isCarousel = variant === 'carousel';
  const clubSports = sports.filter((sport) => club.sportIds.includes(sport.id));
  const previewSports = clubSports.slice(0, isCarousel ? 2 : 3);
  const previewTagIds = club.tagIds.slice(0, isCarousel ? 2 : 3);
  // Резолвинг tagIds → имена через справочник
  const tagMap = buildDictMap(tags);
  const previewTags = previewTagIds.map((id) => ({
    id,
    name: tagMap.get(id)?.name ?? `#${id}`,
  }));

  return (
    <Link href={`/clubs/${club.slug}`} className="group block h-full w-full">
      <Card
        data-card-variant={variant}
        data-testid="club-card-surface"
        className={cn(
          'flex h-full flex-col overflow-hidden p-0 transition-transform duration-200',
          isCarousel ? 'group-hover:-translate-y-0.5' : 'group-hover:-translate-y-1',
          highlighted && 'ring-2 ring-accent/35',
        )}
      >
        <div
          className={`relative min-h-52 bg-gradient-to-br ${getCoverPalette(club.id)} p-5 text-panel`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <Badge className="bg-panel/14 text-panel" tone="outline">
                {formatCityDisplay(club.city)}
              </Badge>
              {club.isFeatured ? (
                <Badge className="border-panel/20 bg-panel/12 text-panel" tone="outline">
                  Featured
                </Badge>
              ) : null}
              {highlighted ? (
                <Badge className="border-panel/20 bg-panel text-accent-strong" tone="outline">
                  Выбрано на карте
                </Badge>
              ) : null}
            </div>

            <span
              data-testid="club-card-media-pill"
              className="min-w-[8.75rem] shrink-0 whitespace-nowrap rounded-pill bg-panel/14 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-[0.10em] text-panel"
            >
              фото preview
            </span>
          </div>

          <div className="mt-10 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-panel/72">
                {club.address}
              </p>
              <p className="mt-3 max-w-xs font-display text-2xl font-semibold leading-tight">
                {club.name}
              </p>
            </div>

            <div className="flex gap-2 text-2xl" aria-hidden="true">
              {previewSports.map((sport) => (
                <span key={sport.id}>{sport.icon}</span>
              ))}
            </div>
          </div>
        </div>

        <div className="flex flex-1 flex-col gap-5 p-5">
          {/* Цена и расстояние — компактная строка */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-ink">от {formatPrice(club.priceFrom)}</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{club.distanceKm.toFixed(1)} км</span>
          </div>

          <div>
            <p
              className={cn(
                'line-clamp-3 text-sm font-medium text-muted',
                isCarousel && 'min-h-[3.5rem] leading-relaxed',
              )}
            >
              {club.shortDescription}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Rating value={club.rating} />
              <span className="text-sm text-muted">{club.reviewCount} отзывов</span>
              {reliability ? <ReliabilityBadge reliability={reliability} compact /> : null}
            </div>
          </div>

          <div
            className={cn(
              'mt-auto flex flex-wrap gap-2',
              isCarousel && 'min-h-[5.5rem] content-start',
            )}
          >
            {previewTags.map((tag) => (
              <Badge key={tag.id} tone="outline">
                {tag.name}
              </Badge>
            ))}
            {previewSports.map((sport) => (
              <Badge key={sport.id} tone="teal">
                {sport.name}
              </Badge>
            ))}
          </div>
        </div>
      </Card>
    </Link>
  );
}
