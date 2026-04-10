/**
 * Обёртка для секции карты на главной: YandexMapProvider + MainMap.
 * Заголовок секции рендерится всегда, даже при fallback (нет API-ключа).
 * Получает данные клубов/тренеров через props для маркеров.
 */
'use client';

import type { Club, EntityId } from '@/types';

import { MainMap } from '@/components/map/MainMap';
import { YandexMapProvider } from '@/components/map/YandexMapProvider';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type MapSectionProps = {
  clubs: Club[];
  trainers: TrainerDirectoryItem[];
  sports: Array<{ id: EntityId; name: string }>;
};

export function MapSection({ clubs, trainers, sports }: MapSectionProps) {
  return (
    <section id="results" className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Map</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Карта</h2>
      </div>
      <YandexMapProvider>
        <MainMap clubs={clubs} sports={sports} trainers={trainers} />
      </YandexMapProvider>
    </section>
  );
}
