/**
 * Обёртка для секции карты на главной: YandexMapProvider + MainMap.
 * Заголовок секции рендерится всегда, даже при fallback (нет API-ключа).
 * Получает данные клубов/тренеров через props для маркеров.
 * Шаг 38.80: шапка секции в типографике эталона — капитель и H2 display-шрифтом;
 * `id` секции — из словаря секций, не литералом.
 */
'use client';

import type { Club } from '@sporthub/types';

import { MainMap } from '@/components/map/MainMap';
import { YandexMapProvider } from '@/components/map/YandexMapProvider';
import type { MapSport } from '@/components/map/useMapMarkers';
import { HOME_SECTIONS } from '@/lib/home-sections';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type MapSectionProps = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: MapSport[];
};

export function MapSection({ clubs, trainers, sports }: MapSectionProps) {
  return (
    <section id={HOME_SECTIONS.map.id} className="space-y-4">
      <div>
        <p className="t-eyebrow">Выдача на карте</p>
        <h2 className="t-h2 mt-2 text-ink">Карта</h2>
      </div>
      <YandexMapProvider>
        <MainMap clubs={clubs} sports={sports} trainers={trainers} />
      </YandexMapProvider>
    </section>
  );
}
