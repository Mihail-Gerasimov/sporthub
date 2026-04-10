/**
 * Живая Яндекс Карта на главной странице.
 * Инициализируется с центром на выбранный город, зумом из DEFAULT_MAP_ZOOM.
 * При смене города — перецентрируется на координаты из AVAILABLE_CITIES.
 * Маркеры формируются хуком useMapMarkers и добавляются как YMapMarker.
 */
'use client';

import { useEffect, useRef } from 'react';

import type { Club, EntityId } from '@/types';
import { AVAILABLE_CITIES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/constants';
import { useYandexMap } from '@/components/map/YandexMapProvider';
import { useMapMarkers, type MapMarkerData } from '@/components/map/useMapMarkers';
import { useFilterStore } from '@/stores/useFilterStore';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type MainMapProps = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: Array<{ id: EntityId; name: string }>;
};

/** Получить координаты города из AVAILABLE_CITIES или fallback на DEFAULT_MAP_CENTER */
function getCityCenter(cityName: string): [number, number] {
  const city = AVAILABLE_CITIES.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  const coords = city?.coordinates ?? DEFAULT_MAP_CENTER;
  // Яндекс Maps API принимает [lng, lat]
  return [coords.lng, coords.lat];
}

/** HTML-контент маркера для YMapMarker */
function createMarkerElement(marker: MapMarkerData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'map-marker-pin';
  el.style.cssText =
    'width:14px;height:14px;border-radius:50%;background:#d85a32;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;transition:transform .15s';
  el.title = marker.name;

  // Ховер-эффект
  el.addEventListener('mouseenter', () => {
    el.style.transform = 'scale(1.4)';
  });
  el.addEventListener('mouseleave', () => {
    el.style.transform = 'scale(1)';
  });

  return el;
}

/** HTML-контент popup/balloon маркера */
function createPopupElement(marker: MapMarkerData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'map-marker-popup';
  el.style.cssText =
    'background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:160px;max-width:240px;font-size:13px;line-height:1.4;pointer-events:auto';
  el.innerHTML = `
    <div style="font-weight:600;color:#1a1a1a;margin-bottom:4px">${marker.name}</div>
    ${marker.sportName ? `<div style="color:#666;font-size:12px">${marker.sportName}</div>` : ''}
    <div style="color:#888;font-size:12px;margin-top:2px">${marker.address}</div>
    ${marker.rating > 0 ? `<div style="color:#d85a32;font-size:12px;margin-top:4px;font-weight:600">${marker.rating.toFixed(1)} ★</div>` : ''}
  `;
  return el;
}

export function MainMap({ clubs, trainers, sports }: MainMapProps) {
  const { isLoaded, error } = useYandexMap();
  const selectedCity = useFilterStore((state) => state.selectedCity);
  const markers = useMapMarkers({ clubs, trainers, sports });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  // Храним ссылки на текущие маркеры для очистки
  const markerObjectsRef = useRef<unknown[]>([]);
  // Храним текущий popup для закрытия
  const activePopupRef = useRef<unknown>(null);

  // Инициализация карты после загрузки API
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapInstanceRef.current) return;

    const ymaps = (globalThis as Record<string, unknown>).ymaps3 as {
      YMap: new (
        container: HTMLElement,
        options: { location: { center: [number, number]; zoom: number } },
      ) => {
        addChild: (child: unknown) => unknown;
        removeChild: (child: unknown) => void;
        setLocation: (loc: unknown) => void;
      };
      YMapDefaultSchemeLayer: new () => unknown;
      YMapDefaultFeaturesLayer: new () => unknown;
    };

    if (!ymaps) return;

    const map = new ymaps.YMap(containerRef.current, {
      location: {
        center: getCityCenter(selectedCity),
        zoom: DEFAULT_MAP_ZOOM,
      },
    });

    map.addChild(new ymaps.YMapDefaultSchemeLayer());
    map.addChild(new ymaps.YMapDefaultFeaturesLayer());

    mapInstanceRef.current = map;
  }, [isLoaded, selectedCity]);

  // Перецентрирование при смене города
  useEffect(() => {
    if (!mapInstanceRef.current) return;

    const map = mapInstanceRef.current as {
      setLocation: (loc: { center: [number, number]; zoom: number; duration?: number }) => void;
    };

    map.setLocation({
      center: getCityCenter(selectedCity),
      zoom: DEFAULT_MAP_ZOOM,
      duration: 400,
    });
  }, [selectedCity]);

  // Обновление маркеров при изменении фильтров
  useEffect(() => {
    if (!mapInstanceRef.current || !isLoaded) return;

    const ymaps = (globalThis as Record<string, unknown>).ymaps3 as {
      YMapMarker: new (
        options: {
          coordinates: [number, number];
          onClick?: () => void;
        },
        element: HTMLElement,
      ) => unknown;
    };

    if (!ymaps?.YMapMarker) return;

    const map = mapInstanceRef.current as {
      addChild: (child: unknown) => unknown;
      removeChild: (child: unknown) => void;
    };

    // Удаляем старые маркеры
    for (const obj of markerObjectsRef.current) {
      try {
        map.removeChild(obj);
      } catch {
        // Маркер мог быть уже удалён
      }
    }
    markerObjectsRef.current = [];

    // Удаляем popup если есть
    if (activePopupRef.current) {
      try {
        map.removeChild(activePopupRef.current);
      } catch {
        // Уже удалён
      }
      activePopupRef.current = null;
    }

    // Добавляем новые маркеры
    for (const marker of markers) {
      const pinEl = createMarkerElement(marker);

      // Клик — показать popup или перейти на деталку
      const handleClick = () => {
        // Если popup уже открыт — навигация
        if (activePopupRef.current) {
          try {
            map.removeChild(activePopupRef.current);
          } catch {
            // Уже удалён
          }
          activePopupRef.current = null;

          const path =
            marker.type === 'club' ? `/clubs/${marker.slug}` : `/trainers/${marker.slug}`;
          window.location.href = path;
          return;
        }

        // Первый клик — показать popup
        const popupEl = createPopupElement(marker);
        const popup = new ymaps.YMapMarker(
          { coordinates: [marker.coordinates.lng, marker.coordinates.lat] },
          popupEl,
        );
        map.addChild(popup);
        activePopupRef.current = popup;

        // Закрытие popup при клике вне
        const closePopup = (e: MouseEvent) => {
          if (!popupEl.contains(e.target as Node) && !pinEl.contains(e.target as Node)) {
            try {
              map.removeChild(popup);
            } catch {
              // Уже удалён
            }
            activePopupRef.current = null;
            document.removeEventListener('click', closePopup);
          }
        };
        setTimeout(() => document.addEventListener('click', closePopup), 0);
      };

      const yMapMarker = new ymaps.YMapMarker(
        {
          coordinates: [marker.coordinates.lng, marker.coordinates.lat],
          onClick: handleClick,
        },
        pinEl,
      );
      map.addChild(yMapMarker);
      markerObjectsRef.current.push(yMapMarker);
    }
  }, [markers, isLoaded]);

  // Ошибка загрузки
  if (error) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center rounded-card border border-dashed border-line bg-canvas p-6">
        <p className="text-sm text-muted">Ошибка загрузки карты: {error}</p>
      </div>
    );
  }

  // Skeleton до загрузки API
  if (!isLoaded) {
    return (
      <div
        data-testid="map-skeleton"
        className="flex min-h-[20rem] animate-pulse items-center justify-center rounded-card border border-line bg-canvas sm:min-h-[24rem] lg:min-h-[28rem]"
      >
        <p className="text-sm text-muted">Загрузка карты…</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <div
        ref={containerRef}
        data-testid="yandex-map-container"
        className="min-h-[20rem] overflow-hidden rounded-card border border-line sm:min-h-[24rem] lg:min-h-[28rem]"
      />
      {/* Empty state — нет маркеров для текущих фильтров */}
      {markers.length === 0 && (
        <div
          data-testid="map-empty-state"
          className="absolute inset-x-0 bottom-4 mx-auto max-w-md rounded-card border border-line bg-panel/95 px-5 py-3 text-center text-sm text-muted shadow-card backdrop-blur-sm"
        >
          В городе {selectedCity} пока нет доступных услуг по выбранным фильтрам. Попробуйте
          изменить фильтры или выбрать другой город.
        </div>
      )}
    </div>
  );
}
