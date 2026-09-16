/**
 * Легенда карты (шаг 38.80) — по эталону (`App.tsx:1497-1505`): белая полупрозрачная
 * плашка справа снизу, рубрика «Виды спорта» капителью, строки «точка цвета + вид».
 * Виды — те, что сейчас на карте, а не весь справочник: легенда объясняет видимые
 * маркеры. Цвет точки — атрибут `fill` из справочника вида (та же запись, что красит
 * каплю); без цвета атрибута нет, и точку красит токен в CSS.
 *
 * ⚠️ Пока ни у одного вида на карте цвета нет (до миграции с колонкой `color` и на базе
 * без сида), легенды нет вовсе: N одинаковых точек с разными названиями — ложь, а не
 * легенда (ревью 38.80). Появится вместе с первым цветом в данных, без правки кода.
 *
 * Почему не `ui/Badge`: это список, а не метка; и слой над картой, а не элемент потока.
 */
import { useId } from 'react';

import type { MapSport } from '@/components/map/useMapMarkers';

type MapLegendProps = {
  sports: MapSport[];
  /** Сдвиг вверх, пока внизу стоит карточка выбранной точки (эталон: `bottom: 100`). */
  lifted: boolean;
};

export function MapLegend({ sports, lifted }: MapLegendProps) {
  const titleId = useId();

  if (!sports.some((sport) => sport.color)) return null;

  return (
    <div
      className={`absolute right-3 z-10 rounded-[12px] bg-card/95 px-3.5 py-2.5 shadow-card backdrop-blur-md transition-[bottom] ${lifted ? 'bottom-[100px]' : 'bottom-4'}`}
    >
      <p
        id={titleId}
        className="mb-1.5 font-body text-[9px] font-extrabold tracking-[0.08em] text-muted uppercase"
      >
        Виды спорта
      </p>
      <ul aria-labelledby={titleId} className="space-y-[3px]">
        {sports.map((sport) => (
          <li key={sport.id} className="flex items-center gap-1.5 font-body text-[10px] text-muted">
            <svg viewBox="0 0 8 8" aria-hidden="true" className="size-2 shrink-0">
              <circle className="map-legend-dot" cx="4" cy="4" r="4" fill={sport.color} />
            </svg>
            {sport.name}
          </li>
        ))}
      </ul>
    </div>
  );
}
