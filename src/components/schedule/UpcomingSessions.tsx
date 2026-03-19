'use client';

import Link from 'next/link';

import { TrainerAvailability } from '@/components/trainers';
import { Badge, Card } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { useFilterStore } from '@/stores/useFilterStore';

import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';

type UpcomingSessionsProps = {
  sessions: UpcomingSessionItem[];
  dateLabel: string;
  trainerDateLabel: string;
  trainerSlots: TrainerAvailabilityItem[];
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

export function UpcomingSessions({
  dateLabel,
  sessions,
  trainerDateLabel,
  trainerSlots,
}: UpcomingSessionsProps) {
  const discoveryMode = useFilterStore((state) => state.discoveryMode);

  if (discoveryMode === 'trainers') {
    return <TrainerAvailability dateLabel={trainerDateLabel} slots={trainerSlots} />;
  }

  return (
    <section id="availability" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.22em] text-muted">
            Sessions today
          </p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Ближайшие занятия</h2>
        </div>

        <div className="flex flex-wrap gap-2">
          <Badge tone="accent">Сегодня</Badge>
          <Badge tone="outline">{dateLabel}</Badge>
        </div>
      </div>

      {sessions.length > 0 ? (
        <div
          data-testid="upcoming-sessions-grid"
          className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
        >
          {sessions.map((session) => (
            <Link
              key={session.id}
              href={`/booking/${session.id}`}
              className="group block"
              aria-label={`Открыть запись на занятие ${session.title}`}
            >
              <Card className="flex h-full flex-col gap-5 transition-transform duration-200 group-hover:-translate-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.2em] text-muted">
                      {session.clubName}
                    </p>
                    <h3 className="mt-2 text-xl font-semibold leading-tight text-ink">
                      {session.title}
                    </h3>
                  </div>
                  <Badge tone="teal">
                    Свободно {session.availableSpots} {getPlacesLabel(session.availableSpots)}
                  </Badge>
                </div>

                <div className="grid gap-3 text-sm text-muted sm:grid-cols-2">
                  <div className="rounded-card border border-line bg-canvas px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Время
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {session.startTime} - {session.endTime}
                    </p>
                  </div>

                  <div className="rounded-card border border-line bg-panel-strong px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Стоимость
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {formatPrice(session.price)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-muted">
                      Зал
                    </p>
                    <p className="mt-1 text-sm text-ink">{session.room ?? 'Уточняется'}</p>
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
          <p className="text-sm leading-7 text-muted">
            На сегодня в расписании нет новых слотов. Проверь другие секции или открой клуб, чтобы
            посмотреть ближайшие даты.
          </p>
        </Card>
      )}
    </section>
  );
}
