'use client';

import type { EntityId } from '@/types';

import type { TrainerDirectoryItem } from '@/components/trainers/trainer-preview';

type TrainerMapViewProps = {
  onSelectTrainer: (trainerId: EntityId) => void;
  selectedTrainerId: EntityId | null;
  trainers: TrainerDirectoryItem[];
};

type MarkerPosition = {
  index: number;
  left: number;
  top: number;
  trainer: TrainerDirectoryItem;
};

function getMarkerPositions(trainers: TrainerDirectoryItem[]): MarkerPosition[] {
  if (trainers.length === 0) {
    return [];
  }

  const latitudes = trainers.map((trainer) => trainer.coordinates.lat);
  const longitudes = trainers.map((trainer) => trainer.coordinates.lng);

  const minLat = Math.min(...latitudes);
  const maxLat = Math.max(...latitudes);
  const minLng = Math.min(...longitudes);
  const maxLng = Math.max(...longitudes);

  const latRange = Math.max(maxLat - minLat, 0.01);
  const lngRange = Math.max(maxLng - minLng, 0.01);

  return trainers.map((trainer, index) => {
    const horizontalOffset = index % 2 === 0 ? -1.5 : 1.5;
    const verticalOffset = index % 3 === 0 ? -2 : index % 3 === 1 ? 1.5 : 0;

    return {
      trainer,
      index,
      left: 12 + ((trainer.coordinates.lng - minLng) / lngRange) * 76 + horizontalOffset,
      top: 18 + ((maxLat - trainer.coordinates.lat) / latRange) * 58 + verticalOffset,
    };
  });
}

function getMarkerLabel(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);

  if (words.length <= 1) {
    return name;
  }

  return `${words[0]} ${words[1]}`;
}

export function TrainerMapView({
  onSelectTrainer,
  selectedTrainerId,
  trainers,
}: TrainerMapViewProps) {
  const positions = getMarkerPositions(trainers);

  if (trainers.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-line bg-canvas p-6 text-sm leading-relaxed text-muted">
        Для текущих фильтров на карте пока нечего показать.
      </div>
    );
  }

  return (
    <div className="relative overflow-hidden rounded-card border border-line bg-panel p-5 text-panel sm:p-6">
      <div className="pointer-events-none absolute inset-0 opacity-80">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(216,90,50,0.16),transparent_26%),radial-gradient(circle_at_right,rgba(12,111,115,0.18),transparent_32%)]" />
      </div>

      <div className="relative flex items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Trainer map
          </p>
          <h3 className="mt-2 font-display text-2xl font-semibold text-ink">
            География тренеров Самары
          </h3>
        </div>
        <span className="rounded-pill border border-line bg-panel-strong px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.08em] text-ink">
          {trainers.length} маркеров
        </span>
      </div>

      <div className="relative mt-6 min-h-[24rem] overflow-hidden rounded-[2rem] border border-line bg-[linear-gradient(160deg,#17343f_0%,#0d5f68_38%,#f0dcc2_132%)] sm:min-h-[26rem] lg:min-h-[29rem]">
        <div className="pointer-events-none absolute inset-0 opacity-45">
          <div className="absolute inset-0 bg-[linear-gradient(rgba(255,247,235,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,247,235,0.08)_1px,transparent_1px)] bg-[size:3.75rem_3.75rem]" />
          <div className="absolute left-[8%] top-[20%] h-[52%] w-[28%] rounded-full border border-panel/12" />
          <div className="absolute right-[9%] top-[18%] h-[46%] w-[30%] rounded-full border border-panel/12" />
          <div className="absolute left-[28%] bottom-[10%] h-[22%] w-[38%] rounded-full border border-panel/10" />
        </div>

        <div className="absolute inset-x-4 top-5 flex justify-between text-[10px] font-semibold uppercase tracking-[0.10em] text-panel/55">
          <span>Набережная</span>
          <span>Центр</span>
          <span>Север</span>
        </div>

        {positions.map(({ index, left, top, trainer }) => {
          const isActive = trainer.id === selectedTrainerId;

          return (
            <button
              key={trainer.id}
              type="button"
              aria-label={`Выбрать тренера ${trainer.name} на карте`}
              aria-pressed={isActive}
              data-marker-size="compact"
              className={`absolute -translate-x-1/2 -translate-y-1/2 rounded-pill border px-2.5 py-2 text-left shadow-card transition-all ${
                isActive
                  ? 'z-10 border-panel bg-panel text-ink shadow-floating'
                  : 'border-panel/18 bg-[rgba(255,247,235,0.16)] text-panel hover:border-panel/35 hover:bg-panel/22'
              }`}
              style={{ left: `${left}%`, top: `${top}%` }}
              onClick={() => {
                onSelectTrainer(trainer.id);
              }}
            >
              <span className="flex items-center gap-2">
                <span
                  className={`inline-flex size-2.5 shrink-0 rounded-full ${
                    isActive ? 'bg-accent' : 'bg-panel'
                  }`}
                />
                <span className="min-w-0">
                  <span className="block text-[10px] font-semibold uppercase tracking-[0.14em] opacity-70">
                    {index + 1}
                  </span>
                  <span className="block max-w-[7.6rem] truncate text-[12px] font-semibold">
                    {getMarkerLabel(trainer.name)}
                  </span>
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
