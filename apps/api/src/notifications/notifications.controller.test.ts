// Тесты уведомлений. Проверяются обе особенности: счётчики внутри `data`
// и молчаливое отбрасывание чужих идентификаторов при удалении.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

const notification = (id: number, over: Record<string, unknown>) => ({
  id,
  createdAt: `2026-02-0${id}T00:00:00.000Z`,
  userId: 1,
  type: 'booking_confirmed',
  payload: {},
  ...over,
});

describe('Маршруты уведомлений', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Алексей',
        email: 'a@test.local',
        phone: '+7 (900) 000-00-01',
        password: 'demo123',
        favoriteClubIds: [],
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Пётр',
        email: 'p@test.local',
        phone: '+7 (900) 000-00-02',
        password: 'demo123',
        favoriteClubIds: [],
        notificationPreferences: { booking_completed: false },
      },
    ]);
    await harness.write('notifications', [
      notification(1, {}),
      notification(2, { type: 'booking_rejected' }),
      notification(3, { readAt: '2026-02-05T00:00:00.000Z' }),
      notification(4, { userId: 2, type: 'booking_completed' }),
      notification(5, { userId: 2, type: 'booking_rejected' }),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('GET отдаёт items, total и unreadCount внутри data', async () => {
    const response = await request(harness.app.getHttpServer()).get('/notifications?userId=1');

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.unreadCount).toBe(2);
    expect(response.body.data.items).toHaveLength(3);
  });

  it('unreadOnly=true оставляет только непрочитанные', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/notifications?userId=1&unreadOnly=true',
    );

    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([2, 1]);
  });

  it('пагинация режет выдачу, но не total', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/notifications?userId=1&offset=1&limit=1',
    );

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.total).toBe(3);
  });

  it('без userId — 400', async () => {
    const response = await request(harness.app.getHttpServer()).get('/notifications');

    expect(response.status).toBe(400);
  });

  it('отключённый в настройках тип не показывается и не считается', async () => {
    const response = await request(harness.app.getHttpServer()).get('/notifications?userId=2');

    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([5]);
    expect(response.body.data.unreadCount).toBe(1);
  });

  it('счётчик непрочитанных отдаётся отдельным маршрутом', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/notifications/unread-count?userId=1',
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ unreadCount: 2 });
  });

  it('пометка прочитанным проставляет время', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/notifications/1/read')
      .send({ userId: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data.readAt).toBeDefined();
  });

  it('чужое уведомление отвечает «не найдено», а не отказом в правах', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/notifications/4/read')
      .send({ userId: 1 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Уведомление не найдено');
  });

  it('read-all возвращает число обновлённых', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/notifications/read-all')
      .send({ userId: 1 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 2 });
  });

  it('удаление отбрасывает чужие идентификаторы молча', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/notifications')
      .send({ userId: 1, ids: [1, 4] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 1 });

    const stored = await harness.read<{ id: number }[]>('notifications');
    expect(stored.map((item) => item.id)).toEqual([2, 3, 4, 5]);
  });

  it('пустой список идентификаторов — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/notifications')
      .send({ userId: 1, ids: [] });

    expect(response.status).toBe(400);
  });
});
