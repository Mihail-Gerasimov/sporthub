// Конечный автомат записи на тренировку — чистые правила без ввода-вывода.
//
// До Phase 32 всё это жило внутри файла базы данных вперемешку с записью в JSON.
// Здесь только правила: какие переходы возможны, кто вправе их делать и как
// меняется число занятых мест. Ни чтения, ни записи, ни уведомлений — поэтому
// одни и те же правила использует и бэкенд, и экраны.

import type {
  Booking,
  BookingActor,
  BookingStatus,
  CancellationPolicy,
  CancelReason,
  Schedule,
} from '@sporthub/types';

import { DISCIPLINE_CONFIG, type DisciplineConfig } from './discipline-config';
import { hoursUntilSlotStart } from './time';

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

/**
 * Причина отмены спортсменом: вовремя (`on_time`) или поздно (`late`).
 *
 * Считается по политике отмены, ЗАМОРОЖЕННОЙ в записи на момент её создания
 * (`cancellationPolicySnapshot`), и по часам до начала слота. Чистая функция:
 * запись и слот приходят явно, базу она не знает.
 *
 * ⚠️ Фаза 38, шаг 38.23: переехала сюда из файла надёжности. Надёжность вырезана
 * решением заказчика, а это правило — не про неё: без него отмена спортсменом
 * не получит `cancelReason`, и машина состояний записи останется без половины
 * перехода `→ cancelled_by_athlete`. Место правила — рядом с переходами.
 */
export function computeCancelReason(
  booking: Booking,
  slot: Schedule | null,
  now: Date,
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): CancelReason {
  const policy: CancellationPolicy = booking.cancellationPolicySnapshot ?? 'free_until_24h';
  const freeUntilHours = config.lateCancel.freeUntil[policy];

  if (!Number.isFinite(freeUntilHours)) {
    return 'on_time';
  }

  // no_refund (freeUntilHours === 0): окна бесплатной отмены нет → всегда late.
  if (freeUntilHours === 0) return 'late';

  // Защитный дефолт: если слот не найден (удалён параллельно), считаем отмену поздней.
  if (!slot) return 'late';

  // Часы до начала считает общий помощник: он работает по часам зала, а не по поясу
  // процесса. Прежняя копия давала расхождение до четырёх часов — больше, чем окно
  // строгой политики отмены, то есть решение переворачивалось целиком.
  return hoursUntilSlotStart(slot, now) >= freeUntilHours ? 'on_time' : 'late';
}
