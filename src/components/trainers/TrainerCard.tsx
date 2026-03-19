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
    'from-[#113d45] via-[#1d6c74] to-[#f1d2af]',
    'from-[#713321] via-[#d17a4f] to-[#f4dfc4]',
    'from-[#16363f] via-[#5f918f] to-[#efe3ca]',
    'from-[#3e4f56] via-[#d06f4a] to-[#f4d8bb]',
  ];

  return palettes[trainerId % palettes.length];
}

function getTrainerInitials(name: string): string {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((word) => word.charAt(0).toUpperCase())
    .join('');
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
        <div className="grid gap-0 md:grid-cols-[0.88fr_1.12fr]">
          <div
            className={`relative min-h-72 overflow-hidden bg-gradient-to-br ${getCoverPalette(trainer.id)} p-5 text-panel`}
          >
            <div className="absolute inset-0 opacity-30">
              <div className="absolute right-[-14%] top-[-8%] size-40 rounded-full border border-panel/25" />
              <div className="absolute bottom-[-18%] left-[-8%] size-48 rounded-full border border-panel/20" />
            </div>

            <div className="relative flex h-full flex-col justify-between gap-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <Badge className="bg-panel/16 text-panel" tone="outline">
                  {trainer.city}
                </Badge>
                {highlighted ? (
                  <Badge className="border-panel/20 bg-panel text-accent-strong" tone="outline">
                    Выбрано на карте
                  </Badge>
                ) : null}
              </div>

              <div className="flex justify-center py-2">
                <div className="relative flex size-44 items-center justify-center rounded-[2rem] border border-panel/24 bg-panel/18 shadow-floating backdrop-blur-sm">
                  <div className="absolute inset-x-5 bottom-0 h-24 rounded-t-[999px] bg-panel/15" />
                  <div className="absolute top-6 size-18 rounded-full bg-panel/88" />
                  <div className="absolute bottom-6 h-24 w-24 rounded-t-[999px] bg-panel/82" />
                  <span className="absolute bottom-5 rounded-pill bg-panel px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent-strong">
                    Фото-заглушка
                  </span>
                  <span className="absolute left-4 top-4 text-sm font-semibold uppercase tracking-[0.2em] text-panel/70">
                    {getTrainerInitials(trainer.name)}
                  </span>
                </div>
              </div>

              <div className="flex items-end justify-between gap-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-[0.24em] text-panel/72">
                    Персональный тренер
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
          </div>

          <div className="flex flex-1 flex-col gap-5 p-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="flex flex-wrap gap-2">
                  <Badge tone="outline">{trainer.experienceYears} лет опыта</Badge>
                  {trainer.primaryOfferingFormat ? (
                    <Badge tone="teal">
                      {trainer.primaryOfferingFormat === 'personal'
                        ? 'Персонально'
                        : trainer.primaryOfferingFormat === 'mini_group'
                          ? 'Мини-группа'
                          : 'Группа'}
                    </Badge>
                  ) : null}
                </div>
                <p
                  className={cn(
                    'mt-4 text-sm font-medium leading-7 text-muted',
                    isCarousel && 'min-h-[4rem]',
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
                <p className="mt-1 text-lg font-semibold text-ink">
                  {formatPrice(trainer.priceFrom)}
                </p>
                <p className="text-xs text-muted">
                  {trainer.distanceKm === null
                    ? `${trainer.availableSlotsCount} окон`
                    : `${trainer.distanceKm.toFixed(1)} км`}
                </p>
              </div>
            </div>

            <div className="grid gap-3 rounded-card border border-line bg-panel-strong p-4 sm:grid-cols-2">
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Площадка
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">{trainer.venueLabel}</p>
                {trainer.venueName ? (
                  <p className="mt-1 text-xs text-muted">{trainer.venueAddress}</p>
                ) : null}
              </div>
              <div>
                <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                  Ближайшее окно
                </p>
                <p className="mt-2 text-sm font-semibold text-ink">{nextSlotLabel}</p>
              </div>
            </div>

            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                Сильные стороны
              </p>
              <div
                className={cn(
                  'mt-3 flex flex-wrap gap-2',
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
            </div>

            <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
              <p className="max-w-xs text-sm leading-7 text-muted">{trainer.bio}</p>

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
        </div>
      </Card>
    </article>
  );
}
