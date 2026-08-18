// Тесты модерации и сводного списка публикаций.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Маршруты модерации', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('moderation-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'club_owner',
        name: 'Марина',
        email: 'm@test.local',
        phone: '+7 (900) 000-00-02',
        password: 'demo123',
        favoriteClubIds: [],
      },
      {
        id: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'admin',
        name: 'Админ',
        email: 'a@test.local',
        phone: '+7 (900) 000-00-03',
        password: 'demo123',
        favoriteClubIds: [],
      },
    ]);
    await harness.write('clubs', [
      {
        id: 1,
        createdAt: '2026-01-03T00:00:00.000Z',
        name: 'Волна',
        slug: 'volna',
        city: 'Самара',
        managedByUserId: 2,
        sportIds: [3],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 4,
        reviewCount: 0,
        status: 'published',
      },
      {
        id: 2,
        createdAt: '2026-01-02T00:00:00.000Z',
        name: 'Железо',
        slug: 'iron',
        city: 'Москва',
        managedByUserId: 2,
        sportIds: [5],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 4,
        reviewCount: 0,
      },
    ]);
    await harness.write('trainers', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Марина Соколова',
        slug: 'marina',
        city: 'Самара',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('logs', []);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('скрытие ставит состояние и причину, пишет запись в журнал', async () => {
    const response = await request(harness.app.getHttpServer()).post('/moderation').send({
      action: 'hide',
      entityType: 'club',
      entityId: 1,
      moderatorId: 3,
      reason: 'Жалобы',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'hidden', hideReason: 'Жалобы' });

    const logs = await harness.read<{ action: string }[]>('logs');
    expect(logs[0].action).toBe('moderation_hide');
  });

  it('восстановление снимает состояние и причину', async () => {
    await request(harness.app.getHttpServer())
      .post('/moderation')
      .send({ action: 'hide', entityType: 'club', entityId: 1, moderatorId: 3, reason: 'Жалобы' });

    const response = await request(harness.app.getHttpServer())
      .post('/moderation')
      .send({ action: 'unhide', entityType: 'club', entityId: 1, moderatorId: 3 });

    expect(response.body.data.status).toBe('published');
    expect(response.body.data.hideReason).toBeUndefined();
  });

  it('не администратор — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/moderation')
      .send({ action: 'hide', entityType: 'club', entityId: 1, moderatorId: 2, reason: 'Хочу' });

    expect(response.status).toBe(403);
  });

  it('скрытие без причины — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/moderation')
      .send({ action: 'hide', entityType: 'club', entityId: 1, moderatorId: 3 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Причина скрытия обязательна');
  });

  it('несуществующая публикация — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/moderation')
      .send({ action: 'hide', entityType: 'club', entityId: 99, moderatorId: 3, reason: 'Нет' });

    expect(response.status).toBe(404);
  });

  it('сводный список объединяет клубы и тренеров', async () => {
    const response = await request(harness.app.getHttpServer()).get('/publications');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.total).toBe(3);
  });

  it('отбор по состоянию: публикация без состояния считается опубликованной', async () => {
    const published = await request(harness.app.getHttpServer()).get(
      '/publications?status=published',
    );
    expect(published.body.data.map((item: { id: number }) => item.id)).toContain(2);

    await request(harness.app.getHttpServer())
      .post('/moderation')
      .send({ action: 'hide', entityType: 'club', entityId: 1, moderatorId: 3, reason: 'Жалобы' });

    const hidden = await request(harness.app.getHttpServer()).get('/publications?status=hidden');
    expect(hidden.body.data).toHaveLength(1);
  });

  it('отбор по типу и поиск по названию', async () => {
    const byType = await request(harness.app.getHttpServer()).get('/publications?type=club');
    expect(byType.body.data).toHaveLength(2);

    const bySearch = await request(harness.app.getHttpServer()).get('/publications?search=волна');
    expect(bySearch.body.data).toHaveLength(1);
  });

  it('пагинация отдаёт срез и общее число', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/publications?offset=1&limit=1',
    );

    expect(response.body.data).toHaveLength(1);
    expect(response.body.total).toBe(3);
  });
});
