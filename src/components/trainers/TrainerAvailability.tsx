'use client';

import Link from 'next/link';

import { Badge, Card } from '@/components/ui';
import { formatPrice } from '@/lib/utils';

import type { TrainerAvailabilityItem } from '@/components/trainers/trainer-preview';

type TrainerAvailabilityProps = {
  dateLabel: string;
  slots: TrainerAvailabilityItem[];
};

function getPlacesLabel(value: number): string {
  const mod10 = value % 10;
  const mod100 = value % 100;

  if (mod10 === 1 && mod100 !== 11) {
    return 'место';
  }

  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) {
    return 'места';
  }

  return 'мест';
}

export function TrainerAvailability({ dateLabel, slots }: TrainerAvailabilityProps) {
  return (
    <section id="availability" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
            Trainer availability
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Свободные окна тренеров</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Ближайшие</Badge>
          <Badge tone="outline">{dateLabel}</Badge>
        </div>
      </div>

      {slots.length > 0 ? (
        <div
          data-testid="trainer-availability-grid"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {slots.map((slot) => (
            <Link
              key={slot.id}
              href={`/booking/${slot.id}`}
              className="group block"
              aria-label={`Открыть запись к тренеру ${slot.trainerName}`}
            >
              <Card className="flex h-full flex-col gap-5 transition-transform duration-200 group-hover:-translate-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
                      Персональная услуга
                    </p>
                    <h3 className="mt-2 text-xl font-semibold leading-tight text-ink">
                      {slot.trainerName}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-muted">{slot.title}</p>
                  </div>
                  <Badge tone="teal">
                    Свободно {slot.availableSpots} {getPlacesLabel(slot.availableSpots)}
                  </Badge>
                </div>

                <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
                  <div className="rounded-card border border-line bg-canvas px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      Время
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {slot.startTime} - {slot.endTime}
                    </p>
                  </div>

                  <div className="rounded-card border border-line bg-panel-strong px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      Стоимость
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {formatPrice(slot.price)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      Площадка
                    </p>
                    <p className="mt-1 text-sm text-ink">{slot.venueLabel}</p>
                    {slot.room ? <p className="mt-1 text-xs text-muted">{slot.room}</p> : null}
                  </div>

                  <span className="text-sm font-semibold text-accent-strong transition-transform duration-200 group-hover:translate-x-1">
                    Перейти к записи
                  </span>
                </div>
              </Card>
            </Link>
          ))}
        </div>
      ) : (
        <Card className="bg-panel-strong">
          <p className="text-sm leading-relaxed text-muted">
            У тренеров пока нет новых свободных окон. Проверь позже или переключись обратно в
            клубный режим, чтобы посмотреть ближайшие групповые слоты.
          </p>
        </Card>
      )}
    </section>
  );
}
