// Секции каталога `/catalog` из словаря `lib/catalog-sections.ts` (шаг 38.79a):
// карта, выдача, слоты. Поиск — в `CatalogDiscover`: у него клиентский отбор по стору.
//
// Рабочая часть переехала с главной как есть (решение заказчика 16.09, п. 16):
// каждая секция — тонкая обёртка над прежними блоками, они получают данные дня из
// `CatalogData`, а не из разметки страницы. Отбор по-прежнему в памяти — действующее
// ограничение до каталога в запросе (долг Д-15). Секция «карта» несёт id в собственном
// корне (`MapSection`); выдача и слоты получают корень здесь.
//
// Почему не компоненты `ui`: своей разметки у секций нет — `section` с якорем словаря и
// `HomeContainer`; карусели и карточки внутри — уже `ui/CardSlider`, `ui/SlotCard`.

import { HomeContainer } from '@/components/home/HomeContainer';
import { MapSection } from '@/components/map';
import { UpcomingSessions } from '@/components/schedule';
import { CatalogResultsSection } from '@/components/search';
import { CATALOG_SECTIONS } from '@/lib/catalog-sections';

import type { CatalogSectionProps } from '@/components/catalog/catalog-data';

export function CatalogMap({ data }: CatalogSectionProps) {
  return (
    <HomeContainer>
      <MapSection clubs={data.clubs} sports={data.sports} trainers={data.trainerDirectory} />
    </HomeContainer>
  );
}

export function CatalogResults({ data }: CatalogSectionProps) {
  return (
    <section id={CATALOG_SECTIONS.results.id} aria-label={CATALOG_SECTIONS.results.label}>
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

/** Занятия дня и окна тренеров под фильтрами выдачи (38.81): первые N — по стору. */
export function CatalogAvailability({ data }: CatalogSectionProps) {
  return (
    <section id={CATALOG_SECTIONS.availability.id} aria-label={CATALOG_SECTIONS.availability.label}>
      <HomeContainer>
        <UpcomingSessions
          clubs={data.clubs}
          sports={data.sports}
          tags={data.tags}
          dateLabel={data.upcomingSessionsLabel}
          sessions={data.upcomingSessions}
          trainerDateLabel={data.trainerAvailabilityLabel}
          trainerSlots={data.trainerAvailability}
        />
      </HomeContainer>
    </section>
  );
}
