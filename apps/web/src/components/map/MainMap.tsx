/**
 * Живая Яндекс Карта на главной странице.
 * Инициализируется с центром на выбранный город, зумом из DEFAULT_MAP_ZOOM.
 * При смене города — перецентрируется на координаты из GET /api/cities.
 * Маркеры формируются хуком useMapMarkers и добавляются как YMapMarker.
 * ymaps3.ready обязателен для JS API 3.0 — конструкторы доступны только после его resolve.
 *
 * Шаг 38.80 — вид эталона: маркеры-капли DOM-узлами (`map-marker-element.ts`) с цветом
 * вида из данных; клик по капле — активное состояние и карточка снизу (`MapActiveCard`)
 * вместо попапа строкой HTML; легенда по видам на карте (`MapLegend`). Выбор живёт
 * здесь: капли получают класс, карточка и легенда — данные; повторный клик, «Закрыть»
 * и Escape снимают выбор.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';

import type { City, Club, EntityId } from '@sporthub/types';
import { DEFAULT_MAP_CENTER, DEFAULT_MAP_ZOOM } from '@sporthub/types';
import { useYandexMap } from '@/components/map/YandexMapProvider';
import { useMapMarkers, type MapMarkerData, type MapSport } from '@/components/map/useMapMarkers';
import { createMarkerElement, setMarkerActive } from '@/components/map/map-marker-element';
import { MapActiveCard } from '@/components/map/MapActiveCard';
import { MapLegend } from '@/components/map/MapLegend';
import { MapThemeToggle } from '@/components/map/MapThemeToggle';
import { useFilterStore } from '@/stores/useFilterStore';
import { useMapThemeStore } from '@/stores/useMapThemeStore';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type MainMapProps = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: MapSport[];
};

type MapLocation = { center: [number, number]; zoom: number; duration?: number };

/** Экземпляр карты — та часть API, которой пользуемся. */
type YMapInstance = {
  addChild: (child: unknown) => unknown;
  removeChild: (child: unknown) => void;
  setLocation: (loc: MapLocation) => void;
};

/** Тип глобального объекта ymaps3 после await ready */
type Ymaps3Api = {
  ready: Promise<void>;
  YMap: new (container: HTMLElement, options: { location: MapLocation }) => YMapInstance;
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

export function MainMap({ clubs, trainers, sports }: MainMapProps) {
  const { isLoaded, error } = useYandexMap();
  const selectedCity = useFilterStore((state) => state.selectedCity);
  // Phase 29 Step 29.1: тема карты для CSS-фильтра. SSR-safe — initial 'light',
  // после mount Zustand persist-middleware подставит сохранённое значение.
  const mapTheme = useMapThemeStore((state) => state.theme);
  const markers = useMapMarkers({ clubs, trainers, sports });
  const containerRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<YMapInstance | null>(null);
  // Флаг: карта инициализирована (после ymaps3.ready + создание карты)
  const [isMapReady, setIsMapReady] = useState(false);
  // Текущие маркеры карты и их DOM-капли — для очистки и переключения активного
  const markerObjectsRef = useRef<unknown[]>([]);
  const markerElementsRef = useRef<Map<EntityId, HTMLElement>>(new Map());
  // Выбранная точка: капля активна, снизу — карточка. Выбор помнит список, на котором
  // сделан: сменились фильтры — список другой, и выбор гаснет сам, без сброса в эффекте.
  const [selection, setSelection] = useState<{ id: EntityId; list: MapMarkerData[] } | null>(null);
  // Динамический список городов для определения центра
  const [cities, setCities] = useState<City[]>([]);

  const activeId = selection !== null && selection.list === markers ? selection.id : null;
  const activeMarker = markers.find((marker) => marker.id === activeId) ?? null;
  // Легенда — виды, у которых есть маркер на карте, в порядке справочника
  const legendSports = useMemo(
    () => sports.filter((sport) => markers.some((marker) => marker.sportId === sport.id)),
    [sports, markers],
  );

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
        location: { center: getCityCenter(selectedCity, cities), zoom: DEFAULT_MAP_ZOOM },
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

    mapInstanceRef.current.setLocation({
      center: getCityCenter(selectedCity, cities),
      zoom: DEFAULT_MAP_ZOOM,
      duration: 400,
    });
  }, [selectedCity, isMapReady, cities]);

  // Обновление маркеров при изменении фильтров: старые снять, новые поставить.
  useEffect(() => {
    if (!isMapReady || !mapInstanceRef.current) return;

    const ymaps3 = getYmaps3();
    if (!ymaps3?.YMapMarker) return;

    const map = mapInstanceRef.current;

    for (const obj of markerObjectsRef.current) {
      try {
        map.removeChild(obj);
      } catch {
        // Маркер мог быть уже удалён
      }
    }
    markerObjectsRef.current = [];
    markerElementsRef.current = new Map();

    for (const marker of markers) {
      const pinEl = createMarkerElement(marker);
      const yMapMarker = new ymaps3.YMapMarker(
        {
          coordinates: [marker.coordinates.lng, marker.coordinates.lat],
          // Клик по активной капле снимает выбор, по другой — переносит его
          onClick: () => {
            setSelection((current) =>
              current?.list === markers && current.id === marker.id
                ? null
                : { id: marker.id, list: markers },
            );
          },
        },
        pinEl,
      );
      map.addChild(yMapMarker);
      markerObjectsRef.current.push(yMapMarker);
      markerElementsRef.current.set(marker.id, pinEl);
    }
  }, [markers, isMapReady]);

  // Активное состояние — классом на капле: маркеры не пересоздаются при выборе
  useEffect(() => {
    for (const [id, el] of markerElementsRef.current) {
      setMarkerActive(el, id === activeId);
    }
  }, [activeId, markers]);

  // Escape снимает выбор — карточка снизу закрывается с клавиатуры
  useEffect(() => {
    if (activeId === null) return;

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setSelection(null);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [activeId]);

  // Ошибка загрузки
  if (error) {
    return (
      <div className="flex min-h-[20rem] items-center justify-center rounded-card border border-dashed border-line bg-bg p-6">
        <p className="text-sm text-muted">Ошибка загрузки карты: {error}</p>
      </div>
    );
  }

  // Skeleton до загрузки API
  if (!isLoaded) {
    return (
      <div
        data-testid="map-skeleton"
        className="flex min-h-[20rem] animate-pulse items-center justify-center rounded-card border border-line bg-bg sm:min-h-[24rem] lg:min-h-[28rem]"
      >
        <p className="text-sm text-muted">Загрузка карты…</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/*
        Phase 29 Step 29.1: data-map-theme на контейнере карты управляет
        CSS-фильтром (см. globals.css). Toggle, легенда, карточка и empty-state —
        absolute siblings ВНЕ этого контейнера, чтобы фильтр их не инвертировал.
      */}
      <div
        ref={containerRef}
        data-testid="yandex-map-container"
        data-map-theme={mapTheme}
        className="h-[20rem] overflow-hidden rounded-card border border-line shadow-card sm:h-[24rem] lg:h-[28rem]"
      />
      {/* Toggle темы карты — поверх карты, в правом верхнем углу */}
      <MapThemeToggle className="absolute top-2 right-2 z-10 md:top-3 md:right-3" />
      <MapLegend sports={legendSports} lifted={activeMarker !== null} />
      {activeMarker ? (
        <MapActiveCard
          marker={activeMarker}
          onClose={() => {
            setSelection(null);
          }}
        />
      ) : null}
      {/* Empty state — нет маркеров для текущих фильтров */}
      {markers.length === 0 && (
        <div
          data-testid="map-empty-state"
          className="absolute inset-x-0 bottom-4 mx-auto max-w-md rounded-card border border-line bg-card/95 px-5 py-3 text-center text-sm text-muted shadow-card backdrop-blur-sm"
        >
          В городе {selectedCity} пока нет доступных услуг по выбранным фильтрам. Попробуйте
          изменить фильтры или выбрать другой город.
        </div>
      )}
    </div>
  );
}
