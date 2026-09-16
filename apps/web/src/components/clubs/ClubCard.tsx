'use client';

/*
 * ClubCard — карточка клуба под новый дизайн Phase 28.8.
 * Структура 1-в-1 с claude-design/cards-trainers/sporthub/project/
 * SportHub Cards - Clubs.html (.club-card + child grid):
 *   - Hero (min-h 176/164/152 на 1024+/768/480) с диагональным
 *     lime/orange/blank-лучом (классы .hero-bg-{tone} из globals.css),
 *     watermark номера ранга, city-pill, preview-pill, address (accent eyebrow)
 *     и display-именем (Link на /clubs/{slug}).
 *   - Body-grid с фикс. высотой row для desc (72px / 84px на 480) — карточки
 *     в одном слайдере выровнены по высоте независимо от длины контента.
 *   - body-meta: lime price-pill + distance.
 *   - body-rating: SVG-звёзды + display num + N отзывов + опц. бейдж «Новый».
 *   - Tags ChipMarquee — solid lime-soft, последний, isLast=true.
 *
 * Важно: вокруг <article> НЕТ обёртки <Link> — в нашем стеке это даёт
 * nested <a> при наличии inner CTA (TrainerCard). Поэтому Link только
 * на name (display-заголовок). Hover-эффект бордера — на самой <article>
 * через :hover в Tailwind.
 *
 * isFeatured удалён в Step 28.7 — поле больше не существует.
 */
import Link from 'next/link';

import { ChipMarquee } from '@/components/ui';
import { buildDictMap, formatCityDisplay, formatPrice } from '@/lib/utils';
import type { Club, Sport, Tag } from '@sporthub/types';

type ClubCardSport = Pick<Sport, 'id' | 'name' | 'icon'>;

type ClubTone = 'lime' | 'orange' | 'blank';
const TONE_CYCLE: ClubTone[] = ['lime', 'orange', 'blank'];

type ClubCardProps = {
  club: Club;
  sports: ClubCardSport[];
  /** Справочник тегов для резолвинга tagIds → имена в marquee */
  tags?: Tag[];
  /** Индекс карточки в слайдере (0-based) — для watermark и tone-ротации. */
  index?: number;
  /** Подсветка карточки при выборе на карте — accent-бордер вместо line. */
  highlighted?: boolean;
};

export function ClubCard({
  club,
  sports: _sports,
  tags = [],
  index,
  highlighted = false,
}: ClubCardProps) {
  // wm — двузначный номер ранга («01», «02», …) для watermark hero. Если
  // index не передан (карточка вне слайдера) — watermark не показываем.
  const wm = index !== undefined ? String(index + 1).padStart(2, '0') : '';
  const tone: ClubTone = TONE_CYCLE[(index ?? 0) % 3]!;

  // «Новый» — клуб ещё не оценивали (нет ни рейтинга, ни отзывов).
  const isNew = club.reviewCount === 0 && club.rating === 0;

  // Резолвинг tagIds → имена через справочник; неизвестные id отбрасываются.
  const tagMap = buildDictMap(tags);
  const tagItems = club.tagIds
    .map((id) => tagMap.get(id)?.name)
    .filter((label): label is string => Boolean(label))
    .map((label) => ({ label }));

  // Hover-цвет бордера зависит от tone (lime/orange) — для blank остаётся lime.
  const hoverBorderClass =
    tone === 'orange' ? 'hover:border-[var(--ui-orange)]' : 'hover:border-[var(--ui-lime)]';

  // Цвет address-eyebrow — accent по tone. На mist hero (Step 31.10) светлый mint
  // теряется, поэтому для lime/blank используем graphite muted (Step 31.12).
  const addressColorClass =
    tone === 'orange' ? 'text-[var(--ui-orange)]' : 'text-[var(--ui-muted)]';

  // Цвет hover на имени-Link
  const nameHoverClass =
    tone === 'orange' ? 'hover:text-[var(--ui-orange)]' : 'hover:text-lime-hov';

  return (
    <article
      data-testid="club-card"
      data-tone={tone}
      data-highlighted={highlighted ? 'true' : 'false'}
      className={`relative grid h-full grid-rows-[auto_auto_72px_auto_auto] overflow-hidden rounded-[18px] border bg-[var(--ui-card)] transition-colors sm:grid-rows-[auto_auto_84px_auto_auto] md:grid-rows-[auto_auto_72px_auto_auto] ${
        highlighted ? 'border-[var(--ui-lime)]' : 'border-[var(--ui-line)]'
      } ${hoverBorderClass}`}
    >
      {/* Hero — диагональный луч + watermark + city-pill + name */}
      <div className="relative flex min-h-[176px] flex-col justify-between overflow-hidden border-b border-[var(--ui-line-2)] bg-[var(--ui-card-2)] p-5">
        {/* Двухслойный фон через готовый класс из globals.css (Step 28.6) */}
        <span aria-hidden="true" className={`absolute inset-0 hero-bg-${tone}`} />

        {/* Watermark номера ранга */}
        {wm ? (
          <span
            aria-hidden="true"
            className="pointer-events-none absolute right-[14px] bottom-[6px] select-none font-display text-[92px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]"
          >
            {wm}
          </span>
        ) : null}

        {/* Top row: city-pill + preview-pill */}
        <div className="relative z-[1] flex items-start justify-between gap-3">
          <span className="inline-flex items-center rounded-full border border-[var(--ui-line)] bg-card/60 px-3 py-1.5 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-ink)]">
            {formatCityDisplay(club.city)}
          </span>
          <span className="inline-flex items-center rounded-full border border-[var(--ui-line)] bg-transparent px-2.5 py-[5px] font-body text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-muted)]">
            Фото preview
          </span>
        </div>

        {/* Bottom: address (accent eyebrow) + name (Link, display clamp 2) */}
        <div className="relative z-[1] flex items-end justify-between gap-5">
          <div className="min-w-0 flex-1">
            <p
              className={`mb-2.5 font-body text-[11px] font-bold uppercase leading-tight tracking-[0.18em] ${addressColorClass}`}
            >
              {club.address}
            </p>
            <h3 className="line-clamp-2 font-display text-[22px] uppercase leading-[1.05] tracking-[-0.005em] text-[var(--ui-ink)]">
              <Link href={`/clubs/${club.slug}`} className={`transition-colors ${nameHoverClass}`}>
                {club.name}
              </Link>
            </h3>
          </div>
        </div>
      </div>

      {/* body-meta: lime price-pill + distance */}
      <div className="flex flex-wrap items-center gap-3.5 px-[22px] pt-5 sm:px-4">
        <span className="inline-flex items-center gap-1 rounded-[10px] bg-lime px-3 py-[7px] font-display text-[13px] tabular-nums tracking-[0.02em] text-ink">
          <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em]">от</span>
          {formatPrice(club.priceFrom)}
        </span>
        <span className="inline-flex items-center gap-1.5 font-body text-xs font-medium text-[var(--ui-muted)] before:h-1 before:w-1 before:rounded-full before:bg-[var(--ui-muted)]">
          {club.distanceKm.toFixed(1)} км
        </span>
      </div>

      {/* body-desc — clamp 3 lines (4 на 480), фикс. высота row */}
      <p className="line-clamp-3 px-[22px] pt-3.5 font-body text-[13px] leading-[1.6] text-[var(--ui-muted)] sm:line-clamp-4 sm:px-4">
        {club.shortDescription}
      </p>

      {/* body-rating: звёзды + num + reviews + опц. «Новый» */}
      <div className="flex flex-wrap items-center gap-3.5 px-[22px] pt-4 sm:px-4">
        <Stars rating={club.rating} />
        <span className="font-display text-[13px] tabular-nums leading-none text-[var(--ui-ink)]">
          {club.rating.toFixed(1)}
        </span>
        <span className="font-body text-xs font-medium text-[var(--ui-muted)]">
          {club.reviewCount} отзывов
        </span>
        {isNew ? (
          <span
            data-testid="club-card-new-badge"
            className="inline-flex items-center rounded-full border border-[var(--ui-line)] bg-[var(--ui-card-2)] px-2.5 py-1 font-body text-[10px] font-bold uppercase tracking-[0.18em] text-[var(--ui-ink)]"
          >
            Новый
          </span>
        ) : null}
      </div>

      {/* Tags ChipMarquee — solid lime-soft, последний (margin-bottom учтён) */}
      <ChipMarquee items={tagItems} variant="solid" accent="lime" isLast />
    </article>
  );
}

/**
 * Mini-помощник: ряд из 5 SVG-звёзд. Заполненные — золотые (`text-gold`),
 * пустые — цвета бордера. 1-в-1 с дизайном из SportHub Cards - Clubs.html.
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
