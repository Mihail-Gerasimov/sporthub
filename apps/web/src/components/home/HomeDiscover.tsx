'use client';

// Секция «Поиск и фильтры» главной (38.66; живой счёт выдачи — 38.82).
//
// Клиентская: бейдж «N клубов в выдаче» считается по ТЕМ ЖЕ фильтрам и тому же
// стору, что у выдачи, карты и подборки (`filterClubs` / `filterTrainers`). Прежде
// секция была серверной и передавала длину всего каталога — при пустой выдаче
// бейдж говорил «3 клуба в выдаче» (ревью 38.66, чек-лист step-16). Отбор в памяти —
// действующее ограничение до страницы каталога (долг Д-15).

import { filterClubs } from '@/components/clubs/filterClubs';
import { HomeContainer } from '@/components/home/HomeContainer';
import { SearchControlsPreview } from '@/components/search';
import { filterTrainers } from '@/components/trainers/filterTrainers';
import { useFilterStore } from '@/stores/useFilterStore';

import type { HomeSectionProps } from '@/components/home/home-data';

export function HomeDiscover({ data }: HomeSectionProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const selectedCity = useFilterStore((state) => state.selectedCity);
  const filters = { searchQuery, selectedCity, selectedSportId };

  return (
    <HomeContainer>
      <SearchControlsPreview
        clubCount={
          filterClubs({ clubs: data.clubs, sports: data.sports, tags: data.tags, ...filters })
            .length
        }
        sports={data.sports}
        trainerCount={filterTrainers({ trainers: data.trainerDirectory, ...filters }).length}
      />
    </HomeContainer>
  );
}
