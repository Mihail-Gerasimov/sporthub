/**
 * Живая Яндекс Карта на главной странице.
 * Инициализируется с центром на выбранный город, зумом из DEFAULT_MAP_ZOOM.
 * При смене города — перецентрируется на координаты из GET /api/cities.
 * Маркеры формируются хуком useMapMarkers и добавляются как YMapMarker.
 * ymaps3.ready обязателен для JS API 3.0 — конструкторы доступны только после его resolve.
 */
'use client';

import { useEffect, useRef, useState } from 'react';

import type { City, Club, EntityId } from '@/types';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@/lib/constants';
import { useYandexMap } from '@/components/map/YandexMapProvider';
import { useMapMarkers, type MapMarkerData } from '@/components/map/useMapMarkers';
import { MapThemeToggle } from '@/components/map/MapThemeToggle';
import { useFilterStore } from '@/stores/useFilterStore';
import { useMapThemeStore } from '@/stores/useMapThemeStore';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type MainMapProps = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: Array<{ id: EntityId; name: string }>;
};

/** Тип глобального объекта ymaps3 после await ready */
type Ymaps3Api = {
  ready: Promise<void>;
  YMap: new (
    container: HTMLElement,
    options: { location: { center: [number, number]; zoom: number } },
  ) => {
    addChild: (child: unknown) => unknown;
    removeChild: (child: unknown) => void;
    setLocation: (loc: unknown) => void;
    destroy: () => void;
  };
  YMapDefaultSchemeLayer: new () => unknown;
  YMapDefaultFeaturesLayer: new () => unknown;
  YMapMarker: new (
    options: { coordinates: [number, number]; onClick?: () => void },
    element: HTMLElement,
  ) => unknown;
};

/** Получить координаты города из загруженного списка или fallback на DEFAULT_MAP_CENTER */
function getCityCenter(cityName: string, cities: City[]): [number, number] {
  const city = cities.find((c) => c.name.toLowerCase() === cityName.toLowerCase());
  const coords = city?.coordinates ?? DEFAULT_MAP_CENTER;
  // Яндекс Maps API принимает [lng, lat]
  return [coords.lng, coords.lat];
}

/** Получить ymaps3 из globalThis */
function getYmaps3(): Ymaps3Api | null {
  return ((globalThis as Record<string, unknown>).ymaps3 as Ymaps3Api) ?? null;
}

/** HTML-контент маркера для YMapMarker */
function createMarkerElement(marker: MapMarkerData): HTMLElement {
  const el = document.createElement('div');
  el.className = 'map-marker-pin';
  el.style.cssText =
    'width:14px;height:14px;border-radius:50%;background:#50BC93;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.3);cursor:pointer;transition:transform .15s';
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
    'background:#fff;border-radius:12px;padding:10px 14px;box-shadow:0 4px 16px rgba(0,0,0,.15);min-width:160px;max-width:240px;font-size:13px;line-height:1.4;pointer-events:auto;cursor:pointer';
  el.innerHTML = `
    <div style="font-weight:600;color:#07124F;margin-bottom:4px">${marker.name}</div>
    ${marker.sportName ? `<div style="color:#BCBCBC;font-size:12px">${marker.sportName}</div>` : ''}
    <div style="color:#BCBCBC;font-size:12px;margin-top:2px">${marker.address}</div>
    ${marker.rating > 0 ? `<div style="color:#f5c518;font-size:12px;margin-top:4px;font-weight:600">${marker.rating.toFixed(1)} ★</div>` : ''}
    <div style="color:#50BC93;font-size:11px;margin-top:6px;text-align:right">Подробнее →</div>
  `;

  // Клик по popup → переход на деталку
  const path = marker.type === 'club' ? `/clubs/${marker.slug}` : `/trainers/${marker.slug}`;
  el.addEventListener('click', () => {
    window.location.href = path;
  });

  return el;
}

export function MainMap({ clubs, trainers, sports }: MainMapProps) {
  const { isLoaded, error } = useYandexMap();
  const selectedCity = useFilterStore((state) => state.selectedCity);
  // Phase 29 Step 29.1: тема карты для CSS-фильтра. SSR-safe — initial 'light',
  // после mount Zustand persist-middleware подставит сохранённое значение.
  const mapTheme = useMapThemeStore((state) => state.theme);
  const markers = useMapMarkers({ clubs, trainers, sports });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<unknown>(null);
  // Флаг: карта инициализирована (после ymaps3.ready + создание карты)
  const [isMapReady, setIsMapReady] = useState(false);
  // Храним ссылки на текущие маркеры для очистки
  const markerObjectsRef = useRef<unknown[]>([]);
  // Храним текущий popup для закрытия
  const activePopupRef = useRef<unknown>(null);
  // Динамический список городов для определения центра
  const [cities, setCities] = useState<City[]>([]);

  // Загрузка списка городов
  useEffect(() => {
    fetch('/api/cities')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) setCities(json.data);
      })
      .catch(() => {});
  }, []);

  // Инициализация карты: скрипт загружен → await ymaps3.ready → создать карту
  useEffect(() => {
    if (!isLoaded || !containerRef.current || mapInstanceRef.current) return;

    const ymaps3 = getYmaps3();
    if (!ymaps3) return;

    let cancelled = false;

    ymaps3.ready.then(() => {
      if (cancelled || !containerRef.current || mapInstanceRef.current) return;

      const map = new ymaps3.YMap(containerRef.current, {
        location: {
          center: getCityCenter(selectedCity, cities),
          zoom: DEFAULT_MAP_ZOOM,
        },
      });

      map.addChild(new ymaps3.YMapDefaultSchemeLayer());
      map.addChild(new ymaps3.YMapDefaultFeaturesLayer());

      mapInstanceRef.current = map;
      setIsMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [isLoaded, selectedCity, cities]);

  // Перецентрирование при смене города
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;

    const map = mapInstanceRef.current as {
      setLocation: (loc: { center: [number, number]; zoom: number; duration?: number }) => void;
    };

    map.setLocation({
      center: getCityCenter(selectedCity, cities),
      zoom: DEFAULT_MAP_ZOOM,
      duration: 400,
    });
  }, [selectedCity, isMapReady, cities]);

  // Обновление маркеров при изменении фильтров
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;

    const ymaps3 = getYmaps3();
    if (!ymaps3?.YMapMarker) return;

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

      // Клик по маркеру — показать popup (клик по popup → навигация на деталку)
      const handleClick = () => {
        // Если popup уже открыт — закрываем
        if (activePopupRef.current) {
          try {
            map.removeChild(activePopupRef.current);
          } catch {
            // Уже удалён
          }
          activePopupRef.current = null;
          return;
        }

        // Показать popup
        const popupEl = createPopupElement(marker);
        const popup = new ymaps3.YMapMarker(
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

      const yMapMarker = new ymaps3.YMapMarker(
        {
          coordinates: [marker.coordinates.lng, marker.coordinates.lat],
          onClick: handleClick,
        },
        pinEl,
      );
      map.addChild(yMapMarker);
      markerObjectsRef.current.push(yMapMarker);
    }
  }, [markers, isMapReady]);

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
      {/*
        Phase 29 Step 29.1: data-map-theme на контейнере карты управляет
        CSS-фильтром (см. globals.css). Toggle и empty-state — absolute siblings
        ВНЕ этого контейнера, чтобы фильтр их не инвертировал.
      */}
      <div
        ref={containerRef}
        data-testid="yandex-map-container"
        data-map-theme={mapTheme}
        className="h-[20rem] overflow-hidden rounded-card border border-line sm:h-[24rem] lg:h-[28rem]"
      />
      {/* Toggle темы карты — поверх карты, в правом верхнем углу */}
      <MapThemeToggle className="absolute right-2 top-2 z-10 md:right-3 md:top-3" />
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
