// Тесты справочника тренеров и свободных окон (ревью 38.73/38.74, пункт 2).
//
// «Доступен сейчас» и «Свободные окна тренеров» считаются ОДНИМ предикатом домена
// `isSlotOpenToday` — тем же, что у занятий клубов (38.81): сегодня ∧ ещё не
// началось ∧ есть места. Прежде фронт держал свою тройку фильтров по `endTime`,
// и окно, начавшееся десять минут назад, всё ещё считалось «доступен сейчас».
// Момент приходит аргументом: отбор воспроизводим без подмены таймеров.
// Диверсия — вернуть `isSlotUpcoming` в фильтр: первый кейс красный.

import { describe, expect, it } from 'vitest';

import {
  buildTrainerDirectory,
  getTrainerAvailability,
} from '@/components/trainers/trainer-preview';
import type { Schedule, Trainer } from '@sporthub/types';

const TODAY = '2026-03-17';
/** 09:00 в Самаре (UTC+4): окно 08:30–09:30 уже идёт, 10:00 — впереди. */
const NOW = new Date('2026-03-17T05:00:00.000Z');

const trainer: Trainer = {
  id: 7,
  createdAt: '2026-03-17T09:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Тренер по плаванию.',
  avatarUrl: '',
  experienceYears: 9,
  specialtyIds: [],
  workFormatIds: [],
  sportIds: [3],
  rating: 4.9,
  reviewCount: 31,
  priceFrom: 1400,
  city: 'Самара',
  address: 'ул. Лесная, 23к1',
  coordinates: { lat: 53.2129, lng: 50.1245 },
};

function slot(
  overrides: Partial<Schedule> & Pick<Schedule, 'id' | 'startTime' | 'endTime'>,
): Schedule {
  return {
    createdAt: '2026-03-17T09:00:00.000Z',
    ownerType: 'trainer',
    ownerId: trainer.id,
    trainerId: trainer.id,
    sportId: 3,
    title: `Окно ${overrides.id}`,
    date: TODAY,
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 4,
    bookedCount: 1,
    price: 1400,
    ...overrides,
  };
}

/** Идёт сейчас, впереди со свободными местами, впереди без мест, завтра. */
const SCHEDULE: Schedule[] = [
  slot({ id: 1, startTime: '08:30', endTime: '09:30' }),
  slot({ id: 2, startTime: '10:00', endTime: '11:00' }),
  slot({ id: 3, startTime: '11:00', endTime: '12:00', bookedCount: 4 }),
  slot({ id: 4, startTime: '07:00', endTime: '08:00', date: '2026-03-18' }),
];

const SPORTS = [{ id: 3, name: 'Плавание', icon: '🏊' }];

describe('trainer-preview: свободное окно дня — предикат домена', () => {
  it('в справочнике считаются только окна впереди с местами: начавшееся, полное и завтрашнее — нет', () => {
    const [item] = buildTrainerDirectory({
      clubs: [],
      offerings: [],
      schedule: SCHEDULE,
      sports: SPORTS,
      trainers: [trainer],
      targetDate: TODAY,
      now: NOW,
    });

    expect(item.availableSlotsCount).toBe(1);
    expect(item.nextSlotId).toBe(2);
    expect(item.nextSlotStartTime).toBe('10:00');
  });

  it('«Свободные окна тренеров» — тот же отбор: одно окно, 10:00', () => {
    const directory = buildTrainerDirectory({
      clubs: [],
      offerings: [],
      schedule: SCHEDULE,
      sports: SPORTS,
      trainers: [trainer],
      targetDate: TODAY,
      now: NOW,
    });

    const items = getTrainerAvailability({
      schedule: SCHEDULE,
      trainers: directory,
      targetDate: TODAY,
      now: NOW,
    });

    expect(items.map((item) => [item.id, item.startTime, item.availableSpots])).toEqual([
      [2, '10:00', 3],
    ]);
  });
});
