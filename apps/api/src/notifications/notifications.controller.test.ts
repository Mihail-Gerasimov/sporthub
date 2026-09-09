// Тесты уведомлений. Проверяются обе особенности: счётчики внутри `data`
// и молчаливое отбрасывание чужих идентификаторов при удалении.
//
// Фаза 34 убрала отсюда `userId` — и из тела, и из строки запроса. Раньше лента
// принадлежала тому, чей номер назвали: `GET /api/notifications?userId=2` отдавал
// чужие уведомления, а `read-all` с чужим номером помечал прочитанным чужое.
// Теперь адресат — всегда владелец сессии, а полный срез площадки (`?scope=all`)
// закрыт правом `use_admin_tools`.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

const notification = (id: number, over: Record<string, unknown>) => ({
  id,
  createdAt: `2026-02-0${id}T00:00:00.000Z`,
  userId: 1,
  type: 'booking_confirmed',
  payload: {},
  ...over,
});

/** Маршруты раздела: гостю обязан отвечать отказом каждый. */
const NOTIFICATION_ROUTES = [
  { method: 'get', path: '/api/notifications' },
  { method: 'get', path: '/api/notifications/unread-count' },
  { method: 'post', path: '/api/notifications/1/read' },
  { method: 'post', path: '/api/notifications/read-all' },
  { method: 'delete', path: '/api/notifications' },
] as const;

describe('Маршруты уведомлений', () => {
  let harness: TestHarness;
  // ⚠️ Cookie выдаются после засева: перенос среза пересобирает базу целиком,
  // а сессии лежат в ней обычной таблицей.
  let firstCookie: string;
  let secondCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-http');
  });

  beforeEach(async () => {
    // Пользователи и уведомления переносятся ОДНИМ срезом: каждая запись пересобирает
    // базу, и раздельные вызовы означали бы два переноса подряд ради одного набора.
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'athlete',
          name: 'Алексей',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'athlete',
          name: 'Пётр',
          email: 'p@test.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
          notificationPreferences: { booking_completed: false },
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'admin',
          name: 'Админ',
          email: 'ad@test.local',
          phone: '+7 (900) 000-00-03',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: [
        notification(1, {}),
        notification(2, { type: 'booking_rejected' }),
        notification(3, { readAt: '2026-02-05T00:00:00.000Z' }),
        notification(4, { userId: 2, type: 'booking_completed' }),
        notification(5, { userId: 2, type: 'booking_rejected' }),
      ],
    });

    firstCookie = await harness.as(1);
    secondCookie = await harness.as(2);
    adminCookie = await harness.as(3);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('GET отдаёт items, total и unreadCount внутри data', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.unreadCount).toBe(2);
    expect(response.body.data.items).toHaveLength(3);
  });

  it('unreadOnly=true оставляет только непрочитанные', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', firstCookie);

    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([2, 1]);
  });

  it('пагинация режет выдачу, но не total', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?offset=1&limit=1')
      .set('Cookie', firstCookie);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.total).toBe(3);
  });

  it('отключённый в настройках тип не показывается и не считается', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', secondCookie);

    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([5]);
    expect(response.body.data.unreadCount).toBe(1);
  });

  it('счётчик непрочитанных отдаётся отдельным маршрутом', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications/unread-count')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ unreadCount: 2 });
  });

  it('пометка прочитанным проставляет время', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/1/read')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.readAt).toBeDefined();
  });

  it('чужое уведомление отвечает «не найдено», а не отказом в правах', async () => {
    // Ответ намеренно не отличается от ответа на несуществующий номер: иначе
    // по коду можно было бы перебором выяснить, какие уведомления вообще есть.
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/4/read')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Уведомление не найдено');

    // И чужое уведомление осталось непрочитанным.
    const stored = await harness.read<{ id: number; readAt?: string }[]>('notifications');
    expect(stored.find((item) => item.id === 4)?.readAt).toBeUndefined();
  });

  it('read-all возвращает число обновлённых', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 2 });
  });

  it('удаление отбрасывает чужие идентификаторы молча', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', firstCookie)
      .send({ ids: [1, 4] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 1 });

    const stored = await harness.read<{ id: number }[]>('notifications');
    expect(stored.map((item) => item.id)).toEqual([2, 3, 4, 5]);
  });

  it('пустой список идентификаторов — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', firstCookie)
      .send({ ids: [] });

    expect(response.status).toBe(400);
  });

  it('нечисловой идентификатор уведомления отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/abc/read')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный id уведомления');
  });

  it('нечисловая постраничность отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?offset=абв')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('гость не проходит ни на один маршрут раздела', async () => {
    const offenders: string[] = [];

    for (const route of NOTIFICATION_ROUTES) {
      const response = await request(harness.app.getHttpServer())
        [route.method](route.path)
        .send({ userId: 1, ids: [1] });

      if (response.status !== 401) {
        offenders.push(`${route.method} ${route.path} — ответил ${response.status} вместо 401`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);

    // Гостевые вызовы ничего не тронули: все пять уведомлений на месте.
    expect(await harness.read<unknown[]>('notifications')).toHaveLength(5);
  });

  it('userId в строке запроса не открывает чужую ленту', async () => {
    // Именно так чужие уведомления и читались до фазы 34 — одной цифрой в адресе.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?userId=2')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([3, 2, 1]);
  });

  it('userId в строке запроса не подменяет счётчик непрочитанных', async () => {
    // У второго пользователя непрочитанное одно, у первого — два. Ответ обязан
    // остаться про того, кто спрашивает.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications/unread-count?userId=2')
      .set('Cookie', firstCookie);

    expect(response.body.data).toEqual({ unreadCount: 2 });
  });

  it('userId в теле read-all не помечает чужую ленту', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all')
      .set('Cookie', firstCookie)
      .send({ userId: 2 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 2 });

    // Уведомления второго пользователя остались непрочитанными.
    const stored =
      await harness.read<{ id: number; userId: number; readAt?: string }[]>('notifications');
    expect(stored.filter((item) => item.userId === 2).every((item) => !item.readAt)).toBe(true);
  });

  it('userId в теле удаления не даёт удалить чужое', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', firstCookie)
      .send({ userId: 2, ids: [4, 5] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 0 });

    const stored = await harness.read<{ id: number }[]>('notifications');
    expect(stored).toHaveLength(5);
  });

  it('полный срез ленты площадки обычному пользователю закрыт', async () => {
    // `?scope=all` отдаёт уведомления всех людей разом. До фазы 34 для этого хватало
    // одного параметра в строке запроса — без входа вообще.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?scope=all')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав');
    expect(response.body.data).toBeUndefined();
  });

  it('полный срез ленты площадки гостю закрыт', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/notifications?scope=all');

    expect(response.status).toBe(401);
  });

  it('администратору полный срез отдаётся целиком', async () => {
    // Обратная сторона отказа: право есть — выдача обязана работать, иначе
    // проверка прав превратилась бы в поломку раздела.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?scope=all')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(5);
    expect(response.body.data.total).toBe(5);
    expect(response.body.data.unreadCount).toBe(4);
  });
});
