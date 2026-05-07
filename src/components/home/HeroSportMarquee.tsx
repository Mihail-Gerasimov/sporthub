/**
 * Phase 30.10: декоративная бегущая лента видов спорта в hero-секции главной.
 *
 * Реализована через CSS-keyframes без rAF/IntersectionObserver — лента просто
 * непрерывно прокручивается (40s/cycle) и не имеет pause-on-hover. Контент
 * дублируется два раза подряд, второй блок помечен `aria-hidden="true"` для
 * скринридеров — это чисто визуальная подложка.
 *
 * НЕ использует общий `ChipMarquee`: тот рассчитан на интерактивные карточки
 * клубов/тренеров (drag, pause, IO), здесь же простая декорация без управления.
 *
 * Чипы НЕ интерактивны — настоящий sport-фильтр живёт ниже в `SportFilters`
 * (через `useFilterStore.selectedSportId`). Поэтому `cursor: default` и
 * никаких hover-эффектов.
 */
'use client';

import type { Sport } from '@/types';

type HeroSportMarqueeProps = {
  sports: Pick<Sport, 'id' | 'name'>[];
};

function SportChip({ sport, ariaHidden }: { sport: Pick<Sport, 'id' | 'name'>; ariaHidden?: boolean }) {
  return (
    <span
      aria-hidden={ariaHidden ? 'true' : undefined}
      style={{ cursor: 'default' }}
      className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[var(--ui-line)] bg-white/[0.03] px-3.5 py-[9px] font-body text-[12px] font-semibold uppercase tracking-[0.06em] text-[var(--ui-ink)]"
    >
      <span className="inline-flex size-[22px] shrink-0 items-center justify-center rounded-md bg-[var(--ui-lime-soft)] font-body text-[11px] font-bold text-[var(--ui-lime)]">
        {sport.name.trim().charAt(0).toUpperCase()}
      </span>
      {sport.name}
    </span>
  );
}

export function HeroSportMarquee({ sports }: HeroSportMarqueeProps) {
  if (sports.length === 0) return null;

  return (
    <div
      className="hero-sport-marquee-viewport relative w-full overflow-hidden"
      data-testid="hero-sport-marquee"
    >
      <div className="hero-sport-marquee">
        {/* Первый блок — реальный контент для скринридеров */}
        {sports.map((sport) => (
          <SportChip key={`a-${sport.id}`} sport={sport} />
        ))}
        {/* Второй блок — дубликат для бесшовной CSS-анимации */}
        {sports.map((sport) => (
          <SportChip key={`b-${sport.id}`} sport={sport} ariaHidden />
        ))}
      </div>
    </div>
  );
}
