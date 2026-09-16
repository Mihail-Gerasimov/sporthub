/**
 * Блок «Поиск и фильтры» главной (шаг 38.77) — секция `#discover` из словаря секций.
 * Белая карточка по эталону (`HomePage.tsx:311-352`): переключатель «Клубы / Тренеры»
 * сегментом на подложке холста с зелёным активным, селектор города, поле поиска,
 * чипы видов спорта. Всё пишет в `useFilterStore`; отбор по нему делают выдача,
 * карта и «популярное».
 *
 * Своё, чего в эталоне нет (реестр № 54–56, 66–67, «наше сильнее»): бейджи города,
 * числа направлений и живого счёта выдачи; эхо «Запрос / Фокус» свёрнуто в чипы-
 * сбросы — каждый снимает ровно свой фильтр, как «Сбросить поиск» эталона
 * (`App.tsx:1785`).
 */
'use client';

import type { Sport } from '@sporthub/types';

import { Badge, Card } from '@/components/ui';
import { CitySelector } from '@/components/search/CitySelector';
import { SearchBar } from '@/components/search/SearchBar';
import { SportFilters } from '@/components/search/SportFilters';
import { cn } from '@/lib/utils';
import { HOME_SECTIONS } from '@/lib/home-sections';
import { countRu, PLURAL } from '@/lib/plural';
import { useFilterStore, type DiscoveryMode } from '@/stores/useFilterStore';

type SportFilterItem = Pick<Sport, 'id' | 'name' | 'icon'>;

type SearchControlsPreviewProps = {
  clubCount: number;
  sports: SportFilterItem[];
  trainerCount: number;
};

/** Тексты режима: подпись сегмента, заголовок и описание блока, счёт выдачи. */
const DISCOVERY_MODE_COPY: Record<
  DiscoveryMode,
  { description: string; heading: string; modeLabel: string; count: (n: number) => string }
> = {
  clubs: {
    description:
      'Выбери направление, уточни запрос и сразу смотри, как меняется карта и клубная выдача без перезагрузки страницы.',
    heading: 'Поиск по клубам и направлениям',
    modeLabel: 'Клубы',
    count: (n) => `${countRu(n, PLURAL.clubs)} в выдаче`,
  },
  trainers: {
    description:
      'Переключись на каталог тренеров, чтобы искать персональные услуги, направления и доступные окна без ухода с главной.',
    heading: 'Поиск по тренерам и направлениям',
    modeLabel: 'Тренеры',
    count: (n) => `${countRu(n, PLURAL.trainers)} в выдаче`,
  },
};

const MODES: DiscoveryMode[] = ['clubs', 'trainers'];

/** Крестик чипа-сброса. */
function CrossIcon() {
  return (
    <svg viewBox="0 0 12 12" aria-hidden="true" className="size-[11px] shrink-0">
      <path
        d="M2.5 2.5l7 7m0-7l-7 7"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="1.6"
      />
    </svg>
  );
}

/** Чип-сброс одного фильтра: мягкая зелёная подложка, как «Сбросить поиск» эталона. */
function ResetChip({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="inline-flex items-center gap-[5px] rounded-[9px] border border-lime/30 bg-lime-soft px-3 py-1.5 text-[12px] font-semibold text-lime-hov transition-colors hover:border-lime/60 hover:text-ink"
    >
      <CrossIcon />
      {label}
    </button>
  );
}

export function SearchControlsPreview({
  clubCount,
  sports,
  trainerCount,
}: SearchControlsPreviewProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedCity = useFilterStore((state) => state.selectedCity);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const setDiscoveryMode = useFilterStore((state) => state.setDiscoveryMode);
  const setSearch = useFilterStore((state) => state.setSearch);
  const setSport = useFilterStore((state) => state.setSport);

  const selectedSport = sports.find((sport) => sport.id === selectedSportId);
  const modeCopy = DISCOVERY_MODE_COPY[discoveryMode];
  const query = searchQuery.trim();

  return (
    <section id={HOME_SECTIONS.discover.id} aria-label={HOME_SECTIONS.discover.label}>
      <Card className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="t-eyebrow text-lime-hov">Поиск и фильтры</p>
            <h2 className="t-h2 mt-2 text-ink">{modeCopy.heading}</h2>
            <p className="mt-3 max-w-2xl font-body text-sm leading-relaxed text-muted">
              {modeCopy.description}
            </p>
          </div>
          <ul aria-label="Сводка поиска" className="flex flex-wrap gap-2">
            <li>
              <Badge tone="accent">{selectedCity}</Badge>
            </li>
            <li>
              <Badge tone="outline">{countRu(sports.length, PLURAL.directions)}</Badge>
            </li>
            <li>
              <Badge tone="neutral">
                {modeCopy.count(discoveryMode === 'clubs' ? clubCount : trainerCount)}
              </Badge>
            </li>
          </ul>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          {/* Сегмент-переключатель эталона: подложка холста, активный — зелёный со свечением */}
          <div
            role="group"
            aria-label="Что искать"
            className="flex w-full gap-[3px] rounded-[12px] bg-bg p-1 sm:w-auto sm:min-w-[240px]"
          >
            {MODES.map((mode) => {
              const active = discoveryMode === mode;
              return (
                <button
                  key={mode}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    setDiscoveryMode(mode);
                  }}
                  className={cn(
                    'flex-1 rounded-[9px] px-4 py-[9px] text-[13px] font-bold transition-[background-color,color,box-shadow] outline-none focus-visible:ring-4 focus-visible:ring-lime/30',
                    active ? 'bg-lime text-ink shadow-glow' : 'text-muted hover:text-ink',
                  )}
                >
                  {DISCOVERY_MODE_COPY[mode].modeLabel}
                </button>
              );
            })}
          </div>

          {/* Селектор города — фильтрует каталог и карту */}
          <CitySelector />
        </div>

        <SearchBar />
        <SportFilters sports={sports} />

        {query || selectedSport ? (
          <div className="flex flex-wrap gap-2">
            {query ? (
              <ResetChip
                label={`Сбросить запрос: ${query}`}
                onClick={() => {
                  setSearch('');
                }}
              />
            ) : null}
            {selectedSport ? (
              <ResetChip
                label={`Сбросить вид: ${selectedSport.name}`}
                onClick={() => {
                  setSport(null);
                }}
              />
            ) : null}
          </div>
        ) : null}
      </Card>
    </section>
  );
}
