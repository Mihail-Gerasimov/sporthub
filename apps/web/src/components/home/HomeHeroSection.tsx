// Секция героя из словаря главной (шаг 38.66): собирает `HomeHero` по данным дня.
//
// Герой (38.65) принимает слоты и данные правой колонки; здесь они складываются
// из `HomeData`: правая колонка — занятия дня и дата словами; в слоте поиска —
// виджет `HeroSearch` (38.67) и под ним лента видов спорта (реестр № 37: «сохранить;
// в дизайне это место занимает поисковый виджет» — стоят вместе); в слоте счётчиков —
// `HomeCounters` (38.69) с числами из `/stats/overview`.

import { HeroSearch } from '@/components/home/HeroSearch';
import { HeroSportMarquee } from '@/components/home/HeroSportMarquee';
import { HomeCounters } from '@/components/home/HomeCounters';
import { HomeHero } from '@/components/home/HomeHero';

import type { HomeSectionProps } from '@/components/home/home-data';

/** Сколько видов спорта показывает лента героя. */
const MARQUEE_SPORTS = 16;

export function HomeHeroSection({ data }: HomeSectionProps) {
  return (
    <HomeHero
      search={
        <div className="flex flex-col gap-5">
          <HeroSearch sports={data.sports} />
          {data.sports.length > 0 ? (
            <HeroSportMarquee sports={data.sports.slice(0, MARQUEE_SPORTS)} />
          ) : null}
        </div>
      }
      counters={<HomeCounters overview={data.overview} />}
      focus={{ sessions: data.upcomingSessions, dateLabel: data.upcomingSessionsLabel }}
    />
  );
}
