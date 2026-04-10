/**
 * Обёртка для секции карты на главной: YandexMapProvider + MainMap.
 * Заголовок секции рендерится всегда, даже при fallback (нет API-ключа).
 */
'use client';

import { MainMap } from '@/components/map/MainMap';
import { YandexMapProvider } from '@/components/map/YandexMapProvider';

export function MapSection() {
  return (
    <section id="results" className="space-y-4">
      <div>
        <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">Map</p>
        <h2 className="mt-2 text-2xl font-semibold text-ink">Карта</h2>
      </div>
      <YandexMapProvider>
        <MainMap />
      </YandexMapProvider>
    </section>
  );
}
