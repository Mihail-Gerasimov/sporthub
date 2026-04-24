// Конвертация Booking.statusHistory в user-friendly таймлайн атлета (Step 25.4).
// Правила: без actor-кодов, с человеческими лейблами; автопереходы (actor='system')
// скрыты по умолчанию. Исключение Phase 27 Step 27.5 — auto-expire pending
// (actor='system' + to='cancelled_by_provider' + reason='auto_cancel_pending_expired')
// показываем явно, т.к. для атлета это важное событие: его запись отменили не
// «провайдер вручную», а система из-за того, что провайдер не успел подтвердить.
import type { BookingStatus, BookingStatusTransition, ISODateTimeString } from '@/types';

export interface AthleteTimelineEntry {
  label: string;
  at: ISODateTimeString;
}

/** Лейбл по комбинации (actor, to-status); ключевые переходы. */
function buildLabel(transition: BookingStatusTransition): string {
  const { actor, to, reason, from } = transition;

  if (actor === 'athlete') {
    if (from === null && to === 'pending') {
      return 'Вы записались';
    }

    if (to === 'cancelled_by_athlete') {
      return reason === 'late' ? 'Вы отменили (поздняя отмена)' : 'Вы отменили';
    }

    return fallbackLabel(to, 'Вы');
  }

  if (actor === 'provider') {
    if (to === 'confirmed') {
      return 'Провайдер подтвердил';
    }

    if (to === 'cancelled_by_provider') {
      return 'Провайдер отменил';
    }

    if (to === 'rejected_by_provider') {
      return 'Провайдер отклонил';
    }

    if (to === 'completed') {
      return 'Провайдер отметил как проведённую';
    }

    if (to === 'no_show') {
      return 'Провайдер отметил неявку';
    }

    return fallbackLabel(to, 'Провайдер');
  }

  if (actor === 'system') {
    // Phase 27 Step 27.5: auto-expire pending — единственный system-переход, который
    // мы показываем атлету. Формулируем так, чтобы он понимал причину отмены.
    if (to === 'cancelled_by_provider' && reason === 'auto_cancel_pending_expired') {
      return 'Запись отменена автоматически — провайдер не подтвердил вовремя';
    }
    return fallbackLabel(to, 'Система');
  }

  // actor === 'admin' — редкие служебные переходы, помечаем явно.
  if (to === 'completed') {
    return 'Админ отметил как проведённую';
  }

  if (to === 'cancelled_by_provider' || to === 'cancelled_by_athlete') {
    return 'Админ отменил';
  }

  return fallbackLabel(to, 'Админ');
}

/** Fallback для нестандартных комбинаций — даёт осмысленный текст без падения. */
function fallbackLabel(to: BookingStatus, actorPrefix: string): string {
  const statusLabels: Record<BookingStatus, string> = {
    pending: 'создали запись',
    confirmed: 'подтвердили запись',
    completed: 'завершили запись',
    no_show: 'отметили неявку',
    unmarked: 'оставили без отметки',
    rejected_by_provider: 'отклонили запись',
    cancelled_by_athlete: 'отменили запись',
    cancelled_by_provider: 'отменили запись',
  };

  return `${actorPrefix} ${statusLabels[to]}`;
}

// Phase 27 Step 27.5: system-переходы скрываем по умолчанию, исключение —
// auto-expire pending (важное событие для атлета, иначе из таймлайна непонятно,
// почему запись вдруг отменилась).
function shouldDisplaySystemTransition(transition: BookingStatusTransition): boolean {
  return (
    transition.to === 'cancelled_by_provider' && transition.reason === 'auto_cancel_pending_expired'
  );
}

export function formatStatusHistoryForAthlete(
  history: BookingStatusTransition[],
): AthleteTimelineEntry[] {
  return history
    .filter(
      (transition) => transition.actor !== 'system' || shouldDisplaySystemTransition(transition),
    )
    .map((transition) => ({
      label: buildLabel(transition),
      at: transition.at,
    }));
}
