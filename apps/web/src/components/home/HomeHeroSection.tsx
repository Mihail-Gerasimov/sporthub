// Секция героя из словаря главной (шаг 38.66): собирает `HomeHero` по данным дня.
//
// Герой (38.65) принимает слоты и данные правой колонки; здесь они складываются
// из `HomeData`: правая колонка — занятия дня и дата словами; в слоте поиска —
// виджет `HeroSearch` (38.67; лента видов спорта под ним снята на 38.107 — в макете
// её нет, категории живут в выпадашке); в слоте счётчиков — `HomeCounters` (38.69)
// с числами из `/stats/overview`.

import { HeroSearch } from '@/components/home/HeroSearch';
import { HomeCounters } from '@/components/home/HomeCounters';
import { HomeHero } from '@/components/home/HomeHero';

import type { HomeSectionProps } from '@/components/home/home-data';

export function HomeHeroSection({ data }: HomeSectionProps) {
  return (
    <HomeHero
      search={<HeroSearch sports={data.sports} />}
      counters={<HomeCounters overview={data.overview} />}
      focus={{
        club: data.heroClub,
        sessions: data.heroSessions,
        dateLabel: data.upcomingSessionsLabel,
      }}
    />
  );
}
