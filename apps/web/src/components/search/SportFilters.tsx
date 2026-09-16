/**
 * Чипы видов спорта (шаг 38.77) — фильтр каталога, карты и «популярного» по виду.
 * «Все» первым, дальше виды из базы с их же значком (реестр № 64–65: у эталона
 * шесть захардкоженных категорий с иконками `lucide`, у нас — справочник и значок
 * из него). Выбор пишется в `useFilterStore.setSport`; отбор по нему делают
 * потребители стора. Ряд переносится, как в эталоне (`HomePage.tsx:360`), а не
 * прокручивается вбок.
 */
'use client';

import type { Sport } from '@sporthub/types';

import { Chip } from '@/components/ui';
import { useFilterStore } from '@/stores/useFilterStore';

type SportFilterItem = Pick<Sport, 'id' | 'name' | 'icon'>;

type SportFiltersProps = {
  sports: SportFilterItem[];
};

/** Значок чипа «Все» — тренд вверх, как у чипа `all` эталона (`App.tsx:187`). */
function AllSportsIcon() {
  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="size-3 shrink-0">
      <path
        d="M1.5 11.5l4.5-4.5 3 3 5.5-5.5M10 4.5h4.5V9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

export function SportFilters({ sports }: SportFiltersProps) {
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setSport = useFilterStore((state) => state.setSport);

  return (
    <div role="group" aria-label="Виды спорта" className="flex flex-wrap gap-1.5">
      <Chip
        active={selectedSportId === null}
        onClick={() => {
          setSport(null);
        }}
      >
        <AllSportsIcon />
        <span>Все</span>
      </Chip>

      {sports.map((sport) => (
        <Chip
          key={sport.id}
          active={selectedSportId === sport.id}
          onClick={() => {
            setSport(sport.id);
          }}
        >
          <span className="text-[12px] leading-none" aria-hidden="true">
            {sport.icon}
          </span>
          <span>{sport.name}</span>
        </Chip>
      ))}
    </div>
  );
}
