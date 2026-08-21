// Phase 24 Step 24.12: чистые функции рейтинга надёжности для атлетов и провайдеров,
// плюс computeCancelReason и isAthleteInQuarantine. Все функции принимают коллекцию
// booking'ов явно — не обращаются к БД напрямую. Это делает их тестируемыми и пригодными
// к SSR-вызову (`page.tsx` загружает bookings и прокидывает в UI уже посчитанный
// `ReliabilityResult`).

import { DISCIPLINE_CONFIG, type DisciplineConfig } from './discipline-config';
import type {
  Booking,
  BookingActor,
  CancellationPolicy,
  CancelReason,
  EntityId,
  ISODateTimeString,
  Schedule,
} from '@sporthub/types';

import { hoursUntilSlotStart } from './time';

/**
 * Результат расчёта надёжности для одной сущности (атлет, клуб или тренер).
 * Поле badge=null означает «рейтинг ≥ warningThreshold, бейджа не показываем».
 * isNewUser=true — количество завершённых booking'ов ниже minCompletedForBadge.
 */
export interface ReliabilityResult {
  totalRelevant: number;
  completedCount: number;
  noShowCount: number;
  lateCancelCount: number;
  rejectedByProviderCount: number;
  completionRate: number;
  badge: null | 'warning' | 'danger';
  isNewUser: boolean;
}

/** Собирает relevant-bookings атлета: completed + no_show + late-cancel (cancelled_by_athlete с reason='late'). */
function getAthleteRelevantBookings(bookings: Booking[], userId: EntityId): Booking[] {
  return bookings.filter((booking) => {
    if (booking.userId !== userId) return false;
    if (booking.status === 'completed' || booking.status === 'no_show') return true;
    if (booking.status === 'cancelled_by_athlete' && booking.cancelReason === 'late') return true;
    return false;
  });
}

function computeBadge(
  completionRate: number,
  isNewUser: boolean,
  config: DisciplineConfig,
): ReliabilityResult['badge'] {
  if (isNewUser) return null;
  if (completionRate < config.reliability.dangerThreshold) return 'danger';
  if (completionRate < config.reliability.warningThreshold) return 'warning';
  return null;
}

/**
 * Рейтинг надёжности атлета по его booking-истории. Completion rate =
 * completed / (completed + no_show + late_cancel). Rejected_by_provider не учитываем
 * для атлета (вина провайдера/администратора — не его).
 */
export function computeAthleteReliability(
  bookings: Booking[],
  userId: EntityId,
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): ReliabilityResult {
  const relevant = getAthleteRelevantBookings(bookings, userId);
  const completedCount = relevant.filter((b) => b.status === 'completed').length;
  const noShowCount = relevant.filter((b) => b.status === 'no_show').length;
  const lateCancelCount = relevant.filter(
    (b) => b.status === 'cancelled_by_athlete' && b.cancelReason === 'late',
  ).length;

  const totalRelevant = relevant.length;
  const completionRate = totalRelevant === 0 ? 1 : completedCount / totalRelevant;
  const isNewUser = completedCount < config.minCompletedForBadge;

  return {
    totalRelevant,
    completedCount,
    noShowCount,
    lateCancelCount,
    rejectedByProviderCount: 0,
    completionRate,
    badge: computeBadge(completionRate, isNewUser, config),
    isNewUser,
  };
}

/**
 * Рейтинг провайдера (клуба или тренера): отношение «прошедших» ко всем relevant.
 * Прошедшие = completed + no_show (провайдер дал возможность провести; неявка — вина атлета).
 * Знаменатель = completed + no_show + cancelled_by_provider + rejected_by_provider.
 * cancelled_by_athlete — не относится к репутации провайдера.
 */
function computeProviderReliability(
  relevant: Booking[],
  config: DisciplineConfig,
): ReliabilityResult {
  const completedCount = relevant.filter((b) => b.status === 'completed').length;
  const noShowCount = relevant.filter((b) => b.status === 'no_show').length;
  const cancelledByProviderCount = relevant.filter(
    (b) => b.status === 'cancelled_by_provider',
  ).length;
  const rejectedByProviderCount = relevant.filter(
    (b) => b.status === 'rejected_by_provider',
  ).length;

  const totalRelevant = relevant.length;
  const held = completedCount + noShowCount;
  const completionRate = totalRelevant === 0 ? 1 : held / totalRelevant;
  const isNewUser = held < config.minCompletedForBadge;

  return {
    totalRelevant,
    completedCount,
    noShowCount,
    lateCancelCount: cancelledByProviderCount,
    rejectedByProviderCount,
    completionRate,
    badge: computeBadge(completionRate, isNewUser, config),
    isNewUser,
  };
}

/** Рейтинг клуба — по его booking'ам (ownerType='club' && ownerId=clubId или clubId=clubId). */
/**
 * Статусы, из которых складывается надёжность провайдера.
 *
 * Объявлены отдельно, потому что у набора ДВА потребителя: сам расчёт ниже и
 * запрос, который отбирает записи до чтения. Раньше список был вшит в тело
 * функции, и запрос, повторивший его своими словами, разошёлся бы с расчётом
 * при первой же правке — молча, просто выдав другие числа.
 */
export const PROVIDER_RELIABILITY_STATUSES = [
  'completed',
  'no_show',
  'cancelled_by_provider',
  'rejected_by_provider',
] as const;

export function computeClubReliability(
  bookings: Booking[],
  clubId: EntityId,
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): ReliabilityResult {
  const relevant = bookings.filter((booking) => {
    const matchesClub =
      booking.clubId === clubId || (booking.ownerType === 'club' && booking.ownerId === clubId);
    if (!matchesClub) return false;

    return (PROVIDER_RELIABILITY_STATUSES as readonly string[]).includes(booking.status);
  });

  return computeProviderReliability(relevant, config);
}

/** Рейтинг тренера — по его booking'ам (ownerType='trainer' && ownerId=trainerId или trainerId=trainerId). */
export function computeTrainerReliability(
  bookings: Booking[],
  trainerId: EntityId,
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): ReliabilityResult {
  const relevant = bookings.filter((booking) => {
    const matchesTrainer =
      booking.trainerId === trainerId ||
      (booking.ownerType === 'trainer' && booking.ownerId === trainerId);
    if (!matchesTrainer) return false;

    return (PROVIDER_RELIABILITY_STATUSES as readonly string[]).includes(booking.status);
  });
  return computeProviderReliability(relevant, config);
}

/**
 * Вычисляет cancelReason для отмены атлетом: on_time (в пределах окна бесплатной
 * отмены по snapshot-policy) или late (за окном). Чистая функция: получает booking
 * и slot явно. Используется в API `/bookings/[id]/cancel` (через db.ts).
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

export interface QuarantineResult {
  inQuarantine: boolean;
  until?: ISODateTimeString;
  reason?: string;
}

/**
 * Опции для `isAthleteInQuarantine`. Phase 24 Step 24.15: `quarantineLiftedAt`
 * — отметка админа о ручном снятии карантина (поле `User.quarantineLiftedAt`).
 * Если есть lift и он позже последнего no_show — карантин считается снятым,
 * даже если по окну/триггеру атлет формально в нём.
 */
export interface QuarantineOptions {
  config?: DisciplineConfig;
  quarantineLiftedAt?: ISODateTimeString | null;
}

/**
 * Определяет, находится ли атлет в карантине. Правило: N подряд no_show без
 * разрыва через completed в окне последних `windowDays` → карантин до
 * endAt_last_no_show + `durationDays`. Если текущее время ≥ until — карантин снят.
 * Если админ снял карантин (quarantineLiftedAt) и lift позже последнего no_show —
 * карантин тоже снят.
 *
 * Сортировка booking'ов — по `completedAt` (если есть) или `date`. Для событий одного
 * дня используется стабильный fallback — порядок из массива.
 */
export function isAthleteInQuarantine(
  bookings: Booking[],
  userId: EntityId,
  now: Date,
  options: QuarantineOptions = {},
): QuarantineResult {
  const config = options.config ?? DISCIPLINE_CONFIG;
  const quarantineLiftedAt = options.quarantineLiftedAt ?? null;
  const windowMs = config.quarantine.windowDays * 24 * 60 * 60 * 1000;
  const windowStart = new Date(now.getTime() - windowMs);

  const relevant = bookings
    .filter((b) => b.userId === userId && (b.status === 'completed' || b.status === 'no_show'))
    .map((b) => ({
      booking: b,
      // Для сортировки: completedAt у completed, для no_show используем date+end-of-day.
      sortKey: b.completedAt ?? `${b.date}T23:59:59.000Z`,
    }))
    .filter(({ sortKey }) => new Date(sortKey).getTime() >= windowStart.getTime())
    .sort((left, right) => left.sortKey.localeCompare(right.sortKey));

  if (relevant.length < config.quarantine.consecutiveNoShowTrigger) {
    return { inQuarantine: false };
  }

  // Берём последние N и смотрим: все ли — no_show.
  const lastN = relevant.slice(-config.quarantine.consecutiveNoShowTrigger);
  const allNoShow = lastN.every(({ booking }) => booking.status === 'no_show');
  if (!allNoShow) return { inQuarantine: false };

  const lastNoShow = lastN[lastN.length - 1];
  const lastNoShowTime = new Date(lastNoShow.sortKey).getTime();
  const untilDate = new Date(lastNoShowTime + config.quarantine.durationDays * 24 * 60 * 60 * 1000);

  if (now.getTime() >= untilDate.getTime()) {
    return { inQuarantine: false };
  }

  // Phase 24 Step 24.15: ручное снятие админом. Lift после последнего no_show снимает карантин.
  if (quarantineLiftedAt) {
    const liftTime = new Date(quarantineLiftedAt).getTime();
    if (liftTime >= lastNoShowTime) {
      return { inQuarantine: false };
    }
  }

  return {
    inQuarantine: true,
    until: untilDate.toISOString() as ISODateTimeString,
    reason: `${config.quarantine.consecutiveNoShowTrigger} неявки подряд — записи временно ограничены`,
  };
}

/** Тип actor, которому разрешено снимать карантин досрочно (admin). Пригодится в Step 24.14+. */
export type QuarantineLiftActor = Extract<BookingActor, 'admin'>;
