// Тесты CRM-заметок. Право завести заметку выводится из записей клиента,
// а не из отдельного поля — это и проверяется.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Маршруты CRM-заметок', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('notes-http');
  });

  beforeEach(async () => {
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
        rating: 4,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('bookings', [
      {
        id: 1,
        createdAt: '2026-02-01T00:00:00.000Z',
        userId: 1,
        scheduleId: 1,
        clubId: 1,
        ownerType: 'club',
        ownerId: 1,
        sportId: 3,
        status: 'confirmed',
        date: '2026-03-18',
        statusHistory: [],
      },
    ]);
    await harness.write('provider-client-notes', []);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('провайдер заводит заметку про своего клиента', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ providerUserId: 2, clientUserId: 1, note: 'Любит утренние тренировки' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ providerUserId: 2, clientUserId: 1 });
    expect(response.body.data.updatedAt).toBe(response.body.data.createdAt);
  });

  it('про чужого клиента заметку завести нельзя — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ providerUserId: 5, clientUserId: 1, note: 'Чужой клиент' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Этот пользователь не является вашим клиентом');
  });

  it('выдача фильтруется по провайдеру и клиенту', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ providerUserId: 2, clientUserId: 1, note: 'Заметка' });

    const response = await request(harness.app.getHttpServer()).get(
      '/api/provider-client-notes?providerUserId=2&clientUserId=1',
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });

  it('без providerUserId выдача не отдаётся — 400', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/provider-client-notes');

    expect(response.status).toBe(400);
  });

  it('автор правит свою заметку', async () => {
    const created = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ providerUserId: 2, clientUserId: 1, note: 'Старый текст' });

    const response = await request(harness.app.getHttpServer())
      .patch(`/api/provider-client-notes/${created.body.data.id}`)
      .send({ userId: 2, note: 'Новый текст' });

    expect(response.status).toBe(200);
    expect(response.body.data.note).toBe('Новый текст');
  });

  it('чужую заметку править нельзя — 403', async () => {
    const created = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ providerUserId: 2, clientUserId: 1, note: 'Текст' });

    const response = await request(harness.app.getHttpServer())
      .patch(`/api/provider-client-notes/${created.body.data.id}`)
      .send({ userId: 9, note: 'Взлом' });

    expect(response.status).toBe(403);
  });

  it('автор удаляет заметку', async () => {
    const created = await request(harness.app.getHttpServer())
      .post('/api/provider-client-notes')
      .send({ providerUserId: 2, clientUserId: 1, note: 'На удаление' });

    const response = await request(harness.app.getHttpServer())
      .delete(`/api/provider-client-notes/${created.body.data.id}`)
      .send({ userId: 2 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const stored = await harness.read<unknown[]>('provider-client-notes');
    expect(stored).toHaveLength(0);
  });

  it('несуществующая заметка — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/provider-client-notes/999')
      .send({ userId: 2 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Заметка не найдена');
  });
});
