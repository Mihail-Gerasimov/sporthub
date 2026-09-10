// Сторож: ни один маршрут не отдаёт наружу ни пароль, ни его хеш.
//
// Phase 33 Step 33.9. Поле пользователя переименовано `password` → `passwordHash`,
// и места, которые вырезали пароль из ответа, после переименования вырезали бы
// несуществующее поле — хеш утёк бы молча, без единой красной проверки.
// Поэтому проверка не привязана к конкретному контроллеру: список маршрутов
// берётся из самого приложения, ответы обходятся рекурсивно, и красным
// становится любой ключ, похожий на пароль, и любое значение, похожее
// на argon2-хеш.
//
// Новый маршрут попадает под сторожа автоматически: он появится в таблице
// маршрутов и будет вызван — забыть добавить его сюда невозможно.

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';

import { collectRoutes, type RouteRecord } from './app-routes';

/** Ключ, похожий на пароль. Регистр не важен: сравнение идёт по нижнему. */
const SUSPICIOUS_KEY = /(password|passwd|pwd|secret|credential)/i;

/** Значение, похожее на argon2-хеш, — как бы ключ ни назывался. */
const HASH_VALUE_PREFIX = '$argon2';

/** Найденные утечки: путь до ключа и что именно не понравилось. */
type Leak = { path: string; reason: string };

/**
 * Рекурсивный обход ответа. Проверяются и имена ключей, и значения: ключ мог
 * бы называться безобидно, а нести хеш, и наоборот — пустой `password: null`
 * это всё равно поле, которого в ответе быть не должно.
 */
function findLeaks(value: unknown, path = 'body'): Leak[] {
  if (Array.isArray(value)) {
    return value.flatMap((item, index) => findLeaks(item, `${path}[${index}]`));
  }

  if (typeof value === 'string') {
    return value.startsWith(HASH_VALUE_PREFIX) ? [{ path, reason: 'значение — argon2-хеш' }] : [];
  }

  if (value && typeof value === 'object') {
    const leaks: Leak[] = [];

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      const childPath = `${path}.${key}`;

      if (SUSPICIOUS_KEY.test(key)) {
        leaks.push({ path: childPath, reason: `ключ похож на пароль ("${key}")` });
      }

      leaks.push(...findLeaks(item, childPath));
    }

    return leaks;
  }

  return [];
}

/**
 * Чем подставить параметры адреса и что дослать запросом, чтобы вызов дошёл
 * до данных, а не отбился на разборе. Там, где осмысленного тела нет, ответом
 * будет ошибка — её тело сторож проверяет так же придирчиво.
 */
const REQUEST_BY_ROUTE: Record<string, { url: string; body?: unknown }> = {
  'get /api/bookings': { url: '/api/bookings?userId=1' },
  'get /api/bookings/:id': { url: '/api/bookings/1?userId=1' },
  'delete /api/bookings/:id': { url: '/api/bookings/1', body: { userId: 1 } },
  'post /api/bookings': { url: '/api/bookings', body: { scheduleId: 1001, userId: 1 } },
  'post /api/bookings/:id/cancel': { url: '/api/bookings/1/cancel', body: { userId: 1 } },
  'post /api/bookings/:id/confirm': { url: '/api/bookings/3/confirm', body: { userId: 2 } },
  'post /api/bookings/:id/reject': {
    url: '/api/bookings/3/reject',
    body: { reason: 'Сторож' },
  },
  'post /api/bookings/:id/check-in': {
    url: '/api/bookings/1/check-in',
    body: { outcome: 'completed' },
  },
  'get /api/clubs/by-slug/:slug': { url: '/api/clubs/by-slug/volna-aquatic-club' },
  'get /api/trainers/by-slug/:slug': { url: '/api/trainers/by-slug/anna-lebedeva' },
  'get /api/schedule/:id/context': { url: '/api/schedule/1001/context' },
  'get /api/notifications': { url: '/api/notifications?userId=1' },
  'get /api/notifications/unread-count': { url: '/api/notifications/unread-count?userId=1' },
  'post /api/notifications/read-all': { url: '/api/notifications/read-all', body: { userId: 1 } },
  'post /api/notifications/:id/read': { url: '/api/notifications/1/read', body: { userId: 1 } },
  'delete /api/notifications': { url: '/api/notifications', body: { userId: 1 } },
  'get /api/provider-client-notes': { url: '/api/provider-client-notes?providerUserId=2' },
  'post /api/provider-client-notes': {
    url: '/api/provider-client-notes',
    body: { clientUserId: 1, note: 'Сторож' },
  },
  'patch /api/provider-client-notes/:id': {
    url: '/api/provider-client-notes/1',
    body: { note: 'Сторож' },
  },
  'delete /api/provider-client-notes/:id': {
    url: '/api/provider-client-notes/1',
    body: { providerUserId: 2 },
  },
  // Обход идёт под администратором (см. SWEEP_AS_USER_ID), а править учётную
  // запись можно только СВОЮ — поэтому и адрес его собственный.
  'patch /api/users/:id': { url: '/api/users/3', body: { phone: '+7 (900) 111-22-33' } },
  'patch /api/users/:id/notification-preferences': {
    url: '/api/users/3/notification-preferences',
    body: { preferences: { booking_rejected: false } },
  },
  'post /api/auth/login': {
    url: '/api/auth/login',
    body: { email: 'alexey@sporthub.local', password: 'sporthub123' },
  },
  'post /api/auth/register': {
    url: '/api/auth/register',
    body: {
      name: 'Сторож',
      email: 'guard@sporthub.local',
      password: 'guard-secret-1',
    },
  },
  'post /api/reviews': {
    url: '/api/reviews',
    body: { trainerId: 1, rating: 5, text: 'Сторож' },
  },
  'post /api/trainer-club-links': {
    url: '/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1, userId: 2 },
  },
  'post /api/trainer-club-links/:id/approve': {
    url: '/api/trainer-club-links/1/approve',
    body: { userId: 2 },
  },
  'post /api/trainer-club-links/:id/reject': {
    url: '/api/trainer-club-links/1/reject',
    body: { userId: 2 },
  },
  'post /api/trainer-club-links/:id/revoke': {
    url: '/api/trainer-club-links/1/revoke',
    body: { userId: 2 },
  },
  'post /api/logs': {
    url: '/api/logs',
    body: {
      action: 'admin_login',
      entityType: 'user',
      entityId: 3,
    },
  },
  'post /api/moderation': {
    url: '/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, moderatorId: 3, reason: 'Сторож' },
  },
  'delete /api/admin/bookings/:id': { url: '/api/admin/bookings/1', body: { adminUserId: 3 } },
  'post /api/admin/trainer-club-links/:id/force-revoke': {
    url: '/api/admin/trainer-club-links/1/force-revoke',
    body: { adminUserId: 3 },
  },
  'post /api/admin/users/:id/password': {
    url: '/api/admin/users/1/password',
    body: { newPassword: 'guard-password-77' },
  },
  'post /api/admin/users/:id/recompute-reliability': {
    url: '/api/admin/users/1/recompute-reliability',
    body: { adminUserId: 3 },
  },
  // Прокси карт ходит наружу только после разбора тела. Пустое тело отбивается
  // проверкой, сеть не трогается, а тело ошибки сторож всё равно осматривает.
  'post /api/geocode': { url: '/api/geocode', body: {} },
  'post /api/suggest': { url: '/api/suggest', body: {} },
};

/** Маршруты, ради которых сторож и заведён: они действительно отдают пользователей. */
const USER_BEARING_ROUTES = [
  'get /api/users',
  'patch /api/users/:id',
  'post /api/auth/login',
  'post /api/auth/register',
  'post /api/admin/users/:id/password',
];

/**
 * От чьего лица обходить маршруты (фаза 34).
 *
 * ⚠️ Без сессии этот сторож превратился бы в зелёную пустышку: после закрытия
 * маршрутов он получал бы 401 на каждом шаге, тела ответов исчезли бы, и утечке
 * стало бы неоткуда взяться. Тест продолжал бы проходить, ничего не проверяя.
 * Поэтому обход идёт под администратором — ему открыто больше всех, а значит
 * и данных в ответах больше всего.
 */
const SWEEP_AS_USER_ID = 3;

describe('Сторож: пароль и его хеш не уходят наружу', () => {
  let harness: TestHarness;
  let routes: RouteRecord[];
  let cookie: string;

  beforeAll(async () => {
    // Рабочие данные плюс общий набор фикстур: у пользователей есть хеши,
    // и утечке есть чему утекать.
    harness = await createTestHarness('password-leak');
    routes = collectRoutes(harness.app);
  });

  beforeEach(async () => {
    // Срез засеивается ДАННЫМИ, а не записью файлов: у обвязки на базе директории
    // данных нет вовсе, и прежний вызов писал бы файлы мимо хранилища.
    await harness.writeMany(fixtureCollections);
    // Сессия выдаётся ПОСЛЕ засева: он пересобирает таблицы и гасит прежние.
    cookie = await harness.as(SWEEP_AS_USER_ID);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('таблица маршрутов не пустая и покрывает все контроллеры', () => {
    expect(routes.length).toBeGreaterThan(50);
  });

  it('маршруты, отдающие пользователей, действительно отвечают успехом', async () => {
    for (const key of USER_BEARING_ROUTES) {
      const [method, path] = key.split(' ') as [RouteRecord['method'], string];
      const plan = REQUEST_BY_ROUTE[key] ?? { url: path };
      const response = await request(harness.app.getHttpServer())
        [method](plan.url)
        .set('Cookie', cookie)
        .send(plan.body as object);

      expect(response.status, `${key} → ${response.status}`).toBeLessThan(300);
      expect(response.body.success, `${key}`).toBe(true);
    }
  });

  it('те же маршруты без сессии не отвечают данными', async () => {
    // Контрольная группа к предыдущей проверке. Без неё нельзя отличить «сторож
    // обошёл живые маршруты» от «сторож получил 401 и ничего не увидел».
    for (const key of USER_BEARING_ROUTES) {
      const [method, path] = key.split(' ') as [RouteRecord['method'], string];
      const plan = REQUEST_BY_ROUTE[key] ?? { url: path };

      // Вход и регистрация открыты намеренно — они и есть способ получить сессию.
      if (key.startsWith('post /api/auth/')) continue;

      const response = await request(harness.app.getHttpServer())
        [method](plan.url)
        .send(plan.body as object);

      expect(response.status, `${key} → ${response.status}`).toBe(401);
    }
  });

  it('ни один зарегистрированный маршрут не отдаёт пароль или хеш', async () => {
    const offenders: string[] = [];

    for (const route of routes) {
      const key = `${route.method} ${route.path}`;
      const plan = REQUEST_BY_ROUTE[key] ?? { url: route.path };
      const response = await request(harness.app.getHttpServer())
        [route.method](plan.url)
        .set('Cookie', cookie)
        .send(plan.body as object);

      // Сырой текст ответа — на случай, если тело не разобралось в объект.
      if (response.text?.includes(HASH_VALUE_PREFIX)) {
        offenders.push(`${key}: argon2-хеш найден в теле ответа`);
      }

      for (const leak of findLeaks(response.body)) {
        offenders.push(`${key}: ${leak.path} — ${leak.reason}`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);
  });
});
