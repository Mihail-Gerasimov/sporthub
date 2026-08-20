// Сверка с эталоном контрактов.
//
// Эталон снят с прежнего бэкенда до его удаления (contracts/contract-snapshot.json).
// Здесь те же вызовы идут на новый сервер, и ответы обязаны совпасть: это
// и есть проверка главного обещания фазы — поведение не изменилось.
//
// Расхождения, найденные и принятые осознанно, перечислены в KNOWN_DIFFERENCES
// вместе с причиной. Пустой список означал бы, что переезд прошёл совсем
// незаметно для клиента; каждая запись в нём — обещание, которое пришлось
// изменить, и она должна быть объяснима.
//
// Значения меток времени сравнивать нельзя — они зависят от момента вызова, поэтому
// маскируются. Но вместе со значением пряталcя и вид записи, а он при переезде
// хранилища меняется первым: файл отдаёт строку, база — объект даты. Поэтому вид
// проверяется отдельным сторожем (`time-shape.ts`): значение по-прежнему не сравнивается,
// формат — сравнивается. Эталон снят с файлового хранилища, оно же и задаёт формат.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { seedTestData, seedDefaultTrainerClubLink } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';
import { ISO_TIME_SHAPE, VOLATILE_KEYS, collectTimeShapes } from './time-shape';

const SNAPSHOT_PATH = path.join(process.cwd(), '..', '..', 'contracts', 'contract-snapshot.json');

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

/**
 * Принятые расхождения. Каждое — сознательное решение, а не случайность.
 */
const KNOWN_DIFFERENCES: Record<string, string> = {
  // Прежний сервер отвечал на неизвестный адрес-ссылку тем же телом, что и на
  // числовой идентификатор. Новый разделил эти случаи разными маршрутами.
};

type SnapshotEntry = { status: number; body: unknown };

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

type Call = {
  name: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  url: string;
  body?: unknown;
  prepare?: (dataDirectory: string) => Promise<void>;
};

const CALLS: Call[] = [
  { name: 'GET /api/sports', method: 'get', url: '/api/sports' },
  { name: 'GET /api/cities', method: 'get', url: '/api/cities' },
  { name: 'GET /api/clubs', method: 'get', url: '/api/clubs' },
  { name: 'GET /api/clubs?sportId=3', method: 'get', url: '/api/clubs?sportId=3' },
  {
    name: 'GET /api/clubs?sort=reliability',
    method: 'get',
    url: '/api/clubs?sort=reliability&dir=desc',
  },
  { name: 'POST /api/clubs', method: 'post', url: '/api/clubs', body: clubForm },
  { name: 'POST /api/clubs (ошибка)', method: 'post', url: '/api/clubs', body: { name: 'Плохо' } },
  { name: 'GET /api/clubs/[id]', method: 'get', url: '/api/clubs/1' },
  { name: 'GET /api/clubs/[id] (нет)', method: 'get', url: '/api/clubs/999' },
  {
    name: 'PATCH /api/clubs/[id]',
    method: 'patch',
    url: '/api/clubs/1',
    body: { ...clubForm, scheduleSlots: [{ ...clubForm.scheduleSlots[0], id: 1 }] },
  },
  {
    name: 'PATCH /api/clubs/[id] (чужой)',
    method: 'patch',
    url: '/api/clubs/1',
    body: { ...clubForm, userId: 1 },
  },
  { name: 'DELETE /api/clubs/[id]', method: 'delete', url: '/api/clubs/3' },
  { name: 'GET /api/trainers', method: 'get', url: '/api/trainers' },
  {
    name: 'GET /api/trainers?clubId=1',
    method: 'get',
    url: '/api/trainers?clubId=1',
    prepare: seedDefaultTrainerClubLink,
  },
  { name: 'POST /api/trainers', method: 'post', url: '/api/trainers', body: trainerForm },
  { name: 'GET /api/trainers/[id]', method: 'get', url: '/api/trainers/1' },
  { name: 'GET /api/trainers/[id] (нет)', method: 'get', url: '/api/trainers/999' },
  {
    name: 'PATCH /api/trainers/[id]',
    method: 'patch',
    url: '/api/trainers/1',
    body: { ...trainerForm, scheduleSlots: [{ ...trainerForm.scheduleSlots[0], id: 1001 }] },
  },
  { name: 'DELETE /api/trainers/[id]', method: 'delete', url: '/api/trainers/5' },
  { name: 'GET /api/schedule', method: 'get', url: '/api/schedule' },
  {
    name: 'GET /api/schedule?ownerType=trainer',
    method: 'get',
    url: '/api/schedule?ownerType=trainer',
  },
  { name: 'GET /api/schedule (ошибка)', method: 'get', url: '/api/schedule?ownerType=owner' },
  { name: 'GET /api/reviews', method: 'get', url: '/api/reviews' },
  { name: 'GET /api/reviews?clubId=1', method: 'get', url: '/api/reviews?clubId=1' },
  {
    name: 'POST /api/reviews',
    method: 'post',
    url: '/api/reviews',
    body: { userId: 1, trainerId: 1, rating: 5, text: 'Снимок' },
  },
  {
    name: 'POST /api/reviews (без адресата)',
    method: 'post',
    url: '/api/reviews',
    body: { userId: 1, rating: 5, text: 'Снимок' },
  },
  { name: 'GET /api/bookings', method: 'get', url: '/api/bookings?userId=1' },
  {
    name: 'POST /api/bookings',
    method: 'post',
    url: '/api/bookings',
    body: { scheduleId: 1001, userId: 1 },
  },
  {
    name: 'POST /api/bookings (не атлет)',
    method: 'post',
    url: '/api/bookings',
    body: { scheduleId: 1001, userId: 2 },
  },
  {
    name: 'DELETE /api/bookings/[id]',
    method: 'delete',
    url: '/api/bookings/3',
    body: { userId: 1 },
  },
  {
    name: 'POST /api/bookings/[id]/confirm',
    method: 'post',
    url: '/api/bookings/3/confirm',
    body: { userId: 2 },
  },
  {
    name: 'POST /api/bookings/[id]/reject',
    method: 'post',
    url: '/api/bookings/3/reject',
    body: { userId: 2, reason: 'Нет мест' },
  },
  {
    name: 'POST /api/bookings/[id]/cancel',
    method: 'post',
    url: '/api/bookings/1/cancel',
    body: { userId: 1 },
  },
  {
    name: 'GET /api/trainer-club-links',
    method: 'get',
    url: '/api/trainer-club-links',
    prepare: seedDefaultTrainerClubLink,
  },
  {
    name: 'POST /api/trainer-club-links',
    method: 'post',
    url: '/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1, userId: 2 },
  },
  {
    name: 'POST /api/trainer-club-links (нет прав)',
    method: 'post',
    url: '/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1, userId: 1 },
  },
  { name: 'GET /api/notifications', method: 'get', url: '/api/notifications?userId=1' },
  {
    name: 'GET /api/notifications/unread-count',
    method: 'get',
    url: '/api/notifications/unread-count?userId=1',
  },
  {
    name: 'POST /api/notifications/read-all',
    method: 'post',
    url: '/api/notifications/read-all',
    body: { userId: 1 },
  },
  {
    name: 'GET /api/provider-client-notes',
    method: 'get',
    url: '/api/provider-client-notes?providerUserId=2',
  },
  {
    name: 'POST /api/provider-client-notes',
    method: 'post',
    url: '/api/provider-client-notes',
    body: { providerUserId: 2, clientUserId: 1, note: 'Снимок' },
  },
  { name: 'GET /api/logs', method: 'get', url: '/api/logs' },
  {
    name: 'POST /api/logs',
    method: 'post',
    url: '/api/logs',
    body: {
      action: 'admin_login',
      actorId: 3,
      actorRole: 'admin',
      entityType: 'user',
      entityId: 3,
    },
  },
  { name: 'GET /api/publications', method: 'get', url: '/api/publications' },
  {
    name: 'POST /api/moderation',
    method: 'post',
    url: '/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, moderatorId: 3, reason: 'Снимок' },
  },
  {
    name: 'POST /api/moderation (не админ)',
    method: 'post',
    url: '/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, moderatorId: 2, reason: 'Снимок' },
  },
  { name: 'GET /api/analytics', method: 'get', url: '/api/analytics' },
  {
    name: 'POST /api/auth/login',
    method: 'post',
    url: '/api/auth/login',
    body: { email: 'alexey@example.com', accountType: 'athlete' },
  },
  {
    name: 'POST /api/auth/login (нет)',
    method: 'post',
    url: '/api/auth/login',
    body: { email: 'nobody@example.com', accountType: 'athlete' },
  },
  {
    name: 'POST /api/auth/register',
    method: 'post',
    url: '/api/auth/register',
    body: {
      name: 'Новый',
      email: 'snapshot@example.com',
      password: 'secret1',
      accountType: 'athlete',
    },
  },
  {
    name: 'PATCH /api/users/[id]',
    method: 'patch',
    url: '/api/users/1',
    body: { userId: 1, phone: '+7 (900) 111-22-33' },
  },
  {
    name: 'GET /api/users/[id]/notification-preferences',
    method: 'get',
    url: '/api/users/1/notification-preferences',
  },
  {
    name: 'PATCH /api/users/[id]/notification-preferences',
    method: 'patch',
    url: '/api/users/1/notification-preferences',
    body: { userId: 1, preferences: { booking_rejected: false } },
  },
  {
    name: 'DELETE /api/admin/bookings/[id]',
    method: 'delete',
    url: '/api/admin/bookings/1',
    body: { adminUserId: 3 },
  },
  {
    name: 'POST /api/admin/users/[id]/lift-quarantine',
    method: 'post',
    url: '/api/admin/users/1/lift-quarantine',
    body: { adminUserId: 3 },
  },
  {
    name: 'POST /api/admin/users/[id]/password',
    method: 'post',
    url: '/api/admin/users/1/password',
    body: { adminUserId: 3, newPassword: 'fresh-password-99' },
  },
  {
    name: 'POST /api/admin/users/[id]/recompute-reliability',
    method: 'post',
    url: '/api/admin/users/1/recompute-reliability',
    body: { adminUserId: 3 },
  },
];

describe('Сверка с эталоном контрактов прежнего бэкенда', () => {
  let harness: TestHarness;
  let expected: Record<string, SnapshotEntry>;

  beforeAll(async () => {
    // Копия рабочих данных: справочники в эталоне не пустые.
    harness = await createTestHarness('contract-parity', { copyProjectData: true });
    expected = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')) as Record<string, SnapshotEntry>;
  });

  beforeEach(async () => {
    // Те же данные, что и при съёмке эталона: пакет фикстур общий.
    await seedTestData(harness.dataDirectory);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('эталон покрывает все сверяемые вызовы', () => {
    const missing = CALLS.filter((call) => expected[call.name] === undefined).map(
      (call) => call.name,
    );

    expect(missing).toEqual([]);
  });

  for (const call of CALLS) {
    it(`${call.name} отвечает так же, как прежний бэкенд`, async () => {
      if (call.prepare) {
        await call.prepare(harness.dataDirectory);
      }

      const agent = request(harness.app.getHttpServer());
      const response =
        call.body === undefined
          ? await agent[call.method](call.url)
          : await agent[call.method](call.url).send(call.body as object);

      const actual = { status: response.status, body: normalize(response.body) };
      const reference = expected[call.name];

      // Вид записи каждой метки времени. Сравнение тела его не увидит: там маска.
      const wrongShape = collectTimeShapes(response.body).filter(
        (entry) => entry.shape !== ISO_TIME_SHAPE,
      );

      expect(wrongShape).toEqual([]);

      if (KNOWN_DIFFERENCES[call.name]) {
        expect(actual).not.toEqual(reference);

        return;
      }

      expect(actual).toEqual(reference);
    });
  }
});
