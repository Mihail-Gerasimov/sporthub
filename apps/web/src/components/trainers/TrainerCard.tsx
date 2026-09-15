'use client';

/*
 * TrainerCard — карточка тренера под новый дизайн Phase 28.9.
 * Структура 1-в-1 с claude-design/cards-trainers/sporthub/project/
 * SportHub Cards - Trainers.html (.trainer-card + child grid):
 *   - Hero (min-h 200/184/178) с диагональным orange/lime/blank-лучом,
 *     watermark номера ранга, city-pill (top-left) + trainer-avatar 84×84
 *     (rounded-[16px], dark card-2 фон, инициалы Bowlby + photo-tag «Фото»),
 *     role («Персональный тренер», accent eyebrow), имя как <Link> Bowlby
 *     clamp 2, sport-tag (текстовый chip справа).
 *   - Body-grid с фикс. headline 48px (clamp 2 lines).
 *   - body-meta: orange/lime price-pill + distance/окна.
 *   - exp-row: experience tag + опц. group-chip (orange-soft / lime-soft).
 *   - body-rating: SVG-звёзды + Bowlby num + reviews + опц. бейдж «Новый».
 *   - ReliabilityBadge: отдельной строкой ниже rating-row, только для
 *     warning/danger (при isNewUser скрыт чтобы не дублировать «Новый»).
 *   - meta-box «Площадка / Ближайшее окно» (2 cols на 768+, 1 на 480).
 *   - Tags ChipMarquee — solid orange (или lime для tone-lime).
 *   - Quote-row с border-top: bio + CTA «К записи →» (отдельный <Link>).
 *
 * Важно: вокруг <article> НЕТ обёртки <Link> — тренер имеет два независимых
 * Link (имя на /trainers/[slug] и CTA на /booking/[nextSlotId] либо
 * /trainers/[slug] если слотов нет). Это исключает невалидный nested <a>.
 *
 * Маппинг полей из TrainerDirectoryItem без расширения типов: headline =
 * primaryOfferingTitle ?? bio ?? ''; quote = bio (если headline=bio — пусто
 * чтобы не дублировать); slot = formatDate(nextSlotDate) + nextSlotStartTime
 * (или fallback); venue.sub = venueAddress (если venueName != null).
 */
import Link from 'next/link';

import { ChipMarquee, ReliabilityBadge } from '@/components/ui';
import { getTrainerInitials } from '@/components/trainers/trainer-utils';
import { formatCityDisplay, formatDate, formatPrice } from '@/lib/utils';
import type { ReliabilityResult } from '@sporthub/domain';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerTone = 'orange' | 'lime' | 'blank';
const TONE_CYCLE: TrainerTone[] = ['orange', 'lime', 'blank'];

type TrainerCardProps = {
  trainer: TrainerDirectoryItem;
  /** Индекс карточки в слайдере (0-based) — для watermark и tone-ротации. */
  index?: number;
  /** Подсветка карточки при выборе на карте — accent-бордер. */
  highlighted?: boolean;
  /** Phase 25 Step 25.13: компактный бейдж надёжности отдельной строкой. */
  reliability?: ReliabilityResult;
};

export function TrainerCard({
  trainer,
  index,
  highlighted = false,
  reliability,
}: TrainerCardProps) {
  // wm — двузначный номер ранга («01», «02», …) для watermark hero.
  const wm = index !== undefined ? String(index + 1).padStart(2, '0') : '';
  const tone: TrainerTone = TONE_CYCLE[(index ?? 0) % 3]!;

  // «Новый» — у тренера ещё нет ни рейтинга, ни отзывов.
  const isNew = trainer.reviewCount === 0 && trainer.rating === 0;

  // Группа — для exp-row chip. Null если у тренера нет primaryOffering.
  const isGroup =
    trainer.primaryOfferingFormat === 'group' || trainer.primaryOfferingFormat === 'mini_group';

  // Headline — название первой услуги, fallback на bio. Если в карточке
  // headline уже = bio, в quote-row не дублируем (оставляем пустым).
  const headline = trainer.primaryOfferingTitle ?? trainer.bio ?? '';
  const quote = headline === trainer.bio ? '' : (trainer.bio ?? '');

  // Distance — либо км (если venueClub имеет distanceKm), либо «N окно/окна/окон»
  // с правильным русским склонением.
  const distanceLabel =
    trainer.distanceKm === null
      ? `${trainer.availableSlotsCount} ${pluralizeOkno(trainer.availableSlotsCount)}`
      : `${trainer.distanceKm.toFixed(1)} км`;

  // Slot — дата + время ближайшего свободного окна, либо fallback-сообщение.
  const slotLabel =
    trainer.nextSlotDate && trainer.nextSlotStartTime
      ? `${formatDate(trainer.nextSlotDate, { day: 'numeric', month: 'long' })}, ${trainer.nextSlotStartTime}`
      : 'Слоты скоро появятся';

  // CTA href: на slot если есть, иначе на профиль тренера.
  const ctaHref = trainer.nextSlotId
    ? `/booking/${trainer.nextSlotId}`
    : `/trainers/${trainer.slug}`;

  // Tags — все specialty-имена для marquee.
  const tagItems = trainer.specialtyNames.map((label) => ({ label }));

  // Sport-tag (badge справа от имени) — название первого спорта, если есть.
  const sportTagLabel = trainer.sports[0]?.name ?? null;

  // Hover-цвет бордера зависит от tone.
  const hoverBorderClass =
    tone === 'lime' ? 'hover:border-[var(--ui-lime)]' : 'hover:border-[var(--ui-orange)]';

  // Цвет accent для price-pill, role-eyebrow, CTA hover, photo-tag, group-chip.
  const accentColorClass = tone === 'lime' ? 'text-lime-hov' : 'text-[var(--ui-orange)]';
  const accentBgClass = tone === 'lime' ? 'bg-[var(--ui-lime)]' : 'bg-[var(--ui-orange)]';
  const groupChipClass =
    tone === 'lime'
      ? 'border border-lime/30 bg-lime-soft text-lime-hov'
      : 'border border-orange/30 bg-orange-soft text-orange';
  const ctaHoverClass =
    tone === 'lime'
      ? 'text-lime-hov hover:text-ink'
      : 'text-[var(--ui-orange)] hover:text-[var(--ui-orange-hov)]';

  return (
    <article
      data-testid="trainer-card"
      data-tone={tone}
      data-highlighted={highlighted ? 'true' : 'false'}
      className={`relative grid h-full grid-rows-[auto_auto_auto_48px_auto_auto_auto_auto_auto] overflow-hidden rounded-[18px] border bg-[var(--ui-card)] transition-colors ${
        highlighted ? 'border-[var(--ui-orange)]' : 'border-[var(--ui-line)]'
      } ${hoverBorderClass}`}
    >
      {/* Hero — луч + watermark + city-pill + avatar + role + name + sport-tag */}
      <div className="relative flex min-h-[200px] flex-col justify-between overflow-hidden border-b border-[var(--ui-line-2)] bg-[var(--ui-card-2)] p-5">
        <span aria-hidden="true" className={`absolute inset-0 hero-bg-${tone}`} />

        {wm ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[14px] bottom-[6px] select-none font-display text-[92px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]"
          >
            {wm}
          </span>
        ) : null}

        {/* Top row: city-pill + trainer-avatar 84×84 */}
        <div className="relative z-[1] flex items-start justify-between gap-3.5">
          <span className="inline-flex items-center rounded-full border border-[var(--ui-line)] bg-card/60 px-3 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-ink)]">
            {formatCityDisplay(trainer.city)}
          </span>

          <div className="flex size-[84px] flex-shrink-0 flex-col items-center justify-center gap-1 rounded-[16px] border border-[var(--ui-line)] bg-[var(--ui-card)] p-2">
            <span className="font-display text-[22px] uppercase leading-none tracking-[0.02em] text-[var(--ui-ink)]">
              {getTrainerInitials(trainer.name)}
            </span>
            <span
              className={`rounded-full px-1.5 py-0.5 font-body text-[8px] font-bold uppercase tracking-[0.18em] ${accentBgClass} text-[var(--ui-bg)]`}
            >
              Фото
            </span>
          </div>
        </div>

        {/* Bottom row: role + name (Link) + sport-tag */}
        <div className="relative z-[1] flex items-end justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              className={`mb-2.5 font-body text-[10px] font-bold uppercase leading-tight tracking-[0.18em] ${accentColorClass}`}
            >
              Персональный тренер
            </p>
            <h3 className="line-clamp-2 font-display text-[22px] uppercase leading-[1.05] tracking-[-0.005em] text-[var(--ui-ink)]">
              <Link
                href={`/trainers/${trainer.slug}`}
                className={`transition-colors hover:${accentColorClass}`}
              >
                {trainer.name}
              </Link>
            </h3>
          </div>

          {sportTagLabel ? (
            <span className="inline-flex flex-shrink-0 items-center rounded-lg border border-[var(--ui-line)] bg-card/60 px-2.5 py-[5px] font-body text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ui-ink)]">
              {sportTagLabel}
            </span>
          ) : null}
        </div>
      </div>

      {/* body-meta: orange/lime price-pill + distance */}
      <div className="flex flex-wrap items-center gap-3.5 px-[22px] pt-5 sm:px-4">
        <span
          className={`inline-flex items-center gap-1 rounded-[10px] px-3 py-[7px] font-display text-[13px] tabular-nums tracking-[0.02em] text-[var(--ui-bg)] ${accentBgClass}`}
        >
          <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] opacity-[0.78]">
            от
          </span>
          {formatPrice(trainer.priceFrom)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-body text-xs font-medium text-[var(--ui-muted)] before:h-1 before:w-1 before:rounded-full before:bg-[var(--ui-muted)]">
          {distanceLabel}
        </span>
      </div>

      {/* exp-row: experience tag + опц. group-chip */}
      <div className="flex flex-wrap items-center gap-2.5 px-[22px] pt-3.5 sm:px-4">
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-[var(--ui-line)] bg-transparent px-3 py-[7px] font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-ink)]">
          {trainer.experienceYears} лет опыта
        </span>
        {isGroup ? (
          <span
            className={`inline-flex items-center whitespace-nowrap rounded-full px-3 py-[7px] font-body text-[10px] font-bold uppercase tracking-[0.18em] ${groupChipClass}`}
          >
            Группа
          </span>
        ) : null}
      </div>

      {/* trainer-headline: 48px фикс., clamp 2 lines */}
      <p className="line-clamp-2 px-[22px] pt-4 font-body text-[14px] font-semibold leading-[1.45] text-[var(--ui-ink)] sm:px-4">
        {headline}
      </p>

      {/* body-rating: звёзды + num + reviews + опц. «Новый» */}
      <div className="flex flex-wrap items-center gap-3.5 px-[22px] pt-4 sm:px-4">
        <Stars rating={trainer.rating} />
        <span className="font-display text-[13px] tabular-nums leading-none text-[var(--ui-ink)]">
          {trainer.rating.toFixed(1)}
        </span>
        <span className="font-body text-xs font-medium text-[var(--ui-muted)]">
          {trainer.reviewCount} отзывов
        </span>
        {isNew ? (
          <span
            data-testid="trainer-card-new-badge"
            className="inline-flex items-center rounded-full border border-[var(--ui-line)] bg-[var(--ui-card-2)] px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-ink)]"
          >
            Новый
          </span>
        ) : null}
      </div>

      {/* ReliabilityBadge — отдельной строкой ниже rating-row (Phase 28).
          Только для warning/danger (при isNewUser скрыт чтобы не дублировать
          rating-row «Новый»). */}
      {reliability && !reliability.isNewUser && reliability.badge !== null ? (
        <div className="px-[22px] pt-3 sm:px-4">
          <ReliabilityBadge reliability={reliability} compact />
        </div>
      ) : (
        <span aria-hidden="true" />
      )}

      {/* meta-box: 2 cols «Площадка / Ближайшее окно», на 480 — 1 col */}
      <div className="mx-[22px] mt-[18px] grid grid-cols-[1fr_auto] gap-x-7 gap-y-3.5 rounded-[14px] border border-[var(--ui-line)] bg-[var(--ui-card-2)] px-[18px] py-4 sm:mx-4 sm:grid-cols-1 sm:gap-y-3">
        <div>
          <p className="mb-1.5 font-body text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--ui-muted)]">
            Площадка
          </p>
          <p className="line-clamp-1 font-body text-[13px] font-semibold leading-[1.3] text-[var(--ui-ink)]">
            {trainer.venueLabel || 'Без привязки'}
          </p>
          {trainer.venueName && trainer.venueAddress ? (
            <p className="mt-0.5 line-clamp-1 font-body text-[11px] font-normal leading-tight text-[var(--ui-muted)]">
              {trainer.venueAddress}
            </p>
          ) : null}
        </div>
        <div className="text-right sm:text-left">
          <p className="mb-1.5 font-body text-[9px] font-bold uppercase tracking-[0.22em] text-[var(--ui-muted)]">
            Ближайшее окно
          </p>
          <p className="font-display text-[14px] leading-[1.3] tracking-[0.01em] text-[var(--ui-ink)]">
            {slotLabel}
          </p>
        </div>
      </div>

      {/* Tags ChipMarquee — solid (orange/lime по tone) */}
      <ChipMarquee items={tagItems} variant="solid" accent={tone === 'lime' ? 'lime' : 'orange'} />

      {/* quote-row: top-border + quote + CTA «К записи» (Link) */}
      <div className="mx-[22px] mt-5 grid grid-cols-[1fr_auto] items-center gap-5 border-t border-[var(--ui-line)] pb-[22px] pt-[18px] sm:mx-4 sm:grid-cols-1 sm:gap-3">
        {quote ? (
          <p className="line-clamp-2 font-body text-[12px] leading-[1.5] text-[var(--ui-muted)]">
            {quote}
          </p>
        ) : (
          <span aria-hidden="true" />
        )}
        <Link
          href={ctaHref}
          className={`inline-flex flex-shrink-0 items-center gap-1.5 font-body text-[12px] font-bold uppercase tracking-[0.06em] no-underline transition-colors ${ctaHoverClass}`}
        >
          К записи
          <span aria-hidden="true" className="text-[14px]">
            →
          </span>
        </Link>
      </div>
    </article>
  );
}

/**
 * Русское склонение слова «окно» по числу: 1 окно, 2-4 окна, иначе окон.
 * Используется в distance-fallback когда у тренера нет distanceKm.
 */
function pluralizeOkno(n: number): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'окно';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return 'окна';
  return 'окон';
}

/**
 * Mini-помощник: ряд из 5 SVG-звёзд (в синхрон с ClubCard.Stars).
 * Заполненные — золотые (`text-gold`), пустые — цвета бордера.
 */
function Stars({ rating }: { rating: number }) {
  const filled = Math.round(rating);
  return (
    <span
      role="img"
      aria-label={`Рейтинг: ${rating.toFixed(1)} из 5`}
      className="inline-flex gap-[3px]"
    >
      {Array.from({ length: 5 }).map((_, i) => (
        <svg
          key={i}
          viewBox="0 0 24 24"
          width="14"
          height="14"
          fill="currentColor"
          aria-hidden="true"
          className={i < filled ? 'text-gold' : 'text-[var(--ui-line)]'}
        >
          <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01z" />
        </svg>
      ))}
    </span>
  );
}
