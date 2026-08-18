// Тесты добора под страницы: контекст слота и поиск по адресу-ссылке.
//
// Главный кейс — заполненный слот: в выдаче расписания его нет, а контекст
// он отдавать обязан, иначе страница записи покажет «слот не найден».

import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Добор маршрутов под страницы', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('slot-context-http');
    await harness.write('clubs', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Волна',
        slug: 'volna-aquatic-club',
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
    await harness.write('offerings', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'club',
        ownerId: 1,
        sportId: 3,
        title: 'Занятия',
        price: 500,
      },
    ]);
    await harness.write('schedule', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'club',
        ownerId: 1,
        clubId: 1,
        offeringId: 1,
        sportId: 3,
        title: 'Полный слот',
        date: '2026-03-18',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 2,
        bookedCount: 2,
        price: 500,
      },
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('контекст слота отдаёт слот, услугу и владельца', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/schedule/1/context');

    expect(response.status).toBe(200);
    expect(response.body.data.schedule.id).toBe(1);
    expect(response.body.data.offering.id).toBe(1);
    expect(response.body.data.club.id).toBe(1);
  });

  it('заполненный слот выпадает из выдачи расписания, но контекст его отдаёт', async () => {
    const list = await request(harness.app.getHttpServer()).get('/api/schedule');
    expect(list.body.data).toHaveLength(0);

    const context = await request(harness.app.getHttpServer()).get('/api/schedule/1/context');
    expect(context.status).toBe(200);
  });

  it('несуществующий слот — 404', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/schedule/999/context');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Слот расписания не найден');
  });

  it('нечисловой идентификатор слота — 400', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/schedule/abc/context');

    expect(response.status).toBe(400);
  });

  it('клуб находится по адресу-ссылке, регистр не важен', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/clubs/by-slug/Volna-Aquatic-Club',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.club.id).toBe(1);
  });

  it('тренер находится по адресу-ссылке', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/trainers/by-slug/marina-sokolova',
    );

    expect(response.status).toBe(200);
    expect(response.body.data.trainer.id).toBe(1);
  });

  it('неизвестный адрес-ссылка — 404', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/clubs/by-slug/нет-такого',
    );

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Клуб не найден');
  });

  it('автопереходы отдельным маршрутом не выставлены', async () => {
    // Они выполняются внутри чтения записей: отдельный маршрут позволил бы
    // запускать их снаружи в произвольный момент.
    const response = await request(harness.app.getHttpServer()).post(
      '/api/bookings/run-lazy-transitions',
    );

    expect(response.status).toBe(404);
  });
});
