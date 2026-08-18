// Эталонный снимок контрактов старого бэкенда.
//
// Снимается ПОКА старый бэкенд жив: после переключения фронта на новый сервер
// сравнить будет уже не с чем. Каждый вызов идёт на свежезасеянных данных,
// поэтому порядок вызовов на результат не влияет.
//
// Плавающие значения — метки времени и идентификаторы, зависящие от часов —
// заменяются постоянными строками: иначе снимок расходился бы сам с собой.
//
// Запуск с переменной SPORT_HUB_WRITE_CONTRACT_SNAPSHOT=1 перезаписывает файл
// снимка; без неё тест просто сверяет, что все маршруты отвечают.

import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createIsolatedDataDirectory, removeIsolatedDataDirectory } from './helpers/data-directory';
import { seedDefaultTrainerClubLink, seedTestData } from './helpers/seed-fixtures';

/** Путь снимка. Общий для старого и нового бэкенда. */
const SNAPSHOT_PATH = path.join(process.cwd(), '..', '..', 'contracts', 'contract-snapshot.json');

/** Поля, значение которых зависит от момента вызова. */
const VOLATILE_KEYS = new Set([
  'createdAt',
  'updatedAt',
  'at',
  'readAt',
  'approvedAt',
  'rejectedAt',
  'revokedAt',
  'hiddenAt',
  'completedAt',
  'quarantineLiftedAt',
  'notifiedQuarantineUntil',
  'until',
  'timestamp',
  'uptime',
]);

/** Замена плавающих значений постоянными, чтобы снимок был воспроизводим. */
function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = VOLATILE_KEYS.has(key) && item !== undefined ? '<время>' : normalize(item);
    }

    return result;
  }

  return value;
}

type Call = {
  /** Имя маршрута в снимке. */
  name: string;
  /** Что вызвать: модуль роута и метод. */
  load: () => Promise<Record<string, unknown>>;
  method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  url: string;
  params?: Record<string, string>;
  body?: unknown;
  /** Подготовка данных сверх общего набора. */
  prepare?: (dataDirectory: string) => Promise<void>;
};

const clubForm = {
  name: 'Снимок Клуб',
  city: 'Самара',
  address: 'Ленина 1',
  description: 'Описание клуба для снимка контрактов, достаточно длинное чтобы пройти проверку.',
  phone: '+7 (900) 000-00-00',
  email: '',
  priceFrom: '1000',
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2026-04-01',
      startTime: '10:00',
      endTime: '11:00',
      price: '500',
      capacity: '10',
      location: 'Зал',
      sportId: 3,
    },
  ],
  userId: 2,
};

const trainerForm = {
  firstName: 'Снимок',
  lastName: 'Тренер',
  city: 'Самара',
  address: 'Ленина 2',
  bio: 'Описание тренера для снимка контрактов, достаточно длинное чтобы пройти проверку.',
  experience: '5',
  sportIds: [3],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 000-00-00',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная',
  offeringDescription: 'Занятие один на один',
  offeringFormat: 'Индивидуальная',
  offeringPrice: '2000',
  offeringDuration: '60',
  offeringLocation: 'Зал',
  clubId: null,
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2026-04-02',
      startTime: '09:00',
      endTime: '10:00',
      price: '2000',
      capacity: '1',
      location: 'Зал',
      sportId: 3,
    },
  ],
  userId: 2,
};

const CALLS: Call[] = [
  {
    name: 'GET /api/sports',
    load: () => import('@/app/api/sports/route'),
    method: 'GET',
    url: 'http://localhost/api/sports',
  },
  {
    name: 'GET /api/cities',
    load: () => import('@/app/api/cities/route'),
    method: 'GET',
    url: 'http://localhost/api/cities',
  },
  {
    name: 'GET /api/clubs',
    load: () => import('@/app/api/clubs/route'),
    method: 'GET',
    url: 'http://localhost/api/clubs',
  },
  {
    name: 'GET /api/clubs?sportId=3',
    load: () => import('@/app/api/clubs/route'),
    method: 'GET',
    url: 'http://localhost/api/clubs?sportId=3',
  },
  {
    name: 'GET /api/clubs?sort=reliability',
    load: () => import('@/app/api/clubs/route'),
    method: 'GET',
    url: 'http://localhost/api/clubs?sort=reliability&dir=desc',
  },
  {
    name: 'POST /api/clubs',
    load: () => import('@/app/api/clubs/route'),
    method: 'POST',
    url: 'http://localhost/api/clubs',
    body: clubForm,
  },
  {
    name: 'POST /api/clubs (ошибка)',
    load: () => import('@/app/api/clubs/route'),
    method: 'POST',
    url: 'http://localhost/api/clubs',
    body: { name: 'Плохо' },
  },
  {
    name: 'GET /api/clubs/[id]',
    load: () => import('@/app/api/clubs/[id]/route'),
    method: 'GET',
    url: 'http://localhost/api/clubs/1',
    params: { id: '1' },
  },
  {
    name: 'GET /api/clubs/[id] (нет)',
    load: () => import('@/app/api/clubs/[id]/route'),
    method: 'GET',
    url: 'http://localhost/api/clubs/999',
    params: { id: '999' },
  },
  {
    name: 'PATCH /api/clubs/[id]',
    load: () => import('@/app/api/clubs/[id]/route'),
    method: 'PATCH',
    url: 'http://localhost/api/clubs/1',
    params: { id: '1' },
    body: { ...clubForm, scheduleSlots: [{ ...clubForm.scheduleSlots[0], id: 1 }] },
  },
  {
    name: 'PATCH /api/clubs/[id] (чужой)',
    load: () => import('@/app/api/clubs/[id]/route'),
    method: 'PATCH',
    url: 'http://localhost/api/clubs/1',
    params: { id: '1' },
    body: { ...clubForm, userId: 1 },
  },
  {
    name: 'DELETE /api/clubs/[id]',
    load: () => import('@/app/api/clubs/[id]/route'),
    method: 'DELETE',
    url: 'http://localhost/api/clubs/3',
    params: { id: '3' },
  },
  {
    name: 'GET /api/trainers',
    load: () => import('@/app/api/trainers/route'),
    method: 'GET',
    url: 'http://localhost/api/trainers',
  },
  {
    name: 'GET /api/trainers?clubId=1',
    load: () => import('@/app/api/trainers/route'),
    method: 'GET',
    url: 'http://localhost/api/trainers?clubId=1',
    prepare: seedDefaultTrainerClubLink,
  },
  {
    name: 'POST /api/trainers',
    load: () => import('@/app/api/trainers/route'),
    method: 'POST',
    url: 'http://localhost/api/trainers',
    body: trainerForm,
  },
  {
    name: 'GET /api/trainers/[id]',
    load: () => import('@/app/api/trainers/[id]/route'),
    method: 'GET',
    url: 'http://localhost/api/trainers/1',
    params: { id: '1' },
  },
  {
    name: 'GET /api/trainers/[id] (нет)',
    load: () => import('@/app/api/trainers/[id]/route'),
    method: 'GET',
    url: 'http://localhost/api/trainers/999',
    params: { id: '999' },
  },
  {
    name: 'PATCH /api/trainers/[id]',
    load: () => import('@/app/api/trainers/[id]/route'),
    method: 'PATCH',
    url: 'http://localhost/api/trainers/1',
    params: { id: '1' },
    body: { ...trainerForm, scheduleSlots: [{ ...trainerForm.scheduleSlots[0], id: 1001 }] },
  },
  {
    name: 'DELETE /api/trainers/[id]',
    load: () => import('@/app/api/trainers/[id]/route'),
    method: 'DELETE',
    url: 'http://localhost/api/trainers/5',
    params: { id: '5' },
  },
  {
    name: 'GET /api/schedule',
    load: () => import('@/app/api/schedule/route'),
    method: 'GET',
    url: 'http://localhost/api/schedule',
  },
  {
    name: 'GET /api/schedule?ownerType=trainer',
    load: () => import('@/app/api/schedule/route'),
    method: 'GET',
    url: 'http://localhost/api/schedule?ownerType=trainer',
  },
  {
    name: 'GET /api/schedule (ошибка)',
    load: () => import('@/app/api/schedule/route'),
    method: 'GET',
    url: 'http://localhost/api/schedule?ownerType=owner',
  },
  {
    name: 'GET /api/reviews',
    load: () => import('@/app/api/reviews/route'),
    method: 'GET',
    url: 'http://localhost/api/reviews',
  },
  {
    name: 'GET /api/reviews?clubId=1',
    load: () => import('@/app/api/reviews/route'),
    method: 'GET',
    url: 'http://localhost/api/reviews?clubId=1',
  },
  {
    name: 'POST /api/reviews',
    load: () => import('@/app/api/reviews/route'),
    method: 'POST',
    url: 'http://localhost/api/reviews',
    body: { userId: 1, trainerId: 1, rating: 5, text: 'Снимок' },
  },
  {
    name: 'POST /api/reviews (без адресата)',
    load: () => import('@/app/api/reviews/route'),
    method: 'POST',
    url: 'http://localhost/api/reviews',
    body: { userId: 1, rating: 5, text: 'Снимок' },
  },
  {
    name: 'GET /api/bookings',
    load: () => import('@/app/api/bookings/route'),
    method: 'GET',
    url: 'http://localhost/api/bookings?userId=1',
  },
  {
    name: 'POST /api/bookings',
    load: () => import('@/app/api/bookings/route'),
    method: 'POST',
    url: 'http://localhost/api/bookings',
    body: { scheduleId: 1001, userId: 1 },
  },
  {
    name: 'POST /api/bookings (не атлет)',
    load: () => import('@/app/api/bookings/route'),
    method: 'POST',
    url: 'http://localhost/api/bookings',
    body: { scheduleId: 1001, userId: 2 },
  },
  {
    name: 'DELETE /api/bookings/[id]',
    load: () => import('@/app/api/bookings/[id]/route'),
    method: 'DELETE',
    url: 'http://localhost/api/bookings/3',
    params: { id: '3' },
    body: { userId: 1 },
  },
  {
    name: 'POST /api/bookings/[id]/confirm',
    load: () => import('@/app/api/bookings/[id]/confirm/route'),
    method: 'POST',
    url: 'http://localhost/api/bookings/3/confirm',
    params: { id: '3' },
    body: { userId: 2 },
  },
  {
    name: 'POST /api/bookings/[id]/reject',
    load: () => import('@/app/api/bookings/[id]/reject/route'),
    method: 'POST',
    url: 'http://localhost/api/bookings/3/reject',
    params: { id: '3' },
    body: { userId: 2, reason: 'Нет мест' },
  },
  {
    name: 'POST /api/bookings/[id]/cancel',
    load: () => import('@/app/api/bookings/[id]/cancel/route'),
    method: 'POST',
    url: 'http://localhost/api/bookings/1/cancel',
    params: { id: '1' },
    body: { userId: 1 },
  },
  {
    name: 'GET /api/trainer-club-links',
    load: () => import('@/app/api/trainer-club-links/route'),
    method: 'GET',
    url: 'http://localhost/api/trainer-club-links',
    prepare: seedDefaultTrainerClubLink,
  },
  {
    name: 'POST /api/trainer-club-links',
    load: () => import('@/app/api/trainer-club-links/route'),
    method: 'POST',
    url: 'http://localhost/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1, userId: 2 },
  },
  {
    name: 'POST /api/trainer-club-links (нет прав)',
    load: () => import('@/app/api/trainer-club-links/route'),
    method: 'POST',
    url: 'http://localhost/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1, userId: 1 },
  },
  {
    name: 'GET /api/notifications',
    load: () => import('@/app/api/notifications/route'),
    method: 'GET',
    url: 'http://localhost/api/notifications?userId=1',
  },
  {
    name: 'GET /api/notifications/unread-count',
    load: () => import('@/app/api/notifications/unread-count/route'),
    method: 'GET',
    url: 'http://localhost/api/notifications/unread-count?userId=1',
  },
  {
    name: 'POST /api/notifications/read-all',
    load: () => import('@/app/api/notifications/read-all/route'),
    method: 'POST',
    url: 'http://localhost/api/notifications/read-all',
    body: { userId: 1 },
  },
  {
    name: 'GET /api/provider-client-notes',
    load: () => import('@/app/api/provider-client-notes/route'),
    method: 'GET',
    url: 'http://localhost/api/provider-client-notes?providerUserId=2',
  },
  {
    name: 'POST /api/provider-client-notes',
    load: () => import('@/app/api/provider-client-notes/route'),
    method: 'POST',
    url: 'http://localhost/api/provider-client-notes',
    body: { providerUserId: 2, clientUserId: 1, note: 'Снимок' },
  },
  {
    name: 'GET /api/logs',
    load: () => import('@/app/api/logs/route'),
    method: 'GET',
    url: 'http://localhost/api/logs',
  },
  {
    name: 'POST /api/logs',
    load: () => import('@/app/api/logs/route'),
    method: 'POST',
    url: 'http://localhost/api/logs',
    body: {
      action: 'admin_login',
      actorId: 3,
      actorRole: 'admin',
      entityType: 'user',
      entityId: 3,
    },
  },
  {
    name: 'GET /api/publications',
    load: () => import('@/app/api/publications/route'),
    method: 'GET',
    url: 'http://localhost/api/publications',
  },
  {
    name: 'POST /api/moderation',
    load: () => import('@/app/api/moderation/route'),
    method: 'POST',
    url: 'http://localhost/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, moderatorId: 3, reason: 'Снимок' },
  },
  {
    name: 'POST /api/moderation (не админ)',
    load: () => import('@/app/api/moderation/route'),
    method: 'POST',
    url: 'http://localhost/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, moderatorId: 2, reason: 'Снимок' },
  },
  {
    name: 'GET /api/analytics',
    load: () => import('@/app/api/analytics/route'),
    method: 'GET',
    url: 'http://localhost/api/analytics',
  },
  {
    name: 'POST /api/auth/login',
    load: () => import('@/app/api/auth/login/route'),
    method: 'POST',
    url: 'http://localhost/api/auth/login',
    body: { email: 'alexey@example.com', accountType: 'athlete' },
  },
  {
    name: 'POST /api/auth/login (нет)',
    load: () => import('@/app/api/auth/login/route'),
    method: 'POST',
    url: 'http://localhost/api/auth/login',
    body: { email: 'nobody@example.com', accountType: 'athlete' },
  },
  {
    name: 'POST /api/auth/register',
    load: () => import('@/app/api/auth/register/route'),
    method: 'POST',
    url: 'http://localhost/api/auth/register',
    body: {
      name: 'Новый',
      email: 'snapshot@example.com',
      password: 'secret1',
      accountType: 'athlete',
    },
  },
  {
    name: 'PATCH /api/users/[id]',
    load: () => import('@/app/api/users/[id]/route'),
    method: 'PATCH',
    url: 'http://localhost/api/users/1',
    params: { id: '1' },
    body: { userId: 1, phone: '+7 (900) 111-22-33' },
  },
  {
    name: 'GET /api/users/[id]/notification-preferences',
    load: () => import('@/app/api/users/[id]/notification-preferences/route'),
    method: 'GET',
    url: 'http://localhost/api/users/1/notification-preferences',
    params: { id: '1' },
  },
  {
    name: 'PATCH /api/users/[id]/notification-preferences',
    load: () => import('@/app/api/users/[id]/notification-preferences/route'),
    method: 'PATCH',
    url: 'http://localhost/api/users/1/notification-preferences',
    params: { id: '1' },
    body: { userId: 1, preferences: { booking_rejected: false } },
  },
  {
    name: 'DELETE /api/admin/bookings/[id]',
    load: () => import('@/app/api/admin/bookings/[id]/route'),
    method: 'DELETE',
    url: 'http://localhost/api/admin/bookings/1',
    params: { id: '1' },
    body: { adminUserId: 3 },
  },
  {
    name: 'POST /api/admin/users/[id]/lift-quarantine',
    load: () => import('@/app/api/admin/users/[id]/lift-quarantine/route'),
    method: 'POST',
    url: 'http://localhost/api/admin/users/1/lift-quarantine',
    params: { id: '1' },
    body: { adminUserId: 3 },
  },
  {
    name: 'POST /api/admin/users/[id]/password',
    load: () => import('@/app/api/admin/users/[id]/password/route'),
    method: 'POST',
    url: 'http://localhost/api/admin/users/1/password',
    params: { id: '1' },
    body: { adminUserId: 3, newPassword: 'fresh-password-99' },
  },
  {
    name: 'POST /api/admin/users/[id]/recompute-reliability',
    load: () => import('@/app/api/admin/users/[id]/recompute-reliability/route'),
    method: 'POST',
    url: 'http://localhost/api/admin/users/1/recompute-reliability',
    params: { id: '1' },
    body: { adminUserId: 3 },
  },
];

describe('Снимок контрактов старого бэкенда', () => {
  let dataDirectory: string;
  const snapshot: Record<string, { status: number; body: unknown }> = {};

  beforeAll(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  beforeEach(async () => {
    // Каждый вызов идёт на одних и тех же данных — иначе снимок зависел бы
    // от порядка выполнения.
    await seedTestData(dataDirectory);
  });

  afterAll(async () => {
    if (process.env.SPORT_HUB_WRITE_CONTRACT_SNAPSHOT === '1') {
      await writeFile(SNAPSHOT_PATH, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
    } else {
      // Без записи — сверяем с уже снятым эталоном, если он есть.
      const existing = await readFile(SNAPSHOT_PATH, 'utf8').catch(() => null);

      if (existing) {
        expect(snapshot).toEqual(JSON.parse(existing));
      }
    }

    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  for (const call of CALLS) {
    it(`${call.name} отвечает и попадает в снимок`, async () => {
      if (call.prepare) {
        await call.prepare(dataDirectory);
      }

      const routeModule = await call.load();
      const handler = routeModule[call.method] as (
        request: Request,
        context?: { params: Promise<Record<string, string>> },
      ) => Promise<Response>;

      expect(handler, `${call.name}: обработчик не найден`).toBeTypeOf('function');

      // Часть маршрутов читает параметры через `nextUrl`, которого у обычного
      // Request нет: без этого они падали бы с ошибкой сервера, и снимок
      // закрепил бы отказ вместо настоящего ответа.
      const request = new NextRequest(call.url, {
        method: call.method,
        ...(call.body === undefined
          ? {}
          : { body: JSON.stringify(call.body), headers: { 'content-type': 'application/json' } }),
      });

      const response = await handler(
        request,
        call.params ? { params: Promise.resolve(call.params) } : undefined,
      );
      const body = await response.json();

      snapshot[call.name] = { status: response.status, body: normalize(body) };

      expect(response.status).toBeGreaterThanOrEqual(200);
    });
  }
});
