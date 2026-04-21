// Конвертация Booking.statusHistory в user-friendly таймлайн атлета (Step 25.4).
// Правила: без actor-кодов, с человеческими лейблами; автопереходы (actor='system') скрыты,
// чтобы атлет не видел внутренних FSM-триггеров.
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

export function formatStatusHistoryForAthlete(
  history: BookingStatusTransition[],
): AthleteTimelineEntry[] {
  return history
    .filter((transition) => transition.actor !== 'system')
    .map((transition) => ({
      label: buildLabel(transition),
      at: transition.at,
    }));
}
