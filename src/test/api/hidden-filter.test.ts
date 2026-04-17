// Тесты фильтрации скрытых публикаций в каталогах и booking protection (Step 22.5)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as getClubs } from '@/app/api/clubs/route';
import { GET as getTrainers } from '@/app/api/trainers/route';
import { POST as postBooking } from '@/app/api/bookings/route';
import { POST as postModeration } from '@/app/api/moderation/route';
import { createClubPublication, createTrainerPublication } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import { NextRequest } from 'next/server';

/* --- Хелперы --- */

function makeRequest(url: string, body?: unknown): Request {
  if (body) {
    return new Request(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }
  return new Request(url);
}

/* --- Фикстуры --- */

const clubInput = {
  club: {
    name: 'Клуб Фильтрация',
    slug: 'filter-club',
    description: 'Описание.',
    shortDescription: 'Клуб.',
    city: 'Самара',
    address: 'ул. Тестовая, 1',
    phone: '+7 (846) 000-00-00',
    coordinates: { lat: 53.2, lng: 50.15 },
    sportIds: [1],
    imageUrls: [],
    amenityIds: [],
    tagIds: [],
    rating: 0,
    reviewCount: 0,
    priceFrom: 1000,
    distanceKm: 0,
    isFeatured: false,
    managedByUserId: 2,
    source: 'provider' as const,
    status: 'published' as const,
  },
  offering: {
    ownerType: 'club' as const,
    sportId: 1,
    title: 'Занятия',
    description: 'Описание.',
    format: 'group' as const,
    price: 1000,
    durationMinutes: 60,
    capacity: 10,
    address: 'ул. Тестовая, 1',
    coordinates: { lat: 53.2, lng: 50.15 },
  },
  schedules: [
    {
      ownerType: 'club' as const,
      sportId: 1,
      title: 'Йога',
      date: '2026-04-20',
      startTime: '08:00',
      endTime: '09:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 10,
      bookedCount: 0,
      price: 1000,
      room: 'Зал',
    },
  ],
};

const trainerInput = {
  trainer: {
    name: 'Тренер Фильтрация',
    slug: 'filter-trainer',
    bio: 'Тренер.',
    avatarUrl: '',
    experienceYears: 5,
    specialtyIds: [1],
    workFormatIds: [1],
    rating: 0,
    reviewCount: 0,
    priceFrom: 2000,
    sportIds: [2],
    city: 'Самара',
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 53.2, lng: 50.15 },
    managedByUserId: 2,
    source: 'provider' as const,
    status: 'published' as const,
  },
  offering: {
    ownerType: 'trainer' as const,
    sportId: 2,
    title: 'Бокс',
    description: 'Описание.',
    format: 'personal' as const,
    price: 2000,
    durationMinutes: 60,
    capacity: 1,
    address: 'Зал',
    coordinates: { lat: 53.2, lng: 50.15 },
  },
  schedules: [
    {
      ownerType: 'trainer' as const,
      sportId: 2,
      title: 'Тренировка',
      date: '2026-04-20',
      startTime: '09:00',
      endTime: '10:00',
      durationMinutes: 60,
      level: 'all_levels' as const,
      capacity: 1,
      bookedCount: 0,
      price: 2000,
      room: 'Зал',
    },
  ],
};

describe('Фильтрация скрытых публикаций в каталогах (Step 22.5)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('GET /api/clubs — скрытый клуб не в ответе', async () => {
    const created = await createClubPublication(clubInput);

    // Скрываем клуб
    await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 3,
        reason: 'Нарушение правил',
      }),
    );

    const res = await getClubs(new NextRequest('http://localhost/api/clubs'));
    const json = await res.json();
    const ids = json.data.map((c: { id: number }) => c.id);

    expect(ids).not.toContain(created.club.id);
  });

  it('GET /api/clubs — published клуб в ответе', async () => {
    const created = await createClubPublication(clubInput);

    const res = await getClubs(new NextRequest('http://localhost/api/clubs'));
    const json = await res.json();
    const ids = json.data.map((c: { id: number }) => c.id);

    expect(ids).toContain(created.club.id);
  });

  it('GET /api/clubs — клуб с status: undefined в ответе (seed-данные)', async () => {
    // Seed-данные имеют клубы без явного status — они должны оставаться
    const res = await getClubs(new NextRequest('http://localhost/api/clubs'));
    const json = await res.json();

    expect(json.data.length).toBeGreaterThan(0);
  });

  it('GET /api/trainers — скрытый тренер не в ответе', async () => {
    const created = await createTrainerPublication(trainerInput);

    // Скрываем тренера
    await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'trainer',
        entityId: created.trainer.id,
        moderatorId: 3,
        reason: 'Нарушение правил',
      }),
    );

    const res = await getTrainers(new NextRequest('http://localhost/api/trainers'));
    const json = await res.json();
    const ids = json.data.map((t: { id: number }) => t.id);

    expect(ids).not.toContain(created.trainer.id);
  });

  it('GET /api/trainers — published тренер в ответе', async () => {
    const created = await createTrainerPublication(trainerInput);

    const res = await getTrainers(new NextRequest('http://localhost/api/trainers'));
    const json = await res.json();
    const ids = json.data.map((t: { id: number }) => t.id);

    expect(ids).toContain(created.trainer.id);
  });
});

describe('Booking protection для скрытых публикаций (Step 22.5)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('POST /api/bookings на schedule с hidden parent → 403', async () => {
    const created = await createClubPublication(clubInput);

    // Скрываем клуб
    await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 3,
        reason: 'Тест',
      }),
    );

    // Пытаемся записаться на слот скрытого клуба
    const res = await postBooking(
      makeRequest('http://localhost/api/bookings', {
        scheduleId: created.schedules[0].id,
        userId: 1, // athlete
      }),
    );

    expect(res.status).toBe(403);
    const json = await res.json();
    expect(json.error).toBe('Публикация скрыта, запись невозможна');
  });

  it('POST /api/bookings на schedule с published parent → 201 (regression)', async () => {
    const created = await createClubPublication(clubInput);

    const res = await postBooking(
      makeRequest('http://localhost/api/bookings', {
        scheduleId: created.schedules[0].id,
        userId: 1, // athlete
      }),
    );

    expect(res.status).toBe(201);
    const json = await res.json();
    expect(json.success).toBe(true);
  });
});
