// Тесты отбора занятий клубов для витрины (шаг 38.81).
//
// Шесть пунктов решения — шесть кейсов: сегодня → ещё не началось → есть места →
// те же фильтры, что у выдачи → по времени начала → первые N. Момент «сейчас»
// приходит аргументом, а не из часов процесса: отбор воспроизводим без подмены
// таймеров. Диверсия «слот без мест остался» — красный третий кейс.

import { describe, expect, it } from 'vitest';

import {
  applyUpcomingSessionFilters,
  getUpcomingSessions,
  type UpcomingSessionFilters,
} from '@/components/schedule/getUpcomingSessions';
import type { Club, Schedule } from '@sporthub/types';

const TODAY = '2026-03-17';
/** 09:00 в Самаре (UTC+4) — между утренними и дневными слотами стенда. */
const NOW = new Date('2026-03-17T05:00:00.000Z');

function club(overrides: Partial<Club> & Pick<Club, 'id' | 'name'>): Club {
  return {
    createdAt: '2026-03-17T09:00:00.000Z',
    slug: overrides.name.toLowerCase().replace(/\s+/g, '-'),
    description: 'Описание клуба',
    shortDescription: 'Коротко о клубе',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    phone: '+7 (846) 200-11-01',
    email: 'hello@club.local',
    website: 'https://club.local',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    sportIds: [3, 8],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
    ...overrides,
  };
}

function slot(
  overrides: Partial<Schedule> & Pick<Schedule, 'id' | 'clubId' | 'startTime' | 'endTime'>,
): Schedule {
  return {
    createdAt: '2026-03-17T09:00:00.000Z',
    trainerId: 1,
    sportId: 3,
    title: `Занятие ${overrides.id}`,
    description: 'Описание занятия',
    date: TODAY,
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 10,
    bookedCount: 4,
    price: 1000,
    room: 'Зал A',
    ...overrides,
  };
}

const CLUBS: Club[] = [
  club({ id: 1, name: 'Volna Aquatic Club', sportIds: [3, 8] }),
  club({ id: 3, name: 'Balance Yoga House', sportIds: [1, 8], city: 'Тольятти' }),
];

const SPORTS = [
  { id: 1, name: 'Йога', icon: '🧘' },
  { id: 3, name: 'Плавание', icon: '🏊' },
  { id: 8, name: 'Пилатес', icon: '🤸' },
];

const select = (schedule: Schedule[]) =>
  getUpcomingSessions({ clubs: CLUBS, schedule, targetDate: TODAY, now: NOW });

const NO_FILTERS: UpcomingSessionFilters = {
  searchQuery: '',
  selectedSportId: null,
  selectedCity: '',
  sports: SPORTS,
};

/** Пункты 4 и 6 поверх отбора дня — как делает секция слотов с фильтрами из стора. */
const narrow = (
  schedule: Schedule[],
  filters: Partial<UpcomingSessionFilters> = {},
  limit?: number,
) =>
  applyUpcomingSessionFilters({
    sessions: select(schedule),
    clubs: CLUBS,
    filters: { ...NO_FILTERS, ...filters },
    limit,
  });

describe('getUpcomingSessions — шесть пунктов отбора', () => {
  it('1. только сегодня: вчера и завтра — мимо', () => {
    const sessions = select([
      slot({ id: 1, clubId: 1, startTime: '10:00', endTime: '11:00' }),
      slot({ id: 2, clubId: 1, startTime: '10:00', endTime: '11:00', date: '2026-03-18' }),
      slot({ id: 3, clubId: 1, startTime: '10:00', endTime: '11:00', date: '2026-03-16' }),
    ]);

    expect(sessions.map((session) => session.id)).toEqual([1]);
  });

  it('2. только не начавшиеся: идущее занятие ещё «не прошло», но в витрине его нет', () => {
    const sessions = select([
      // 08:30–09:30 — идёт прямо сейчас (09:00): записываться поздно.
      slot({ id: 1, clubId: 1, startTime: '08:30', endTime: '09:30' }),
      // Ровно 09:00 — началось.
      slot({ id: 2, clubId: 1, startTime: '09:00', endTime: '10:00' }),
      // 09:01 — ещё впереди.
      slot({ id: 3, clubId: 1, startTime: '09:01', endTime: '10:00' }),
      // Утреннее — давно прошло.
      slot({ id: 4, clubId: 1, startTime: '07:00', endTime: '08:00' }),
    ]);

    expect(sessions.map((session) => session.id)).toEqual([3]);
  });

  it('3. только со свободными местами: слот без мест прячется, освободилось — вернулся при следующей загрузке', () => {
    const full = slot({
      id: 1,
      clubId: 1,
      startTime: '12:00',
      endTime: '13:00',
      capacity: 10,
      bookedCount: 10,
    });
    const free = slot({
      id: 2,
      clubId: 1,
      startTime: '13:00',
      endTime: '14:00',
      capacity: 10,
      bookedCount: 9,
    });

    expect(select([full, free]).map((session) => session.id)).toEqual([2]);
    expect(select([full, free])[0].availableSpots).toBe(1);

    // Место освободилось — следующий отбор его показывает; механизма «вернуть» нет.
    const freed = { ...full, bookedCount: 9 };

    expect(select([freed, free]).map((session) => session.id)).toEqual([1, 2]);
  });

  it('4. те же фильтры, что у выдачи: вид спорта, город, запрос', () => {
    const schedule = [
      slot({ id: 1, clubId: 1, sportId: 3, startTime: '12:00', endTime: '13:00' }),
      slot({ id: 2, clubId: 1, sportId: 8, startTime: '13:00', endTime: '14:00' }),
      slot({ id: 3, clubId: 3, sportId: 1, startTime: '14:00', endTime: '15:00' }),
      slot({ id: 4, clubId: 3, sportId: 8, startTime: '15:00', endTime: '16:00' }),
    ];

    // Без фильтров — все четыре, в порядке отбора дня.
    expect(narrow(schedule).map((session) => session.id)).toEqual([1, 2, 3, 4]);

    // Вид спорта: пилатес есть у обоих клубов — но только слоты ПИЛАТЕСА, не все слоты клубов.
    expect(narrow(schedule, { selectedSportId: 8 }).map((session) => session.id)).toEqual([2, 4]);

    // Город — правило выдачи, регистр не важен.
    expect(narrow(schedule, { selectedCity: 'тольятти' }).map((session) => session.id)).toEqual([
      3, 4,
    ]);

    // Запрос — по тексту клуба, как в выдаче: «yoga» находит Balance Yoga House.
    expect(narrow(schedule, { searchQuery: 'yoga' }).map((session) => session.id)).toEqual([3, 4]);

    // Запрос по названию вида из справочника — тоже правило выдачи.
    expect(narrow(schedule, { searchQuery: 'плавание' }).map((session) => session.id)).toEqual([
      1, 2,
    ]);
  });

  it('5. по времени начала, при равенстве — по названию', () => {
    const sessions = select([
      slot({ id: 1, clubId: 1, startTime: '18:00', endTime: '19:00', title: 'Бокс' }),
      slot({ id: 2, clubId: 1, startTime: '12:00', endTime: '13:00', title: 'Йога' }),
      slot({ id: 3, clubId: 3, startTime: '12:00', endTime: '13:00', title: 'Аквааэробика' }),
      slot({ id: 4, clubId: 1, startTime: '09:30', endTime: '10:30', title: 'Плавание' }),
    ]);

    expect(sessions.map((session) => `${session.startTime} ${session.title}`)).toEqual([
      '09:30 Плавание',
      '12:00 Аквааэробика',
      '12:00 Йога',
      '18:00 Бокс',
    ]);
  });

  it('6. первые N — после всех отсевов и сортировки; N — одна константа', () => {
    const schedule = Array.from({ length: 9 }, (_, index) =>
      slot({
        id: index + 1,
        clubId: 1,
        startTime: `${String(10 + index).padStart(2, '0')}:00`,
        endTime: `${String(11 + index).padStart(2, '0')}:00`,
      }),
    );

    // Отбор дня — без среза: правая колонка героя считает все занятия дня.
    expect(select(schedule)).toHaveLength(9);
    // Секция — первые N после фильтров.
    expect(narrow(schedule)).toHaveLength(6);
    expect(narrow(schedule, {}, 2).map((session) => session.id)).toEqual([1, 2]);
    // Срез — ПОСЛЕ отсева и фильтра: полный слот и слот чужого вида места в шестёрке не занимают.
    const withFull = [
      { ...schedule[0], bookedCount: 10 },
      { ...schedule[1], sportId: 8 },
      ...schedule.slice(2),
    ];

    expect(narrow(withFull, { selectedSportId: 3 }).map((session) => session.id)).toEqual([
      3, 4, 5, 6, 7, 8,
    ]);
  });

  it('слот клуба, которого нет в списке (скрыт, архив), не показывается', () => {
    const sessions = select([slot({ id: 1, clubId: 99, startTime: '12:00', endTime: '13:00' })]);

    expect(sessions).toEqual([]);
  });

  it('карточка несёт всё, что нужно слоту: клуб, зал, цена, время, места', () => {
    const [session] = select([
      slot({
        id: 7,
        clubId: 1,
        startTime: '12:00',
        endTime: '13:00',
        title: 'Кроль',
        price: 1150,
        room: 'Бассейн A',
        capacity: 14,
        bookedCount: 8,
      }),
    ]);

    expect(session).toEqual({
      id: 7,
      title: 'Кроль',
      clubId: 1,
      clubName: 'Volna Aquatic Club',
      sportId: 3,
      date: TODAY,
      startTime: '12:00',
      endTime: '13:00',
      price: 1150,
      room: 'Бассейн A',
      availableSpots: 6,
    });
  });
});
