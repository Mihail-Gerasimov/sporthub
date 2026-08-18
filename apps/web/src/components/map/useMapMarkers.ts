/**
 * Хук для формирования маркеров карты из данных клубов и тренеров.
 * Фильтрует по discoveryMode, sportId, city из useFilterStore.
 * Исключает сущности без валидных координат (lat=0, lng=0).
 * Получает данные через props, НЕ делает API-вызовов.
 */
import { useMemo } from 'react';

import type { Club, Coordinates, EntityId } from '@sporthub/types';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';
import { isValidCoordinates } from '@/lib/utils';
import { useFilterStore } from '@/stores/useFilterStore';

export type MapMarkerData = {
  id: EntityId;
  slug: string;
  name: string;
  sportName: string;
  address: string;
  rating: number;
  coordinates: Coordinates;
  type: 'club' | 'trainer';
};

type UseMapMarkersOptions = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: Array<{ id: EntityId; name: string }>;
};

/** Получить название первого вида спорта сущности */
function getSportName(sportIds: EntityId[], sports: Array<{ id: EntityId; name: string }>): string {
  const sport = sports.find((s) => sportIds.includes(s.id));
  return sport?.name ?? '';
}

export function useMapMarkers({ clubs, trainers, sports }: UseMapMarkersOptions): MapMarkerData[] {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);
  const selectedSportId = useFilterStore((state) => state.selectedSportId);
  const selectedCity = useFilterStore((state) => state.selectedCity);

  return useMemo(() => {
    const normalizedCity = selectedCity.trim().toLowerCase();

    if (discoveryMode === 'clubs') {
      return clubs
        .filter((club) => {
          // Defense-in-depth: скрытые публикации не должны попасть через API,
          // но дополнительно фильтруем на клиенте
          if (club.status === 'hidden') return false;
          if (!isValidCoordinates(club.coordinates)) return false;
          if (selectedSportId !== null && !club.sportIds.includes(selectedSportId)) return false;
          if (normalizedCity && club.city.trim().toLowerCase() !== normalizedCity) return false;
          return true;
        })
        .map((club) => ({
          id: club.id,
          slug: club.slug,
          name: club.name,
          sportName: getSportName(club.sportIds, sports),
          address: club.address,
          rating: club.rating,
          coordinates: club.coordinates,
          type: 'club' as const,
        }));
    }

    return trainers
      .filter((trainer) => {
        // Defense-in-depth: скрытые не должны отображаться на карте
        if ((trainer as { status?: string }).status === 'hidden') return false;
        if (!isValidCoordinates(trainer.coordinates)) return false;
        if (selectedSportId !== null && !trainer.sportIds.includes(selectedSportId)) return false;
        if (normalizedCity && trainer.city.trim().toLowerCase() !== normalizedCity) return false;
        return true;
      })
      .map((trainer) => ({
        id: trainer.id,
        slug: trainer.slug,
        name: trainer.name,
        sportName: getSportName(trainer.sportIds, sports),
        address: trainer.address,
        rating: trainer.rating,
        coordinates: trainer.coordinates,
        type: 'trainer' as const,
      }));
  }, [clubs, trainers, sports, discoveryMode, selectedSportId, selectedCity]);
}
