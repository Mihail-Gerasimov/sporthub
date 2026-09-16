// Лидеры каталога — лучший клуб и лучший тренер (шаг 38.66; запросом — 38.31).
//
// Секция вынесена из `app/page.tsx`, где две карточки лидеров были выписаны дважды
// почти одинаковой разметкой; здесь одна карточка `LeaderCard` с тоном — зелёным
// у клуба, оранжевым у тренера. Лидеров считает база (`sort=rating&limit=1`),
// секция только показывает. Ссылками карточки станут на шаге 38.92.

import { HomeContainer } from '@/components/home/HomeContainer';
import { cn, formatPrice } from '@/lib/utils';

import type { HomeSectionProps } from '@/components/home/home-data';
import { HOME_SECTIONS } from '@/lib/home-sections';

type LeaderTone = 'lime' | 'orange';

/** Классы тона: рамка при наведении, подпись, аватар-буква и плашка цены. */
const TONES: Record<
  LeaderTone,
  { hover: string; kicker: string; avatar: string; price: string; numeral: string }
> = {
  lime: {
    hover: 'hover:border-[var(--ui-lime)]',
    kicker: 'text-lime-hov',
    avatar: 'border-lime/30 bg-lime-soft text-[var(--ui-lime-hov)]',
    price: 'bg-lime',
    numeral: '01',
  },
  orange: {
    hover: 'hover:border-[var(--ui-orange)]',
    kicker: 'text-[var(--ui-orange)]',
    avatar: 'border-orange/30 bg-orange-soft text-[var(--ui-orange)]',
    price: 'bg-orange',
    numeral: '02',
  },
};

type LeaderCardProps = {
  tone: LeaderTone;
  /** Подпись над карточкой: «Клуб» / «Тренер». */
  kind: string;
  /** Лидер — или пусто, тогда карточка говорит, что каталог ждёт публикаций. */
  leader?: {
    name: string;
    description: string;
    rating: number;
    reviewCount: number;
    priceFrom: number;
  };
  emptyText: string;
};

function LeaderCard({ tone, kind, leader, emptyText }: LeaderCardProps) {
  const t = TONES[tone];

  return (
    <article
      className={cn(
        'group relative overflow-hidden rounded-[22px] border border-[var(--ui-line)] bg-[var(--ui-card-2)] p-5 transition-all hover:-translate-y-0.5',
        t.hover,
      )}
    >
      <span
        aria-hidden="true"
        className="pointer-events-none absolute right-5 top-5 select-none font-display text-[56px] leading-[0.85] tracking-[-0.02em] text-ink/[0.04]"
      >
        {t.numeral}
      </span>
      <div className="relative z-10">
        <div
          className={cn(
            'flex items-center gap-2 font-body text-[10px] font-bold uppercase tracking-[0.18em]',
            t.kicker,
          )}
        >
          <span className="h-px w-6 bg-current opacity-50" />
          {kind}
        </div>
        {leader ? (
          <>
            <div className="mt-3.5 flex items-start gap-3.5">
              <span
                className={cn(
                  'flex size-14 shrink-0 items-center justify-center rounded-[16px] border font-display text-[22px] uppercase',
                  t.avatar,
                )}
              >
                {leader.name.trim().charAt(0)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="m-0 font-body text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ui-muted)]">
                  Топ рейтинга
                </p>
                <h3 className="m-0 mt-1 font-display text-[19px] uppercase leading-[1.05] text-[var(--ui-ink)]">
                  {leader.name}
                </h3>
              </div>
            </div>
            <p className="relative z-10 m-0 mt-3 font-body text-[13px] leading-[1.5] text-[var(--ui-muted)]">
              {leader.description}
            </p>
            <div className="mt-4 flex flex-wrap items-center gap-2">
              <Stat label="Рейтинг" value={leader.rating.toFixed(1)} />
              <Stat label="Отзывы" value={String(leader.reviewCount)} />
              <span
                className={cn(
                  'ml-auto inline-flex items-center gap-1 whitespace-nowrap rounded-[14px] px-4 py-3 font-display text-[16px] tabular-nums tracking-[0.02em] text-ink',
                  t.price,
                )}
              >
                <span className="mr-1 font-body text-[9px] font-bold uppercase tracking-[0.18em]">
                  от
                </span>
                {formatPrice(leader.priceFrom)}
              </span>
            </div>
          </>
        ) : (
          <p className="relative z-10 m-0 mt-4 font-body text-[13px] leading-[1.5] text-[var(--ui-muted)]">
            {emptyText}
          </p>
        )}
      </div>
    </article>
  );
}

/** Плитка «подпись — число» внутри карточки лидера. */
function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex min-w-[78px] flex-col gap-0.5 rounded-[12px] border border-[var(--ui-line)] bg-[var(--ui-bg)] px-3 py-2">
      <span className="font-body text-[9px] font-bold uppercase tracking-[0.18em] text-[var(--ui-muted)]">
        {label}
      </span>
      <span className="font-display text-[16px] tabular-nums leading-none text-[var(--ui-ink)]">
        {value}
      </span>
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
            tone="lime"
            kind="Клуб"
            leader={
              featuredClub
                ? { ...featuredClub, description: featuredClub.shortDescription }
                : undefined
            }
            emptyText="Клубы появятся после первой публикации из кабинета провайдера."
          />
          <LeaderCard
            tone="orange"
            kind="Тренер"
            leader={
              featuredTrainer
                ? { ...featuredTrainer, description: featuredTrainerTitle ?? '' }
                : undefined
            }
            emptyText="Тренеры появятся после первой публикации и первых доступных услуг."
          />
        </div>

        {isCatalogEmpty ? (
          <p className="m-0 rounded-[18px] border border-dashed border-[var(--ui-line)] bg-[var(--ui-card)]/60 px-5 py-4 font-body text-[14px] leading-relaxed text-[var(--ui-muted)]">
            Каталог пока пуст. Витрина начнёт заполняться новыми публикациями из кабинета
            провайдера.
          </p>
        ) : null}
      </HomeContainer>
    </section>
  );
}
