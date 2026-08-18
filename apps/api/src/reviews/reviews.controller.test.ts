// Тесты отзывов. Оба текста ошибки про адресата различаются и оба закреплены —
// перепутать их значит сломать проверку формы на фронте.

import request from 'supertest';
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Маршрут отзывов', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('reviews-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Алексей Смирнов',
        email: 'a@test.local',
        phone: '+7 (900) 000-00-01',
        password: 'demo123',
        favoriteClubIds: [],
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'club_owner',
        name: 'Марина Крылова',
        email: 'm@test.local',
        phone: '+7 (900) 000-00-02',
        password: 'demo123',
        favoriteClubIds: [],
      },
    ]);
    await harness.write('clubs', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Волна',
        slug: 'volna',
        managedByUserId: 2,
        sportIds: [3],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 4.5,
        reviewCount: 1,
        status: 'published',
      },
    ]);
    await harness.write('trainers', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Марина Соколова',
        slug: 'marina-sokolova',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('reviews', [
      {
        id: 1,
        createdAt: '2026-02-01T00:00:00.000Z',
        userId: 1,
        clubId: 1,
        rating: 5,
        text: 'Отлично',
      },
      {
        id: 2,
        createdAt: '2026-02-02T00:00:00.000Z',
        userId: 1,
        trainerId: 1,
        rating: 4,
        text: 'Хорошо',
      },
    ]);
    await harness.write('notifications', []);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('GET отдаёт отзывы клуба', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/reviews?clubId=1');

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(1);
  });

  it('GET отдаёт отзывы тренера', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/reviews?trainerId=1');

    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2]);
  });

  it('GET без фильтров отдаёт всё, свежие сверху', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/reviews');

    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2, 1]);
  });

  it('GET с обоими адресатами — 400 «Нужно указать либо clubId, либо trainerId»', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/reviews?clubId=1&trainerId=1',
    );

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Нужно указать либо clubId, либо trainerId',
    });
  });

  it('POST создаёт отзыв о тренере и пишет его в хранилище', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, trainerId: 1, rating: 5, text: 'Супер' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      userId: 1,
      trainerId: 1,
      rating: 5,
    });

    const stored = await harness.read<{ id: number; text: string }[]>('reviews');
    expect(stored.at(-1)).toMatchObject({
      userId: 1,
      trainerId: 1,
      text: 'Супер',
    });
  });

  it('POST без адресата — 400 «Нужно указать clubId или trainerId»', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, rating: 5, text: 'Без адресата' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Нужно указать clubId или trainerId',
    });
  });

  it('POST сразу на клуб и тренера — 400 с другим текстом', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, clubId: 1, trainerId: 1, rating: 5, text: 'Оба' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Нужно указать либо clubId, либо trainerId',
    });
  });

  it('POST уведомляет провайдера и автора', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, clubId: 1, rating: 5, text: 'Отличный клуб' });

    const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');

    expect(notifications.filter((item) => item.type === 'review_received_by_provider')).toEqual([
      expect.objectContaining({ userId: 2 }),
    ]);
    expect(notifications.filter((item) => item.type === 'review_published_for_athlete')).toEqual([
      expect.objectContaining({ userId: 1 }),
    ]);
  });

  it('отзыв самому себе не уведомляет провайдера, но уведомляет автора', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 2, clubId: 1, rating: 5, text: 'Сам себе' });

    expect(response.status).toBe(201);

    const notifications = await harness.read<{ type: string }[]>('notifications');

    expect(
      notifications.filter((item) => item.type === 'review_received_by_provider'),
    ).toHaveLength(0);
    expect(
      notifications.filter((item) => item.type === 'review_published_for_athlete'),
    ).toHaveLength(1);
  });

  it('POST на несуществующего тренера — 404 «Тренер не найден»', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, trainerId: 999, rating: 5, text: 'Нет такого' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Тренер не найден');
  });

  it('нечисловой фильтр отклоняется', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/reviews?clubId=клуб');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('оценка вне диапазона отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, clubId: 1, rating: 9, text: 'Слишком много' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные данные отзыва');
  });

  it('отзыв от несуществующего пользователя — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 99, clubId: 1, rating: 5, text: 'Кто это' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Пользователь не найден');
  });

  it('отзыв на несуществующий клуб — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/reviews')
      .send({ userId: 1, clubId: 999, rating: 5, text: 'Нет клуба' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Клуб не найден');
  });
});
