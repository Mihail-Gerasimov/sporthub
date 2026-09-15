// Чистые функции рейтинга надёжности для атлетов и провайдеров.
//
// ⚠️ Фаза 38, этап Э3: надёжность вырезается целиком (решение заказчика 15.09.2026).
// `computeCancelReason` переехала в `booking-fsm.ts` — она принадлежит машине состояний
// записи. Остальное снимается шагом 38.26 вместе с потребителями во фронте.
// Все функции принимают коллекцию booking'ов явно — не обращаются к БД напрямую. Это
// делает их тестируемыми и пригодными к SSR-вызову (`page.tsx` загружает bookings
// и прокидывает в UI уже посчитанный `ReliabilityResult`).
//
// ⚠️ Фаза 35, этап Э0a: прежнее правило «три неявки подряд → неделя без записи»
// вырезано целиком — санкции за неявки продумываются заново отдельной работой.
// Надёжность осталась: она ИНФОРМИРУЕТ, а не наказывает. Неявки по-прежнему
// считаются и опускают бейдж, просто больше не запирают запись.

import { DISCIPLINE_CONFIG, type DisciplineConfig } from './discipline-config';
import type { Booking, EntityId, ReliabilityResult } from '@sporthub/types';

/**
 * Результат расчёта надёжности для одной сущности (атлет, клуб или тренер).
 *
 * Объявление переехало в `@sporthub/types` и здесь только пересылается дальше:
 * надёжность стала полем контракта (`Club.reliability`, `Trainer.reliability`),
 * а пакет типов не вправе зависеть от пакета логики. Импорт `из @sporthub/domain`
 * у прежних потребителей продолжает работать — тип тот же самый.
 */
export type { ReliabilityResult } from '@sporthub/types';

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
 * Записи провайдера, разложенные по значимым статусам.
 *
 * Нужен потому, что считать надёжность можно из ДВУХ источников: из самих записей
 * (так делают личные кабинеты, у которых записи уже на руках) и из счётчиков
 * запроса-агрегата (так делает каталог, которому ради двух чисел на карточку
 * поднимать записи незачем). Общий у них ровно этот набор чисел.
 */
export interface ProviderReliabilityCounts {
  completed: number;
  noShow: number;
  cancelledByProvider: number;
  rejectedByProvider: number;
}

/**
 * Рейтинг провайдера (клуба или тренера) ИЗ СЧЁТЧИКОВ.
 *
 * Здесь и только здесь живёт сама формула: отношение «прошедших» ко всем значимым.
 * Прошедшие = completed + no_show (провайдер дал возможность провести; неявка —
 * вина атлета). Знаменатель = completed + no_show + cancelled_by_provider +
 * rejected_by_provider. cancelled_by_athlete к репутации провайдера не относится.
 *
 * ⚠️ Расчёт по записям (`computeClubReliability` ниже) сводится СЮДА, а не повторяет
 * формулу своими словами: две копии одной формулы разошлись бы молча, просто выдав
 * разные числа на карточке каталога и в кабинете провайдера.
 */
export function computeProviderReliabilityFromCounts(
  counts: ProviderReliabilityCounts,
  config: DisciplineConfig = DISCIPLINE_CONFIG,
): ReliabilityResult {
  const totalRelevant =
    counts.completed + counts.noShow + counts.cancelledByProvider + counts.rejectedByProvider;
  const held = counts.completed + counts.noShow;
  const completionRate = totalRelevant === 0 ? 1 : held / totalRelevant;
  const isNewUser = held < config.minCompletedForBadge;

  return {
    totalRelevant,
    completedCount: counts.completed,
    noShowCount: counts.noShow,
    lateCancelCount: counts.cancelledByProvider,
    rejectedByProviderCount: counts.rejectedByProvider,
    completionRate,
    badge: computeBadge(completionRate, isNewUser, config),
    isNewUser,
  };
}

/** Тот же рейтинг, но по уже поднятым записям: пересчитывает их в счётчики. */
function computeProviderReliability(
  relevant: Booking[],
  config: DisciplineConfig,
): ReliabilityResult {
  return computeProviderReliabilityFromCounts(
    {
      completed: relevant.filter((b) => b.status === 'completed').length,
      noShow: relevant.filter((b) => b.status === 'no_show').length,
      cancelledByProvider: relevant.filter((b) => b.status === 'cancelled_by_provider').length,
      rejectedByProvider: relevant.filter((b) => b.status === 'rejected_by_provider').length,
    },
    config,
  );
}

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

/** Рейтинг клуба — по его записям (ownerType='club' && ownerId=clubId или clubId=clubId). */
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
