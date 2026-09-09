// Сторож наборов статусов, которыми страницы сужают запрос записей.
//
// Наборы выведены из правил домена, но объявлены отдельно от них — иначе сузить
// запрос было бы нечем. Разъехавшись, они дают самую тихую поломку из возможных:
// страница спрашивает меньше, чем читает, счётчик становится меньше, а выглядит
// всё по-прежнему рабочим.
//
// Поэтому здесь проверяется не совпадение списков, а ПОВЕДЕНИЕ: через сами доменные
// функции прогоняются записи всех восьми статусов, и набор тех, на которые функция
// отреагировала, сравнивается с объявленным.

import {
  computeAthleteReliability,
  computeClubReliability,
  computeTrainerReliability,
  PROVIDER_RELIABILITY_STATUSES,
} from '@sporthub/domain';
import { BOOKING_STATUSES, type Booking, type BookingStatus } from '@sporthub/types';
import { describe, expect, it } from 'vitest';

import { ATHLETE_RELIABILITY_STATUSES } from '@/lib/booking-scopes';

/** Запись клуба 1, тренера 1 и атлета 1 — одна на статус. */
function bookingOf(status: BookingStatus, over: Partial<Booking> = {}): Booking {
  return {
    id: 1,
    createdAt: '2026-05-01T10:00:00.000Z',
    scheduleId: 1,
    userId: 1,
    ownerType: 'club',
    ownerId: 1,
    clubId: 1,
    trainerId: 1,
    sportId: 1,
    date: '2026-05-01',
    status,
    paymentStatus: 'unpaid',
    totalPrice: 1000,
    // Поздняя отмена — единственный подвид, который читает расчёт надёжности атлета.
    ...(status === 'cancelled_by_athlete' ? { cancelReason: 'late' as const } : {}),
    ...over,
  };
}

/** Статусы, на которые правило отреагировало: запись попала в знаменатель. */
function statusesCountedBy(compute: (bookings: Booking[]) => { totalRelevant: number }) {
  return BOOKING_STATUSES.filter((status) => compute([bookingOf(status)]).totalRelevant === 1);
}

describe('Наборы статусов для сужения запроса записей', () => {
  // ⚠️ Набор берётся из `@sporthub/domain`, а не из фронтового модуля: своей копии
  // у фронта больше нет, надёжность провайдера считает бэкенд. Сторож нужен всё равно —
  // теперь он защищает то самое объявление, по которому запрос-агрегат каталога
  // отбирает записи: разойдясь с расчётом, оно молча выдало бы другие числа.
  it('надёжность клуба читает ровно PROVIDER_RELIABILITY_STATUSES', () => {
    expect(statusesCountedBy((bookings) => computeClubReliability(bookings, 1)).sort()).toEqual(
      [...PROVIDER_RELIABILITY_STATUSES].sort(),
    );
  });

  it('надёжность тренера читает тот же набор', () => {
    expect(statusesCountedBy((bookings) => computeTrainerReliability(bookings, 1)).sort()).toEqual(
      [...PROVIDER_RELIABILITY_STATUSES].sort(),
    );
  });

  it('надёжность атлета читает ровно ATHLETE_RELIABILITY_STATUSES', () => {
    expect(statusesCountedBy((bookings) => computeAthleteReliability(bookings, 1)).sort()).toEqual(
      [...ATHLETE_RELIABILITY_STATUSES].sort(),
    );
  });
});
