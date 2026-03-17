'use client';

import type { Club, EntityId } from '@/types';

type MapViewProps = {
  clubs: Club[];
  selectedClubId: EntityId | null;
  onSelectClub: (clubId: EntityId) => void;
};

type MarkerPosition = {
  club: Club;
  left: number;
  top: number;
};

function getMarkerPositions(clubs: Club[]): MarkerPosition[] {
  if (clubs.length === 0) {
    return [];
  }

  const latitudes = clubs.map((club) => club.coordinates.lat);
  const longitudes = clubs.map((club) => club.coordinates.lng);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  return clubs.map((club) => ({
    club,
    left: 12 + ((club.coordinates.lng - minLng) / lngRange) * 76,
    top: 18 + ((maxLat - club.coordinates.lat) / latRange) * 58,
  }));
}

export function MapView({ clubs, onSelectClub, selectedClubId }: MapViewProps) {
  const positions = getMarkerPositions(clubs);

  // STUB: заменить на Яндекс.Карты / 2GIS.
  if (clubs.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-canvas p-6 text-sm leading-7 text-muted">
        Для текущих фильтров на карте пока нечего показать.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-[linear-gradient(160deg,#15343c_0%,#0d5f68_45%,#f0dcc2_130%)] p-5 text-panel shadow-card">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute -left-8 top-12 h-44 w-44 rounded-full bg-accent/24 blur-3xl" />
        <div className="absolute right-6 top-10 h-36 w-36 rounded-full bg-panel/18 blur-3xl" />
        <div className="absolute bottom-4 left-1/4 h-24 w-2/5 rotate-[-8deg] rounded-full bg-panel/18 blur-xl" />
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-panel/72">
            Map stub
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold">География клубов Самары</h3>
        </div>
        <span className="rounded-pill border border-panel/18 bg-panel/12 px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.16em] text-panel">
          {clubs.length} маркеров
        </span>
      </div>

      <div className="relative mt-6 min-h-[22rem] rounded-card border border-panel/16 bg-[rgba(15,26,31,0.12)]">
        <div className="absolute inset-x-4 top-5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.18em] text-panel/55">
          <span>Набережная</span>
          <span>Центр</span>
          <span>Север</span>
        </div>

        {positions.map(({ club, left, top }) => {
          const isActive = club.id === selectedClubId;

          return (
            <button
              key={club.id}
              type="button"
              aria-label={`Выбрать клуб ${club.name} на карте`}
              aria-pressed={isActive}
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-pill border px-3 py-2 text-left shadow-card transition-all ${
                isActive
                  ? 'z-10 border-panel bg-panel text-ink shadow-floating'
                  : 'border-panel/18 bg-[rgba(255,247,235,0.16)] text-panel hover:bg-panel/22'
              }`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => {
                onSelectClub(club.id);
              }}
            >
              <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] opacity-70">
                {club.distanceKm.toFixed(1)} км
              </span>
              <span className="mt-1 block whitespace-nowrap text-sm font-semibold">
                {club.name}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
