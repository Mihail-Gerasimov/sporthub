import Link from 'next/link';

import { Badge, Card, Rating, ReliabilityBadge } from '@/components/ui';
import { getCoverPalette, getTrainerInitials } from '@/components/trainers/trainer-utils';
import { cn, formatCityDisplay, formatDate, formatPrice } from '@/lib/utils';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';
import type { ReliabilityResult } from '@/lib/reliability';

type TrainerCardProps = {
  highlighted?: boolean;
  trainer: TrainerDirectoryItem;
  variant?: 'default' | 'carousel';
  /**
   * Phase 25 Step 25.13: публичная симметрия репутации. Если передан —
   * рендерим компактный `ReliabilityBadge` в блоке рейтинга. Если не передан —
   * ничего не показываем (рассчитано SSR'ом выше по дереву — см. home page).
   */
  reliability?: ReliabilityResult;
};

export function TrainerCard({
  highlighted = false,
  trainer,
  variant = 'default',
  reliability,
}: TrainerCardProps) {
  const isCarousel = variant === 'carousel';
  const previewSports = trainer.sports.slice(0, isCarousel ? 2 : 3);
  const previewSpecialties = trainer.specialtyNames.slice(0, isCarousel ? 2 : 3);
  const nextSlotLabel =
    trainer.nextSlotDate && trainer.nextSlotStartTime
      ? `${formatDate(trainer.nextSlotDate, { day: 'numeric', month: 'long' })}, ${trainer.nextSlotStartTime}`
      : 'Свободные окна скоро появятся';

  /* Метка расстояния или количества слотов */
  const distanceLabel =
    trainer.distanceKm === null
      ? `${trainer.availableSlotsCount} окон`
      : `${trainer.distanceKm.toFixed(1)} км`;

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
        {/* Cover-секция: gradient + фото placeholder */}
        <div
          className={`relative min-h-52 overflow-hidden bg-gradient-to-br ${getCoverPalette(trainer.id)} p-5 text-panel`}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 space-y-2">
              <Badge className="bg-panel/16 text-panel" tone="outline">
                {formatCityDisplay(trainer.city)}
              </Badge>
              {highlighted ? (
                <Badge className="border-panel/20 bg-panel text-accent-strong" tone="outline">
                  Выбрано на карте
                </Badge>
              ) : null}
            </div>

            {/* Фото-заглушка (компактная) */}
            <div className="relative flex size-32 shrink-0 items-center justify-center rounded-[1.5rem] border border-panel/24 bg-panel/18 backdrop-blur-sm">
              <div className="absolute top-4 size-14 rounded-full bg-panel/88" />
              <div className="absolute bottom-4 h-18 w-18 rounded-t-[999px] bg-panel/82" />
              <span className="absolute bottom-3 rounded-pill bg-panel px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.10em] text-accent-strong">
                Фото
              </span>
              <span className="absolute left-3 top-3 text-xs font-semibold uppercase tracking-[0.10em] text-panel/70">
                {getTrainerInitials(trainer.name)}
              </span>
            </div>
          </div>

          <div className="mt-8 flex items-end justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.10em] text-panel/72">
                Персональный тренер
              </p>
              <Link
                href={`/trainers/${trainer.slug}`}
                className="mt-3 block max-w-xs font-display text-2xl font-semibold leading-tight transition-opacity duration-200 hover:opacity-80"
              >
                {trainer.name}
              </Link>
            </div>

            <div className="flex gap-2 text-2xl" aria-hidden="true">
              {previewSports.map((sport) => (
                <span key={sport.id}>{sport.icon}</span>
              ))}
            </div>
          </div>
        </div>

        {/* Контент-секция */}
        <div className="flex flex-1 flex-col gap-5 p-5">
          {/* Цена и расстояние — компактная строка */}
          <div className="flex items-center gap-2 text-sm">
            <span className="font-semibold text-ink">от {formatPrice(trainer.priceFrom)}</span>
            <span className="text-muted">·</span>
            <span className="text-muted">{distanceLabel}</span>
          </div>

          {/* Опыт и формат */}
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

          {/* Описание и рейтинг */}
          <div>
            <p
              className={cn(
                'line-clamp-3 break-words text-sm font-medium leading-relaxed text-muted',
                isCarousel && 'min-h-[3.5rem]',
              )}
            >
              {trainer.primaryOfferingTitle ?? trainer.bio}
            </p>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Rating value={trainer.rating} />
              <span className="text-sm text-muted">{trainer.reviewCount} отзывов</span>
              {reliability ? <ReliabilityBadge reliability={reliability} compact /> : null}
            </div>
          </div>

          {/* Площадка и ближайшее окно */}
          <div className="grid gap-3 rounded-card border border-line bg-panel-strong p-4 sm:grid-cols-2">
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                Площадка
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">{trainer.venueLabel}</p>
              {trainer.venueName ? (
                <p className="mt-1 text-xs text-muted">{trainer.venueAddress}</p>
              ) : null}
            </div>
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                Ближайшее окно
              </p>
              <p className="mt-2 text-sm font-semibold text-ink">{nextSlotLabel}</p>
            </div>
          </div>

          {/* Сильные стороны */}
          <div className={cn('flex flex-wrap gap-2', isCarousel && 'min-h-[5.5rem] content-start')}>
            {previewSpecialties.map((name) => (
              <Badge key={name} tone="outline">
                {name}
              </Badge>
            ))}
            {previewSports.map((sport) => (
              <Badge key={sport.id} tone="teal">
                {sport.name}
              </Badge>
            ))}
          </div>

          {/* Футер: bio + ссылка на запись */}
          <div className="mt-auto flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
            <p className="line-clamp-2 max-w-xs text-sm leading-relaxed text-muted">
              {trainer.bio}
            </p>

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
