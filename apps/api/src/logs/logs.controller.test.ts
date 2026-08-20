// Тесты журнала. Набор допустимых значений фильтра совпадает с общим словарём
// действий — полнота словарей отдельно закреплена в logs-dictionaries.test.ts.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

const entry = (id: number, over: Record<string, unknown>) => ({
  id,
  createdAt: `2026-02-0${id}T10:00:00.000Z`,
  action: 'publish_create',
  actorId: 2,
  actorRole: 'club_owner',
  entityType: 'club',
  entityId: 1,
  ...over,
});

describe('Маршруты журнала', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('logs-http');
  });

  beforeEach(async () => {
    await harness.write('logs', [
      entry(1, {}),
      entry(2, {
        action: 'booking_create',
        actorId: 1,
        actorRole: 'athlete',
        entityType: 'booking',
      }),
      entry(3, { action: 'moderation_hide', actorId: 3, actorRole: 'admin' }),
      entry(4, { action: 'link_approve', actorId: 2, entityType: 'trainer' }),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('без фильтров отдаёт всё, свежие сверху, счётчики рядом с data', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/logs');

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([4, 3, 2, 1]);
    expect(response.body.total).toBe(4);
    expect(response.body.offset).toBe(0);
    expect(response.body.limit).toBe(50);
  });

  it('фильтрует по действию и по исполнителю', async () => {
    const byAction = await request(harness.app.getHttpServer()).get(
      '/api/logs?action=booking_create',
    );
    expect(byAction.body.data).toHaveLength(1);

    const byActor = await request(harness.app.getHttpServer()).get('/api/logs?actorId=3');
    expect(byActor.body.data).toHaveLength(1);
  });

  it('фильтрует по диапазону дат', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/logs?from=2026-02-02T00:00:00.000Z&to=2026-02-03T23:59:59.000Z',
    );

    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([3, 2]);
  });

  it('пагинация режет выдачу, но не общее число', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/logs?offset=2&limit=1');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.total).toBe(4);
    expect(response.body.offset).toBe(2);
  });

  it('фильтр отбирает действие, которое система пишет сама', async () => {
    // Раньше здесь был отказ: фильтр держал свою урезанную копию списка
    // действий и не знал про link_approve, хотя запись в журнале есть.
    const response = await request(harness.app.getHttpServer()).get(
      '/api/logs?action=link_approve',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([4]);
  });

  it('несуществующее действие в фильтре — по-прежнему 400', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/logs?action=выдумка');

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('запись создаётся и попадает в хранилище', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/logs').send({
      action: 'admin_login',
      actorId: 3,
      actorRole: 'admin',
      entityType: 'user',
      entityId: 3,
    });

    expect(response.status).toBe(201);

    const stored = await harness.read<unknown[]>('logs');
    expect(stored).toHaveLength(5);
  });

  it('недопустимое действие при записи — 400', async () => {
    const response = await request(harness.app.getHttpServer()).post('/api/logs').send({
      action: 'что-то своё',
      actorId: 3,
      actorRole: 'admin',
      entityType: 'user',
      entityId: 3,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные данные лога');
  });
});
