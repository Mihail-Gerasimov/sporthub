/**
 * Живая Яндекс Карта на главной странице.
 * Инициализируется с центром на выбранный город, зумом из DEFAULT_MAP_ZOOM.
 * При смене города — перецентрируется на координаты из AVAILABLE_CITIES.
 * Использует useYandexMap() для проверки готовности API.
 */
'use client';

import { useEffect, useRef } from 'react';

import { AVAILABLE_CITIES, DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/constants';
import { useYandexMap } from '@/components/map/YandexMapProvider';
import { useFilterStore } from '@/stores/useFilterStore';

/** Получить координаты города из AVAILABLE_CITIES или fallback на DEFAULT_MAP_CENTER */
function getCityCenter(cityName: string): [number, number] {
  const city = AVAILABLE_CITIES.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  const coords = city?.coordinates ?? DEFAULT_MAP_CENTER;
  // Яндекс Maps API принимает [lng, lat]
  return [coords.lng, coords.lat];
}

export function MainMap() {
  const { isLoaded, error } = useYandexMap();
  const selectedCity = useFilterStore((state) => state.selectedCity);
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);

  // Инициализация карты после загрузки API
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapInstanceRef.current) return;

    const ymaps = (globalThis as Record<string, unknown>).ymaps3 as {
      YMap: new (
        container: HTMLElement,
        options: { location: { center: [number, number]; zoom: number } },
      ) => { addChild: (child: unknown) => void; setLocation: (loc: unknown) => void };
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
    <div
      ref={containerRef}
      data-testid="yandex-map-container"
      className="min-h-[20rem] overflow-hidden rounded-card border border-line sm:min-h-[24rem] lg:min-h-[28rem]"
    />
  );
}
