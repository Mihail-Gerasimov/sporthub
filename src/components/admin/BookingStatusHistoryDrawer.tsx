// Phase 24 Step 24.15: drawer-таймлайн statusHistory конкретного booking'а.
// Admin-инструмент — быстрая диагностика всех FSM-переходов (actor/время/reason).
// Построен на существующем `Modal` (отдельного Drawer UI пока нет).
//
// Phase 28.18: визуальный rebrand под dark-look — внутренние карточки
// статусов получают `bg-card-2` (выделение на фоне Modal `bg-card`),
// `rounded-[12px]` и `font-mono` через token `t-mono` для timestamp'ов.
'use client';

import { Modal } from '@/components/ui/Modal';
import type { Booking, BookingActor, BookingStatus } from '@/types';

export interface BookingStatusHistoryDrawerProps {
  open: boolean;
  onClose: () => void;
  booking: Booking | null;
}

const STATUS_LABELS: Record<BookingStatus, string> = {
  pending: 'pending (ожидает подтверждения)',
  confirmed: 'confirmed (подтверждено)',
  completed: 'completed (проведено)',
  no_show: 'no_show (неявка)',
  unmarked: 'unmarked (просрочено без отметки)',
  rejected_by_provider: 'rejected_by_provider (отклонено провайдером)',
  cancelled_by_athlete: 'cancelled_by_athlete (отмена атлета)',
  cancelled_by_provider: 'cancelled_by_provider (отмена провайдера)',
};

const ACTOR_LABELS: Record<BookingActor, string> = {
  athlete: 'атлет',
  provider: 'провайдер',
  admin: 'админ',
  system: 'система (авто)',
};

function formatTimestamp(at: string): string {
  const date = new Date(at);
  return date.toLocaleString('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function BookingStatusHistoryDrawer({
  open,
  onClose,
  booking,
}: BookingStatusHistoryDrawerProps) {
  if (!booking) return null;

  const history = booking.statusHistory ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`История статусов booking #${booking.id}`}>
      {history.length === 0 ? (
        <p className="text-sm text-muted">
          История пуста — booking не имеет зафиксированных переходов.
        </p>
      ) : (
        <ol className="flex flex-col gap-2.5" data-testid="booking-status-history-timeline">
          {history.map((transition, index) => (
            <li
              key={`${transition.at}-${index}`}
              className="rounded-[12px] border border-line bg-card-2 p-3.5"
            >
              <p className="font-mono text-[12px] tabular-nums text-muted">
                {formatTimestamp(transition.at)}
              </p>
              <p className="mt-1.5 text-sm text-ink">
                <span className="font-semibold">
                  {transition.from ? STATUS_LABELS[transition.from] : '∅'} →{' '}
                  {STATUS_LABELS[transition.to]}
                </span>
              </p>
              <p className="mt-1 text-xs text-muted">
                Инициатор: {ACTOR_LABELS[transition.actor]}
                {transition.actorUserId !== undefined ? ` (user #${transition.actorUserId})` : ''}
              </p>
              {transition.reason ? (
                <p className="mt-1 text-xs text-muted">Причина: {transition.reason}</p>
              ) : null}
            </li>
          ))}
        </ol>
      )}
    </Modal>
  );
}
