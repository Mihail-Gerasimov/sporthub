// Тесты API модерации и публикаций (Steps 22.2-22.3)
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { createClubPublication, createTrainerPublication } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

import { GET as getPublications } from '@/app/api/publications/route';
import { POST as postModeration } from '@/app/api/moderation/route';

/* --- Хелпер для запросов --- */

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
    name: 'Клуб Модерация',
    slug: 'mod-club',
    description: 'Описание.',
    shortDescription: 'Клуб.',
    city: 'Самара',
    address: 'ул. Тестовая, 1',
    phone: '+7 (846) 000-00-00',
    coordinates: { lat: 0, lng: 0 },
    sportIds: [1],
    imageUrls: [],
    amenities: [],
    tags: [],
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
    coordinates: { lat: 0, lng: 0 },
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
    name: 'Тренер Модерация',
    slug: 'mod-trainer',
    bio: 'Тренер.',
    avatarUrl: '',
    experienceYears: 5,
    specialties: ['Бокс'],
    rating: 0,
    reviewCount: 0,
    priceFrom: 2000,
    sportIds: [2],
    city: 'Москва',
    address: 'ул. Спортивная, 10',
    coordinates: { lat: 0, lng: 0 },
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
    coordinates: { lat: 0, lng: 0 },
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

describe('POST /api/moderation', () => {
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

  it('hide клуба — status hidden, причина установлена', async () => {
    const created = await createClubPublication(clubInput);
    const res = await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 3,
        reason: 'Нарушение правил',
      }),
    );
    const json = await res.json();
    expect(res.status).toBe(200);
    expect(json.success).toBe(true);
    expect(json.data.status).toBe('hidden');
    expect(json.data.hideReason).toBe('Нарушение правил');
  });

  it('unhide клуба — status published', async () => {
    const created = await createClubPublication(clubInput);
    await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 3,
        reason: 'Тест',
      }),
    );
    const res = await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'unhide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 3,
      }),
    );
    const json = await res.json();
    expect(json.data.status).toBe('published');
    expect(json.data.hideReason).toBeUndefined();
  });

  it('не-админ → 403', async () => {
    const created = await createClubPublication(clubInput);
    const res = await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 1, // athlete, не admin
        reason: 'Тест',
      }),
    );
    expect(res.status).toBe(403);
  });

  it('hide без причины → 400', async () => {
    const created = await createClubPublication(clubInput);
    const res = await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: created.club.id,
        moderatorId: 3,
      }),
    );
    expect(res.status).toBe(400);
  });

  it('hide несуществующей сущности → 404', async () => {
    const res = await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: 99999,
        moderatorId: 3,
        reason: 'Тест',
      }),
    );
    expect(res.status).toBe(404);
  });
});

describe('GET /api/publications', () => {
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

  it('возвращает объединённый список клубов и тренеров', async () => {
    // До создания — запоминаем начальное кол-во (seed-данные)
    const resBefore = await getPublications(new Request('http://localhost/api/publications'));
    const jsonBefore = await resBefore.json();
    const countBefore = jsonBefore.total;

    await createClubPublication(clubInput);
    await createTrainerPublication(trainerInput);

    const res = await getPublications(
      new Request('http://localhost/api/publications'),
    );
    const json = await res.json();
    expect(json.success).toBe(true);
    expect(json.total).toBe(countBefore + 2);
    const types = new Set(json.data.map((d: { type: string }) => d.type));
    expect(types.has('club')).toBe(true);
    expect(types.has('trainer')).toBe(true);
  });

  it('фильтр status=hidden → только скрытые', async () => {
    const club = await createClubPublication(clubInput);
    await createTrainerPublication(trainerInput);

    // Скрываем клуб
    await postModeration(
      makeRequest('http://localhost/api/moderation', {
        action: 'hide',
        entityType: 'club',
        entityId: club.club.id,
        moderatorId: 3,
        reason: 'Тест',
      }),
    );

    const res = await getPublications(
      new Request('http://localhost/api/publications?status=hidden'),
    );
    const json = await res.json();
    expect(json.data.length).toBe(1);
    expect(json.data[0].status).toBe('hidden');
  });

  it('фильтр type=club → только клубы', async () => {
    await createClubPublication(clubInput);
    await createTrainerPublication(trainerInput);

    const res = await getPublications(
      new Request('http://localhost/api/publications?type=club'),
    );
    const json = await res.json();
    expect(json.data.every((d: { type: string }) => d.type === 'club')).toBe(true);
  });

  it('поиск по названию', async () => {
    await createClubPublication(clubInput);
    await createTrainerPublication(trainerInput);

    const res = await getPublications(
      new Request('http://localhost/api/publications?search=модерация'),
    );
    const json = await res.json();
    expect(json.data.length).toBe(2); // оба содержат "Модерация"
  });

  it('пагинация offset/limit', async () => {
    await createClubPublication(clubInput);
    await createTrainerPublication(trainerInput);

    const res = await getPublications(
      new Request('http://localhost/api/publications?offset=0&limit=1'),
    );
    const json = await res.json();
    expect(json.data.length).toBe(1);
    expect(json.total).toBeGreaterThanOrEqual(2);
    expect(json.limit).toBe(1);
  });
});
