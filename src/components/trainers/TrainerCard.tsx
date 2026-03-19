import Link from 'next/link';

import { Badge, Card, Rating } from '@/components/ui';
import { cn, formatDate, formatPrice } from '@/lib/utils';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerCardProps = {
  highlighted?: boolean;
  trainer: TrainerDirectoryItem;
  variant?: 'default' | 'carousel';
};

function getCoverPalette(trainerId: number): string {
  const palettes = [
    'from-[#0f5961] via-[#18323d] to-[#0e171c]',
    'from-[#c86b43] via-[#7c3623] to-[#1d252b]',
    'from-[#275860] via-[#0f5961] to-[#17343f]',
    'from-accent/92 via-accent-strong/86 to-[#4f291f]',
  ];

  return palettes[trainerId % palettes.length];
}

export function TrainerCard({
  highlighted = false,
  trainer,
  variant = 'default',
}: TrainerCardProps) {
  const isCarousel = variant === 'carousel';
  const previewSports = trainer.sports.slice(0, isCarousel ? 2 : 3);
  const previewSpecialties = trainer.specialties.slice(0, isCarousel ? 2 : 3);
  const nextSlotLabel =
    trainer.nextSlotDate && trainer.nextSlotStartTime
      ? `${formatDate(trainer.nextSlotDate, { day: 'numeric', month: 'long' })}, ${trainer.nextSlotStartTime}`
      : 'Свободные окна скоро появятся';

  return (
    <article className="h-full w-full">
      <Card
        data-card-variant={variant}
        data-testid="trainer-card-surface"
        className={cn(
          'flex h-full flex-col overflow-hidden p-0 transition-transform duration-200',
          isCarousel ? 'hover:-translate-y-0.5' : 'hover:-translate-y-1',
          highlighted && 'ring-2 ring-accent/35',
        )}
      >
        <div
          className={`relative min-h-52 bg-gradient-to-br ${getCoverPalette(trainer.id)} p-5 text-panel`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <Badge className="bg-panel/14 text-panel" tone="outline">
                {trainer.city}
              </Badge>
              <Badge className="border-panel/20 bg-panel/12 text-panel" tone="outline">
                {trainer.experienceYears} лет опыта
              </Badge>
              {highlighted ? (
                <Badge className="border-panel/20 bg-panel text-accent-strong" tone="outline">
                  Выбрано на карте
                </Badge>
              ) : null}
            </div>

            <span className="min-w-[8.75rem] shrink-0 whitespace-nowrap rounded-pill bg-panel/14 px-3 py-1.5 text-center text-xs font-semibold uppercase tracking-[0.18em] text-panel">
              trainer preview
            </span>
          </div>

          <div className="mt-10 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.24em] text-panel/72">
                {trainer.affiliatedClubName ?? trainer.address}
              </p>
              <p className="mt-3 max-w-xs font-display text-2xl font-semibold leading-tight">
                {trainer.name}
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
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p
                className={cn(
                  'text-sm font-medium text-muted',
                  isCarousel && 'min-h-[3.5rem] leading-7',
                )}
              >
                {trainer.primaryOfferingTitle ?? trainer.bio}
              </p>
              <div className="mt-3 flex flex-wrap items-center gap-3">
                <Rating value={trainer.rating} />
                <span className="text-sm text-muted">{trainer.reviewCount} отзывов</span>
              </div>
            </div>

            <div className="rounded-card border border-line bg-canvas px-4 py-3 text-right">
              <p className="text-xs uppercase tracking-[0.16em] text-muted">от</p>
              <p className="mt-1 text-lg font-semibold text-ink">{formatPrice(trainer.priceFrom)}</p>
              <p className="text-xs text-muted">
                {trainer.distanceKm === null ? `${trainer.availableSlotsCount} окон` : `${trainer.distanceKm.toFixed(1)} км`}
              </p>
            </div>
          </div>

          <div
            className={cn(
              'mt-auto flex flex-wrap gap-2',
              isCarousel && 'min-h-[5.5rem] content-start',
            )}
          >
            {previewSpecialties.map((specialty) => (
              <Badge key={specialty} tone="outline">
                {specialty}
              </Badge>
            ))}
            {previewSports.map((sport) => (
              <Badge key={sport.id} tone="teal">
                {sport.name}
              </Badge>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Ближайшее окно
              </p>
              <p className="mt-1 text-sm text-ink">{nextSlotLabel}</p>
            </div>

            {trainer.nextSlotId ? (
              <Link
                href={`/booking/${trainer.nextSlotId}`}
                className="text-sm font-semibold text-accent-strong transition-transform duration-200 hover:translate-x-1"
              >
                Перейти к записи
              </Link>
            ) : (
              <span className="text-sm font-semibold text-muted">Слоты скоро появятся</span>
            )}
          </div>
        </div>
      </Card>
    </article>
  );
}
