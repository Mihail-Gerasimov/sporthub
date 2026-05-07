import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { getUpcomingSessions } from '@/components/schedule/getUpcomingSessions';
import type { Club, Schedule } from '@/types';

/* Phase 30.7: фиксируем системное время на ~01:00 Samara (21:00 UTC предыдущего дня),
   чтобы все слоты с date='2026-03-17' и любыми endTime были в будущем относительно
   проверки isSlotUpcoming (TZ-safe). */
beforeAll(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-03-16T21:00:00.000Z'));
});

afterAll(() => {
  vi.useRealTimers();
});

const clubs: Club[] = [
  {
    id: 1,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Volna Aquatic Club',
    slug: 'volna-aquatic-club',
    description: 'Клуб с бассейном и восстановительными программами',
    shortDescription: 'Бассейн, пилатес и утренние группы.',
    city: 'Самара',
    address: 'ул. Лесная, 23к1',
    phone: '+7 (846) 200-11-01',
    email: 'hello@volna-club.ru',
    website: 'https://volna-club.ru',
    coordinates: { lat: 53.2129, lng: 50.1245 },
    sportIds: [3, 8],
    imageUrls: ['/images/clubs/volna-1.jpg'],
    amenityIds: [1],
    tagIds: [1],
    rating: 4.8,
    reviewCount: 64,
    priceFrom: 900,
    distanceKm: 1.8,
  },
  {
    id: 3,
    createdAt: '2026-03-17T09:00:00.000Z',
    name: 'Balance Yoga House',
    slug: 'balance-yoga-house',
    description: 'Камерная студия йоги и пилатеса',
    shortDescription: 'Йога и пилатес в центре города.',
    city: 'Самара',
    address: 'ул. Молодогвардейская, 86',
    phone: '+7 (846) 200-11-03',
    email: 'hello@balance-house.ru',
    website: 'https://balance-house.ru',
    coordinates: { lat: 53.1957, lng: 50.1006 },
    sportIds: [1, 8],
    imageUrls: ['/images/clubs/balance-1.jpg'],
    amenityIds: [1],
    tagIds: [1],
    rating: 4.9,
    reviewCount: 72,
    priceFrom: 850,
    distanceKm: 2.3,
  },
];

const schedule: Schedule[] = [
  {
    id: 31,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Вечерняя техника кроля',
    description: 'Работа над техникой рук и ног.',
    date: '2026-03-17',
    startTime: '19:00',
    endTime: '20:00',
    durationMinutes: 60,
    level: 'intermediate',
    capacity: 14,
    bookedCount: 8,
    price: 1150,
    room: 'Бассейн A',
  },
  {
    id: 32,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 2,
    sportId: 8,
    title: 'Пилатес для спины',
    description: 'Мягкая работа на центр тела и разгрузку спины.',
    date: '2026-03-17',
    startTime: '12:00',
    endTime: '12:55',
    durationMinutes: 55,
    level: 'beginner',
    capacity: 12,
    bookedCount: 9,
    price: 950,
    room: 'Зал Balance',
  },
  {
    id: 33,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    title: 'Утренняя хатха-йога',
    description: 'Спокойная практика на мобилизацию и дыхание.',
    date: '2026-03-17',
    startTime: '09:00',
    endTime: '10:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 12,
    bookedCount: 6,
    price: 900,
    room: 'Зал Light',
  },
  {
    id: 34,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 6,
    sportId: 8,
    title: 'Pilates Core',
    description: 'Контроль центра тела и плавная силовая работа.',
    date: '2026-03-17',
    startTime: '13:00',
    endTime: '13:55',
    durationMinutes: 55,
    level: 'beginner',
    capacity: 10,
    bookedCount: 7,
    price: 950,
    room: 'Зал Light',
  },
  {
    id: 35,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Утреннее плавание',
    description: 'Техника дыхания и работа на скольжение.',
    date: '2026-03-17',
    startTime: '07:30',
    endTime: '08:30',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 8,
    price: 1100,
    room: 'Бассейн A',
  },
  {
    id: 36,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 5,
    sportId: 1,
    title: 'Вечерний flow',
    description: 'Практика на баланс и расслабление.',
    date: '2026-03-17',
    startTime: '18:30',
    endTime: '19:30',
    durationMinutes: 60,
    level: 'intermediate',
    capacity: 12,
    bookedCount: 10,
    price: 950,
    room: 'Зал Flow',
  },
  {
    id: 37,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 2,
    sportId: 8,
    title: 'Поздний recovery-пилатес',
    description: 'Расслабляющая практика на восстановление.',
    date: '2026-03-17',
    startTime: '20:30',
    endTime: '21:20',
    durationMinutes: 50,
    level: 'all_levels',
    capacity: 12,
    bookedCount: 5,
    price: 900,
    room: 'Зал Balance',
  },
  {
    id: 38,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 3,
    trainerId: 6,
    sportId: 8,
    title: 'Полностью занятый слот',
    description: 'Слот без свободных мест.',
    date: '2026-03-17',
    startTime: '16:00',
    endTime: '16:55',
    durationMinutes: 55,
    level: 'beginner',
    capacity: 10,
    bookedCount: 10,
    price: 950,
    room: 'Зал Light',
  },
  {
    id: 39,
    createdAt: '2026-03-17T09:00:00.000Z',
    clubId: 1,
    trainerId: 1,
    sportId: 3,
    title: 'Завтрашнее плавание',
    description: 'Слот на другую дату.',
    date: '2026-03-18',
    startTime: '08:00',
    endTime: '09:00',
    durationMinutes: 60,
    level: 'all_levels',
    capacity: 14,
    bookedCount: 5,
    price: 1100,
    room: 'Бассейн A',
  },
];

describe('getUpcomingSessions', () => {
  it('возвращает только сегодняшние занятия со свободными местами, отсортированные по времени', () => {
    const sessions = getUpcomingSessions({
      clubs,
      schedule,
      targetDate: '2026-03-17',
    });

    expect(sessions).toHaveLength(6);
    expect(sessions.map((session) => session.id)).toEqual([35, 33, 32, 34, 36, 31]);
    expect(sessions.map((session) => session.availableSpots)).toEqual([6, 6, 3, 3, 2, 6]);
    expect(sessions.map((session) => session.clubName)).toEqual([
      'Volna Aquatic Club',
      'Balance Yoga House',
      'Volna Aquatic Club',
      'Balance Yoga House',
      'Balance Yoga House',
      'Volna Aquatic Club',
    ]);
  });

  it('Phase 30.7: сегодняшние слоты с прошедшим endTime не попадают в выдачу', () => {
    /* Перетаскиваем системное время на 14:00 Samara (10:00 UTC) — слот id=35
       с endTime='08:30' уже прошёл и должен быть отсечён, остальные с endTime
       после 14:00 Samara (33→09:00 ❌, 36→19:30 ✓, 37→21:20 ✓ и т.д.) пропадут
       или останутся согласно времени. Конкретно проверяем ТОЛЬКО что слот с
       endTime '08:30' исчезает, а слот '19:30' остаётся. */
    vi.setSystemTime(new Date('2026-03-17T10:00:00.000Z')); // 14:00 Samara

    const sessions = getUpcomingSessions({
      clubs,
      schedule,
      targetDate: '2026-03-17',
    });

    const ids = sessions.map((s) => s.id);
    /* id=35 (07:30-08:30) — уже прошёл → не виден */
    expect(ids).not.toContain(35);
    /* id=36 (18:30-19:30) — ещё впереди → виден */
    expect(ids).toContain(36);

    /* Возвращаем системное время после теста — другие it'ы используют старое */
    vi.setSystemTime(new Date('2026-03-16T21:00:00.000Z'));
  });
});
