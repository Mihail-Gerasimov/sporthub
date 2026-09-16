'use client';

// Подборка «лучшие по рейтингу» на главной (фаза 38, шаг 38.79) — клубы или тренеры
// по режиму поиска, в общем `CardSlider`.
//
// ⚠️ Две правды закрыты этим шагом. Первая: блок брал ПОЛНЫЙ список и не смотрел
// на фильтры — после чипа «Йога» в «популярном» оставались все клубы, тогда как выдача
// фильтр применяла (найдено прогоном 38.5, step-13). Теперь отбор — теми же функциями
// и тем же стором, что у выдачи (`filterClubs` / `filterTrainers`), поверх него —
// порядок по рейтингу, отзывам и расстоянию и срез в шесть карточек. Вторая: у блока
// была своя карусель (`scrollBy`, две копии — клубы и тренеры), третья на площадке
// рядом с `CardSlider` и `ChipMarquee`; сведена в `CardSlider` — стрелки, точки, drag
// и пустое состояние оттуда (сторож `carousel-single`).
//
// Блок назван тем, что показывает: геолокации у площадки нет, «рядом» обещать нечего.
// Отбор в памяти — действующее ограничение до страницы каталога (долг Д-15).

import { ClubCard } from '@/components/clubs/ClubCard';
import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { filterTrainers } from '@/components/trainers/filterTrainers';
import { TrainerCard } from '@/components/trainers/TrainerCard';
import { CardSlider } from '@/components/ui';
import { POPULAR } from '@/lib/home-copy';
import { useFilterStore } from '@/stores/useFilterStore';
import type { Club, Tag } from '@sporthub/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type PopularNearbyProps = {
  clubs: Club[];
  sports: ClubListSport[];
  /** Справочник тегов для резолвинга tagIds → имена в карточках */
  tags?: Tag[];
  trainers: TrainerDirectoryItem[];
};

/** Сколько карточек в подборке. */
const POPULAR_LIMIT = 6;

/** То, по чему сравниваются и клубы, и тренеры: рейтинг, отзывы, расстояние. */
type Ranked = { rating: number; reviewCount: number; distanceKm: number | null };

/** Порядок подборки: рейтинг, при равенстве — отзывы, затем ближе — выше. */
function byPopularity(left: Ranked, right: Ranked): number {
  if (right.rating !== left.rating) return right.rating - left.rating;
  if (right.reviewCount !== left.reviewCount) return right.reviewCount - left.reviewCount;

  return (
    (left.distanceKm ?? Number.POSITIVE_INFINITY) - (right.distanceKm ?? Number.POSITIVE_INFINITY)
  );
}

export function PopularNearby({ clubs, sports, tags = [], trainers }: PopularNearbyProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const selectedCity = useFilterStore((state) => state.selectedCity);

  // Тот же отбор, что у выдачи, — и только потом порядок и срез.
  const filters = { searchQuery, selectedCity, selectedSportId };
  const items =
    discoveryMode === 'clubs'
      ? [...filterClubs({ clubs, sports, tags, ...filters })]
          .sort(byPopularity)
          .slice(0, POPULAR_LIMIT)
      : [...filterTrainers({ trainers, ...filters })].sort(byPopularity).slice(0, POPULAR_LIMIT);

  return (
    <CardSlider
      eyebrow={POPULAR.eyebrow[discoveryMode]}
      title={POPULAR.title[discoveryMode]}
      accent={discoveryMode === 'clubs' ? 'lime' : 'orange'}
      sliderId={`popular-${discoveryMode}`}
      total={items.length}
      countLabel={POPULAR.countLabel}
      emptyMessage={POPULAR.empty[discoveryMode]}
    >
      {discoveryMode === 'clubs'
        ? (items as Club[]).map((club) => (
            <ClubCard key={club.id} club={club} sports={sports} tags={tags} />
          ))
        : (items as TrainerDirectoryItem[]).map((trainer) => (
            <TrainerCard key={trainer.id} trainer={trainer} />
          ))}
    </CardSlider>
  );
}
