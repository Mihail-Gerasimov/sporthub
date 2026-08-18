// Тесты административных маршрутов: каждый проверяет роль по хранилищу.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Административные маршруты', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('admin-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Атлет',
        email: 'a@test.local',
        phone: '+7 (900) 000-00-01',
        password: 'demo123',
        favoriteClubIds: [],
      },
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'club_owner',
        name: 'Провайдер',
        email: 'p@test.local',
        phone: '+7 (900) 000-00-02',
        password: 'demo123',
        favoriteClubIds: [],
      },
      {
        id: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'admin',
        name: 'Админ',
        email: 'ad@test.local',
        phone: '+7 (900) 000-00-03',
        password: 'demo123',
        favoriteClubIds: [],
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
        title: 'Слот',
        date: '2026-03-18',
        startTime: '10:00',
        endTime: '11:00',
        durationMinutes: 60,
        level: 'all_levels',
        capacity: 10,
        bookedCount: 1,
        price: 500,
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
        status: 'pending',
        date: '2026-03-18',
        statusHistory: [],
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
        rating: 4,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('trainers', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Тренер',
        slug: 'trener',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('trainer-club-links', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        trainerId: 1,
        clubId: 1,
        status: 'confirmed',
        initiatedBy: 'trainer',
      },
    ]);
    await harness.write('offerings', [
      {
        id: 1001,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'trainer',
        ownerId: 1,
        title: 'Услуга',
        trainerClubLinkId: 1,
      },
    ]);
    await harness.write('logs', []);
    await harness.write('notifications', []);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('администратор удаляет запись и освобождает место', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/admin/bookings/1')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const bookings = await harness.read<unknown[]>('bookings');
    expect(bookings).toHaveLength(0);

    const schedule = await harness.read<{ bookedCount: number }[]>('schedule');
    expect(schedule[0].bookedCount).toBe(0);
  });

  it('не администратор получает отказ, запись остаётся', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/admin/bookings/1')
      .send({ adminUserId: 1 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Действие доступно только администратору');

    const bookings = await harness.read<unknown[]>('bookings');
    expect(bookings).toHaveLength(1);
  });

  it('несуществующая запись — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/admin/bookings/99')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Запись не найдена');
  });

  it('принудительный разрыв связи уведомляет обе стороны и отвязывает услуги', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/trainer-club-links/1/force-revoke')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'revoked', revokedBy: 'admin' });

    const offerings = await harness.read<{ trainerClubLinkId?: number }[]>('offerings');
    expect(offerings[0].trainerClubLinkId).toBeUndefined();

    const notifications = await harness.read<{ type: string }[]>('notifications');
    expect(
      notifications.filter((item) => item.type === 'link_revoked').length,
    ).toBeGreaterThanOrEqual(2);

    const logs = await harness.read<{ action: string; meta?: { forced?: boolean } }[]>('logs');
    expect(logs[0]).toMatchObject({ action: 'link_revoke', meta: { forced: true } });
  });

  it('повторный принудительный разрыв — 409', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/admin/trainer-club-links/1/force-revoke')
      .send({ adminUserId: 3 });

    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/trainer-club-links/1/force-revoke')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(409);
  });

  it('снятие карантина ставит метку и шлёт уведомление', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/lift-quarantine')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.quarantineLiftedAt).toBe('string');

    const users = await harness.read<{ quarantineLiftedAt?: string }[]>('users');
    expect(users[0].quarantineLiftedAt).toBeDefined();

    const notifications = await harness.read<{ type: string }[]>('notifications');
    expect(notifications[0].type).toBe('quarantine_lifted_by_admin');
  });

  it('смена пароля администратором не требует текущего пароля', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/password')
      .send({ adminUserId: 3, newPassword: 'fresh-password-99' });

    expect(response.status).toBe(200);

    const users = await harness.read<{ password: string }[]>('users');
    expect(users[0].password).toBe('fresh-password-99');

    const logs = await harness.read<{ action: string }[]>('logs');
    expect(logs[0].action).toBe('admin_password_change');
  });

  it('короткий пароль — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/password')
      .send({ adminUserId: 3, newPassword: '123' });

    expect(response.status).toBe(400);
  });

  it('пересчёт надёжности только пишет запись в журнал', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/recompute-reliability')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(200);

    const logs = await harness.read<{ action: string; entityId: number }[]>('logs');
    expect(logs[0]).toMatchObject({ action: 'reliability_recompute', entityId: 1 });
  });

  it('пересчёт для несуществующего пользователя — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/99/recompute-reliability')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(404);
  });
});
