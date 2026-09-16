'use client';

/*
 * ClubList — выдача клубов под фильтр на главной странице.
 * Step 28.10: оборачиваем карточки в <CardSlider> (Phase 28.6) — на главной
 * вместо grid-сетки появляется реальный слайдер со стрелками prev/next и dots.
 * Шаг 38.85: видимых в ряд 1→2→3 по точкам `md`/`xl` (`visibleByBp`) — как сетка
 * клубов эталона (`hp-clubs-grid`: 3 → 2 → 1), слайдер сохранён (реестр № 78).
 *
 * Передаём index={i} в каждую карточку — это даёт watermark номера ранга
 * («01», «02», ...) и tone-ротацию (lime/orange/blank) в hero ClubCard.
 *
 * embedded prop удалён — нигде не использовался.
 */
import type { Club, EntityId, Tag } from '@sporthub/types';

import { CardSlider } from '@/components/ui';
import { ClubCard } from '@/components/clubs/ClubCard';
import { filterClubs, type ClubListSport } from '@/components/clubs/filterClubs';
import { useFilterStore } from '@/stores/useFilterStore';

type ClubListProps = {
  clubs: Club[];
  sports: ClubListSport[];
  /** Справочник тегов для резолвинга tagIds → имена в карточках */
  tags?: Tag[];
  selectedClubId?: EntityId | null;
};

export function ClubList({ clubs, selectedClubId = null, sports, tags = [] }: ClubListProps) {
  const searchQuery = useFilterStore((state) => state.searchQuery);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const selectedCity = useFilterStore((state) => state.selectedCity);

  const filteredClubs = filterClubs({
    clubs,
    searchQuery,
    selectedCity,
    selectedSportId,
    sports,
    tags,
  });

  return (
    <CardSlider
      eyebrow="Club list"
      title="Клубы под текущие фильтры"
      accent="lime"
      sliderId="club-list"
      visibleByBp={{ sm: 1, md: 2, xl: 3 }}
      total={filteredClubs.length}
      emptyMessage="По текущему запросу клубов не найдено. Попробуй очистить поиск или выбрать другой вид спорта."
    >
      {filteredClubs.map((club) => (
        <ClubCard
          key={club.id}
          club={club}
          highlighted={selectedClubId === club.id}
          sports={sports}
          tags={tags}
        />
      ))}
    </CardSlider>
  );
}
