// Лидеры каталога — лучший клуб и лучший тренер (шаг 38.66; ссылки и тексты — 38.92).
//
// Секция вынесена из `app/page.tsx`, где две карточки лидеров были выписаны дважды
// почти одинаковой разметкой; здесь одна карточка `LeaderCard` с тоном — зелёным
// у клуба, оранжевым у тренера. Лидеров считает база (`sort=rating&limit=1`),
// секция только показывает и ведёт: имя — ссылка в свой клуб / своего тренера,
// растянутая на карточку псевдоэлементом, как у карточек выдачи (тупик разведки:
// лучший клуб показывался, а открыть его с главной было нельзя).
//
// Почему не `ui/Card`: та — однотонный `div` с зелёным наведением; у лидера тон
// следует виду (клуб / тренер) и тег `article` под растянутую ссылку. Тон и тег
// в `ui/Card` ради одного потребителя — слой ради слоя.
//
// Тексты — из `LEADERS` в `home-copy`; цвета — токен-классами, без `[var(--ui-…)]`.

import Link from 'next/link';

import { HomeContainer } from '@/components/home/HomeContainer';
import { LEADERS } from '@/lib/home-copy';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { cn, formatPrice } from '@/lib/utils';

import type { HomeSectionProps } from '@/components/home/home-data';

type LeaderKind = keyof typeof LEADERS.kind;

/** Тон по виду лидера: рамка при наведении, подпись, аватар-буква, плашка цены, номер. */
const TONES: Record<
  LeaderKind,
  { hover: string; kicker: string; avatar: string; price: string; numeral: string }
> = {
  club: {
    hover: 'hover:border-lime',
    kicker: 'text-lime-hov',
    avatar: 'border-lime/30 bg-lime-soft text-lime-hov',
    price: 'bg-lime',
    numeral: '01',
  },
  trainer: {
    hover: 'hover:border-orange',
    kicker: 'text-orange',
    avatar: 'border-orange/30 bg-orange-soft text-orange',
    price: 'bg-orange',
    numeral: '02',
  },
};

type LeaderCardProps = {
  kind: LeaderKind;
  /** Лидер — или пусто, тогда карточка говорит, что каталог ждёт публикаций. */
  leader?: {
    name: string;
    href: string;
    description: string;
    rating: number;
    reviewCount: number;
    priceFrom: number;
  };
};

function LeaderCard({ kind, leader }: LeaderCardProps) {
  const t = TONES[kind];

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[22px] border border-line bg-card-2 p-5 transition-all hover:-translate-y-0.5',
        t.hover,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-5 select-none font-display text-[56px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]"
      >
        {t.numeral}
      </span>
      <div
        className={cn(
          'flex items-center gap-2 font-body text-[10px] font-bold uppercase tracking-[0.18em]',
          t.kicker,
        )}
      >
        <span className="h-px w-6 bg-current opacity-50" />
        {LEADERS.kind[kind]}
      </div>
      {leader ? (
        <>
          <div className="mt-3.5 flex items-start gap-3.5">
            <span
              aria-hidden="true"
              className={cn(
                'flex size-14 shrink-0 items-center justify-center rounded-[16px] border font-display text-[22px] uppercase',
                t.avatar,
              )}
            >
              {leader.name.trim().charAt(0)}
            </span>
            <div className="min-w-0 flex-1">
              <p className="m-0 font-body text-[11px] font-medium uppercase tracking-[0.14em] text-muted">
                {LEADERS.top}
              </p>
              <h3 className="m-0 mt-1 font-display text-[19px] uppercase leading-[1.05] text-ink">
                {/* Ссылка растянута на карточку: `article` — `relative`, других ссылок в ней нет. */}
                <Link
                  href={leader.href}
                  className="no-underline after:absolute after:inset-0 after:z-[1] after:content-['']"
                >
                  {leader.name}
                </Link>
              </h3>
            </div>
          </div>
          <p className="m-0 mt-3 font-body text-[13px] leading-[1.5] text-muted">
            {leader.description}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-2">
            <Stat label={LEADERS.stats.rating} value={leader.rating.toFixed(1)} />
            <Stat label={LEADERS.stats.reviews} value={String(leader.reviewCount)} />
            <span
              className={cn(
                'ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-[14px] px-4 py-3 font-display text-[16px] tabular-nums tracking-[0.02em] text-ink',
                t.price,
              )}
            >
              <span className="mr-1 font-body text-[9px] font-bold uppercase tracking-[0.18em]">
                {LEADERS.from}
              </span>
              {formatPrice(leader.priceFrom)}
            </span>
          </div>
        </>
      ) : (
        <p className="m-0 mt-4 font-body text-[13px] leading-[1.5] text-muted">
          {LEADERS.empty[kind]}
        </p>
      )}
    </article>
  );
}

/** Плитка «подпись — число» внутри карточки лидера. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[78px] flex-col gap-0.5 rounded-[12px] border border-line bg-bg px-3 py-2">
      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-muted">
        {label}
      </span>
      <span className="font-display text-[16px] tabular-nums leading-none text-ink">{value}</span>
    </div>
  );
}

export function HomeLeaders({ data }: HomeSectionProps) {
  const { featuredClub, featuredTrainer, featuredTrainerTitle } = data;
  // Пустой каталог: обоих лидеров нет — общий баннер под полосой.
  const isCatalogEmpty = featuredClub === undefined && featuredTrainer === undefined;

  return (
    <section id={HOME_SECTIONS.leaders.id} aria-label={HOME_SECTIONS.leaders.label}>
      <HomeContainer className="flex flex-col gap-6">
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 md:gap-5">
          <LeaderCard
            kind="club"
            leader={
              featuredClub
                ? {
                    ...featuredClub,
                    href: `/clubs/${featuredClub.slug}`,
                    description: featuredClub.shortDescription,
                  }
                : undefined
            }
          />
          <LeaderCard
            kind="trainer"
            leader={
              featuredTrainer
                ? {
                    ...featuredTrainer,
                    href: `/trainers/${featuredTrainer.slug}`,
                    description: featuredTrainerTitle ?? '',
                  }
                : undefined
            }
          />
        </div>

        {isCatalogEmpty ? (
          <p className="m-0 rounded-[18px] border border-dashed border-line bg-card/60 px-5 py-4 font-body text-[14px] leading-relaxed text-muted">
            {LEADERS.empty.catalog}
          </p>
        ) : null}
      </HomeContainer>
    </section>
  );
}
