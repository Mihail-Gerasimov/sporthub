/**
 * Хук для формирования маркеров карты из данных клубов и тренеров.
 * Фильтрует по discoveryMode, sportId, city из useFilterStore.
 * Исключает сущности без валидных координат (lat=0, lng=0).
 * Получает данные через props, НЕ делает API-вызовов.
 *
 * Шаг 38.80: маркер несёт цвет вида спорта — из справочника видов (поле `color`),
 * а не из словаря в коде; пока у вида цвета нет — маркер без цвета, капля берёт
 * токен по умолчанию. Плюс данные карточки снизу: картинка, цена, знак проверки.
 */
import { useMemo } from 'react';

import type { Club, Coordinates, EntityId, ISODateTimeString } from '@sporthub/types';
import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';
import { isValidCoordinates } from '@/lib/utils';
import { useFilterStore } from '@/stores/useFilterStore';

/** Вид спорта, каким его читает карта: имя для подписи, цвет — если справочник его несёт. */
export type MapSport = { id: EntityId; name: string; color?: string };

export type MapMarkerData = {
  id: EntityId;
  slug: string;
  name: string;
  /** Первый вид сущности; `null` — вид не найден в справочнике. */
  sportId: EntityId | null;
  sportName: string;
  /** Цвет вида из справочника; пусто — у вида цвета ещё нет. */
  sportColor?: string;
  address: string;
  rating: number;
  priceFrom: number;
  /** Картинка карточки снизу: первое фото клуба или аватар тренера; пусто — заглушка. */
  imageUrl: string;
  verifiedAt?: ISODateTimeString;
  coordinates: Coordinates;
  type: 'club' | 'trainer';
};

type UseMapMarkersOptions = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: MapSport[];
};

/** Первый вид спорта сущности из справочника — подпись и цвет маркера. */
function getSport(sportIds: EntityId[], sports: MapSport[]): MapSport | undefined {
  return sports.find((s) => sportIds.includes(s.id));
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
        .map((club) => {
          const sport = getSport(club.sportIds, sports);
          return {
            id: club.id,
            slug: club.slug,
            name: club.name,
            sportId: sport?.id ?? null,
            sportName: sport?.name ?? '',
            sportColor: sport?.color,
            address: club.address,
            rating: club.rating,
            priceFrom: club.priceFrom,
            imageUrl: club.imageUrls[0] ?? '',
            verifiedAt: club.verifiedAt,
            coordinates: club.coordinates,
            type: 'club' as const,
          };
        });
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
      .map((trainer) => {
        const sport = getSport(trainer.sportIds, sports);
        return {
          id: trainer.id,
          slug: trainer.slug,
          name: trainer.name,
          sportId: sport?.id ?? null,
          sportName: sport?.name ?? '',
          sportColor: sport?.color,
          address: trainer.address,
          rating: trainer.rating,
          priceFrom: trainer.priceFrom,
          imageUrl: trainer.avatarUrl,
          verifiedAt: trainer.verifiedAt,
          coordinates: trainer.coordinates,
          type: 'trainer' as const,
        };
      });
  }, [clubs, trainers, sports, discoveryMode, selectedSportId, selectedCity]);
}
