'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

import { TrainerAvailability } from '@/components/trainers';
import { ActionNotice, Badge, Card } from '@/components/ui';
import { formatPrice } from '@/lib/utils';
import { useAuthStore } from '@/stores/useAuthStore';
import { useFilterStore } from '@/stores/useFilterStore';

import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';
import type { TrainerAvailabilityItem } from '@/components/trainers';

type UpcomingSessionsProps = {
  sessions: UpcomingSessionItem[];
  dateLabel: string;
  trainerDateLabel: string;
  trainerSlots: TrainerAvailabilityItem[];
};

/* Таймаут показа уведомления (мс) */
const AUTH_NOTICE_TIMEOUT_MS = 3200;

/* Русская плюрализация для «место/места/мест» */
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
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const accountType = useAuthStore((state) => state.accountType);
  const router = useRouter();
  const [notice, setNotice] = useState<string | null>(null);

  /* Автоскрытие уведомления */
  useEffect(() => {
    if (!notice) {
      return undefined;
    }

    const timeoutId = window.setTimeout(() => {
      setNotice(null);
    }, AUTH_NOTICE_TIMEOUT_MS);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }, [notice]);

  /* Обработчик клика по карточке занятия — проверяет auth */
  const handleSessionClick = useCallback(
    (scheduleId: number) => {
      if (isAuthenticated && accountType === 'athlete') {
        router.push(`/booking/${scheduleId}`);
      } else {
        setNotice('Чтобы записаться, войдите или зарегистрируйтесь как спортсмен');
      }
    },
    [accountType, isAuthenticated, router],
  );

  if (discoveryMode === 'trainers') {
    return <TrainerAvailability dateLabel={trainerDateLabel} slots={trainerSlots} />;
  }

  return (
    <section id="availability" className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
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
            <button
              key={session.id}
              type="button"
              className="group block w-full text-left"
              aria-label={`Открыть запись на занятие ${session.title}`}
              onClick={() => {
                handleSessionClick(session.id);
              }}
            >
              <Card className="flex h-full flex-col gap-5 transition-transform duration-200 group-hover:-translate-y-1">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-[0.10em] text-muted">
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
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      Время
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {session.startTime} - {session.endTime}
                    </p>
                  </div>

                  <div className="rounded-card border border-line bg-panel-strong px-4 py-3">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      Стоимость
                    </p>
                    <p className="mt-2 text-base font-semibold text-ink">
                      {formatPrice(session.price)}
                    </p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line/80 pt-4">
                  <div>
                    <p className="text-[11px] font-semibold uppercase tracking-[0.10em] text-muted">
                      Зал
                    </p>
                    <p className="mt-1 text-sm text-ink">{session.room ?? 'Уточняется'}</p>
                  </div>

                  <span className="text-sm font-semibold text-accent-strong transition-transform duration-200 group-hover:translate-x-1">
                    Перейти к записи
                  </span>
                </div>
              </Card>
            </button>
          ))}
        </div>
      ) : (
        <Card className="bg-panel-strong">
          <p className="text-sm leading-relaxed text-muted">
            На сегодня в расписании нет новых слотов. Проверь другие секции или открой клуб, чтобы
            посмотреть ближайшие даты.
          </p>
        </Card>
      )}

      {notice ? <ActionNotice message={notice} /> : null}
    </section>
  );
}
