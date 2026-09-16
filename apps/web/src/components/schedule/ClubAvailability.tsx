'use client';

/*
 * ClubAvailability — секция «Ближайшие занятия» в нижней части главной
 * (Phase 28.13). Зеркальный аналог TrainerAvailability, но для клубных
 * сессий: использует тот же ui/SlotCard через маппинг UpcomingSessionItem.
 *
 * Дизайн handoff'а: тот же claude-design/slots-availability/ — общий slot-
 * card визуал, отличие только в данных и текстах header (eyebrow «Sessions
 * today», title «Ближайшие занятия», tools-pill «Сегодня» + chip даты).
 *
 * Auth-guard НЕ живёт здесь — он остался в UpcomingSessions (orchestrator),
 * чтобы не дублировать `useAuthStore`/toast логику. Принимает onSelect как
 * callback, проброшенный сверху.
 */
import { CardSlider, SlotCard } from '@/components/ui';

import type { UpcomingSessionItem } from '@/components/schedule/getUpcomingSessions';

type ClubAvailabilityProps = {
  dateLabel: string;
  sessions: UpcomingSessionItem[];
  onSelect: (scheduleId: number) => void;
};

/* Маппинг клубной сессии на нейтральный контракт SlotCard. */
function mapSessionToSlot(session: UpcomingSessionItem) {
  return {
    eyebrow: 'Групповое занятие',
    name: session.title,
    sport: session.clubName,
    availableSpots: session.availableSpots,
    startTime: session.startTime,
    endTime: session.endTime,
    price: session.price,
    venueLabel: session.clubName,
    room: session.room,
    slotId: session.id,
    ctaAriaName: `К записи: ${session.title}`,
  };
}

export function ClubAvailability({ dateLabel, sessions, onSelect }: ClubAvailabilityProps) {
  /* tools — кастомный блок справа от title. Стрелки prev/next рендерит
   * сам CardSlider — здесь только pill+date. */
  const tools = (
    <>
      <span className="inline-flex items-center rounded-full bg-lime px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-ink whitespace-nowrap">
        Сегодня
      </span>
      <span className="inline-flex items-center rounded-full border border-line bg-transparent px-3.5 py-2 font-body text-[11px] font-bold uppercase tracking-[0.16em] text-ink whitespace-nowrap">
        {dateLabel}
      </span>
    </>
  );

  return (
    <CardSlider
      eyebrow="Sessions today"
      title="Ближайшие занятия"
      accent="lime"
      sliderId="club-availability"
      total={sessions.length}
      visibleByBp={{ sm: 1, md: 2, xl: 3 }}
      tools={tools}
      emptyMessage="На сегодня в расписании нет новых слотов. Проверь другие секции или открой клуб, чтобы посмотреть ближайшие даты."
    >
      {sessions.map((session, i) => (
        <SlotCard key={session.id} {...mapSessionToSlot(session)} index={i} onSelect={onSelect} />
      ))}
    </CardSlider>
  );
}
