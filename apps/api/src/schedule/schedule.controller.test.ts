// Тесты расписания. Главный кейс — про исчезающий слот: заполненный слот
// не просто теряет `availableSpots`, он пропадает из выдачи целиком.

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

const slot = (over: Record<string, unknown>) => ({
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  offeringId: 1,
  sportId: 3,
  title: 'Тренировка',
  date: '2026-03-18',
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 10,
  bookedCount: 0,
  price: 500,
  ...over,
});

describe('GET /schedule', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('schedule-http');
    await harness.write('schedule', [
      slot({ id: 1, date: '2026-03-18', startTime: '10:00' }),
      slot({ id: 2, date: '2026-03-18', startTime: '08:00', sportId: 5 }),
      slot({ id: 3, date: '2026-03-19', clubId: 2, ownerId: 2 }),
      slot({ id: 4, capacity: 4, bookedCount: 4 }),
      slot({
        id: 1001,
        ownerType: 'trainer',
        ownerId: 1,
        clubId: undefined,
        trainerId: 1,
        date: '2026-03-20',
        startTime: '08:15',
      }),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('по умолчанию отдаёт только клубные слоты и считает свободные места', async () => {
    const response = await request(harness.app.getHttpServer()).get('/schedule');

    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2, 1, 3]);
    expect(response.body.data[0].availableSpots).toBe(10);
  });

  it('заполненный слот исчезает из выдачи целиком, а не показывается с нулём мест', async () => {
    const response = await request(harness.app.getHttpServer()).get('/schedule');

    expect(response.body.data.some((item: { id: number }) => item.id === 4)).toBe(false);
  });

  it('фильтрует по clubId и date', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/schedule?clubId=1&date=2026-03-18',
    );

    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2, 1]);
  });

  it('ownerType=trainer отдаёт тренерские слоты', async () => {
    const response = await request(harness.app.getHttpServer()).get('/schedule?ownerType=trainer');

    expect(response.body.data).toHaveLength(1);
    expect(response.body.data[0].id).toBe(1001);
  });

  it('фильтрует по sportId', async () => {
    const response = await request(harness.app.getHttpServer()).get('/schedule?sportId=5');

    expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2]);
  });

  it('невалидный ownerType — 400 с текстом «Некорректные параметры запроса»', async () => {
    const response = await request(harness.app.getHttpServer()).get('/schedule?ownerType=owner');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Некорректные параметры запроса',
    });
  });

  it('невалидная дата — 400 с тем же текстом', async () => {
    const response = await request(harness.app.getHttpServer()).get('/schedule?date=18-03-2026');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Некорректные параметры запроса',
    });
  });
});
