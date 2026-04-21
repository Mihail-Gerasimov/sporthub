// Таймлайн FSM-переходов booking'а для атлета (Step 25.4): читабельные лейблы + локальная дата.
// Admin-drawer (BookingStatusHistoryDrawer) остаётся отдельным — у админа свой формат.
'use client';

import { formatStatusHistoryForAthlete } from '@/lib/athlete-timeline-format';
import type { BookingStatusTransition } from '@/types';

interface AthleteBookingTimelineProps {
  history: BookingStatusTransition[];
}

function formatAt(iso: string): string {
  const date = new Date(iso);

  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function AthleteBookingTimeline({ history }: AthleteBookingTimelineProps) {
  const entries = formatStatusHistoryForAthlete(history);

  if (entries.length === 0) {
    return (
      <p className="text-sm leading-relaxed text-muted" data-testid="athlete-timeline-empty">
        История пуста: пока нет переходов по этой записи.
      </p>
    );
  }

  return (
    <ol className="flex flex-col gap-3" data-testid="athlete-timeline">
      {entries.map((entry, index) => (
        <li key={`${entry.at}-${index}`} className="rounded-card border border-line bg-canvas p-3">
          <p className="text-sm font-semibold text-ink">{entry.label}</p>
          <p className="mt-1 text-xs text-muted">{formatAt(entry.at)}</p>
        </li>
      ))}
    </ol>
  );
}
