// Рабочая часть главной из словаря секций (шаг 38.66): поиск, карта, карточки, популярное.
// Слоты — в своём файле `HomeAvailability` (38.81): у них клиентский отбор по стору.
//
// Каждая секция — тонкая обёртка над прежними блоками: они получают данные дня
// из `HomeData`, а не из разметки страницы. Отбор здесь по-прежнему в памяти —
// действующее ограничение до страницы каталога (долг Д-15). Секции «поиск» и «карта»
// несут id в собственных корнях (`SearchControlsPreview`, `MapSection`); популярное
// и слоты получают корень здесь — их прежние блоки корня с id не имели, и якорь
// `#availability` три ссылки вели в пустоту (тупик разведки, № 39).

import { PopularNearby } from '@/components/clubs';
import { HomeContainer } from '@/components/home/HomeContainer';
import { MapSection } from '@/components/map';
import { CatalogResultsSection, SearchControlsPreview } from '@/components/search';

import type { HomeSectionProps } from '@/components/home/home-data';
import { HOME_SECTIONS } from '@/lib/home-sections';

export function HomeDiscover({ data }: HomeSectionProps) {
  return (
    <HomeContainer>
      <SearchControlsPreview
        clubCount={data.clubs.length}
        sports={data.sports}
        trainerCount={data.trainerDirectory.length}
      />
    </HomeContainer>
  );
}

export function HomeResults({ data }: HomeSectionProps) {
  return (
    <HomeContainer>
      <MapSection clubs={data.clubs} sports={data.sports} trainers={data.trainerDirectory} />
    </HomeContainer>
  );
}

export function HomeCatalog({ data }: HomeSectionProps) {
  return (
    <section id={HOME_SECTIONS.catalog.id} aria-label={HOME_SECTIONS.catalog.label}>
      <HomeContainer>
        <CatalogResultsSection
          clubs={data.clubs}
          sports={data.sports}
          tags={data.tags}
          trainers={data.trainerDirectory}
        />
      </HomeContainer>
    </section>
  );
}

export function HomePopular({ data }: HomeSectionProps) {
  return (
    <section id={HOME_SECTIONS.popular.id} aria-label={HOME_SECTIONS.popular.label}>
      <HomeContainer>
        <PopularNearby
          clubs={data.clubs}
          sports={data.sports}
          tags={data.tags}
          trainers={data.trainerDirectory}
        />
      </HomeContainer>
    </section>
  );
}
