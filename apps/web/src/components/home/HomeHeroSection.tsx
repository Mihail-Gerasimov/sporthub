// Секция героя из словаря главной (шаг 38.66): собирает `HomeHero` по данным дня.
//
// Герой (38.65) принимает слоты и данные правой колонки; здесь они складываются
// из `HomeData`: правая колонка — занятия дня и дата словами, в слоте поиска — лента
// видов спорта (реестр № 37: «сохранить; в дизайне это место занимает поисковый
// виджет» — виджет 38.67 встанет рядом), счётчики — 38.69.

import { HeroSportMarquee } from '@/components/home/HeroSportMarquee';
import { HomeHero } from '@/components/home/HomeHero';

import type { HomeSectionProps } from '@/components/home/home-data';

/** Сколько видов спорта показывает лента героя. */
const MARQUEE_SPORTS = 16;

export function HomeHeroSection({ data }: HomeSectionProps) {
  return (
    <HomeHero
      search={
        data.sports.length > 0 ? (
          <HeroSportMarquee sports={data.sports.slice(0, MARQUEE_SPORTS)} />
        ) : undefined
      }
      focus={{ sessions: data.upcomingSessions, dateLabel: data.upcomingSessionsLabel }}
    />
  );
}
