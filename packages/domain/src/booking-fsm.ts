// Конечный автомат записи на тренировку — чистые правила без ввода-вывода.
//
// До Phase 32 всё это жило внутри файла базы данных вперемешку с записью в JSON.
// Здесь только правила: какие переходы возможны, кто вправе их делать и как
// меняется число занятых мест. Ни чтения, ни записи, ни уведомлений — поэтому
// одни и те же правила использует и бэкенд, и экраны.

import type { BookingActor, BookingStatus } from '@sporthub/types';

/**
 * Граф допустимых переходов.
 * Финальные статусы исходящих переходов не имеют: из них выходят только через
 * физическое удаление записи админом.
 */
export const FSM_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  pending: ['confirmed', 'rejected_by_provider', 'cancelled_by_athlete', 'cancelled_by_provider'],
  confirmed: ['completed', 'no_show', 'cancelled_by_athlete', 'cancelled_by_provider', 'unmarked'],
  completed: [],
  no_show: [],
  unmarked: [],
  rejected_by_provider: [],
  cancelled_by_athlete: [],
  cancelled_by_provider: [],
};

/**
 * Кто вправе выполнять переход. Ключ — «откуда->куда».
 * Админ в карте не упоминается намеренно: ему разрешён любой допустимый переход.
 * Актор `system` — только для автопереходов по времени.
 */
export const TRANSITION_ACTORS: Partial<Record<string, BookingActor[]>> = {
  'pending->confirmed': ['provider'],
  'pending->rejected_by_provider': ['provider'],
  'pending->cancelled_by_athlete': ['athlete'],
  'pending->cancelled_by_provider': ['provider', 'system'],
  'confirmed->completed': ['provider'],
  'confirmed->no_show': ['provider'],
  'confirmed->cancelled_by_athlete': ['athlete'],
  'confirmed->cancelled_by_provider': ['provider'],
  'confirmed->unmarked': ['system'],
};

/**
 * Проверка перехода по двум осям: допустим ли он вообще и вправе ли актор.
 * Тексты ошибок перенесены дословно — на них завязаны и роуты, которые
 * превращают сообщение в HTTP-код 409, и тесты.
 */
export function validateTransition(
  from: BookingStatus,
  to: BookingStatus,
  actor: BookingActor,
): void {
  const allowed = FSM_TRANSITIONS[from];

  if (!allowed || !allowed.includes(to)) {
    throw new Error(`Недопустимый переход booking: ${from} → ${to}`);
  }

  if (actor === 'admin') {
    return;
  }

  const key = `${from}->${to}`;
  const allowedActors = TRANSITION_ACTORS[key];

  if (!allowedActors || !allowedActors.includes(actor)) {
    throw new Error(`Actor '${actor}' не может выполнять переход ${from} → ${to}`);
  }
}

/**
 * Насколько меняется число занятых мест при переходе.
 * Семантика: `bookedCount` — физически занятые места, а не активные записи.
 * Любая отмена или отказ освобождает место; завершение, неявка и «не отмечено»
 * счётчик не трогают — место уже было занято.
 */
export function getBookedCountDelta(from: BookingStatus, to: BookingStatus): number {
  void from;

  if (
    to === 'cancelled_by_athlete' ||
    to === 'cancelled_by_provider' ||
    to === 'rejected_by_provider'
  ) {
    return -1;
  }

  return 0;
}

/** Можно ли перейти из одного статуса в другой (без учёта актора). */
export function canTransition(from: BookingStatus, to: BookingStatus): boolean {
  return FSM_TRANSITIONS[from]?.includes(to) ?? false;
}
