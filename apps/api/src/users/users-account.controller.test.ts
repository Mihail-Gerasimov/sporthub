// Тесты учётных данных. Пароль не должен появляться в ответе ни при каких
// обстоятельствах, а обязательные типы уведомлений нельзя выключить.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

describe('Маршруты учётных данных', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('users-account-http');
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
        role: 'club_owner',
        name: 'Марина',
        email: 'm@test.local',
        phone: '+7 (900) 000-00-02',
        password: 'demo123',
        favoriteClubIds: [],
      },
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('меняет телефон и не возвращает пароль', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1')
      .send({ userId: 1, phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(200);
    expect(response.body.data.phone).toBe('+7 (900) 111-22-33');
    expect(response.body.data.password).toBeUndefined();

    const stored = await harness.read<{ id: number; phone: string }[]>('users');
    expect(stored[0].phone).toBe('+7 (900) 111-22-33');
  });

  it('меняет пароль при верном текущем', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1')
      .send({ userId: 1, password: 'newpass1', currentPassword: 'demo123' });

    expect(response.status).toBe(200);

    const stored = await harness.read<{ password: string }[]>('users');
    expect(stored[0].password).toBe('newpass1');
  });

  it('неверный текущий пароль — 401 и данные не меняются', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1')
      .send({ userId: 1, password: 'newpass1', currentPassword: 'wrong' });

    expect(response.status).toBe(401);
    expect(response.body.error).toMatch(/Неверный текущий пароль/);

    const stored = await harness.read<{ password: string }[]>('users');
    expect(stored[0].password).toBe('demo123');
  });

  it('смена пароля без текущего — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1')
      .send({ userId: 1, password: 'newpass1' });

    expect(response.status).toBe(400);
  });

  it('пустая правка — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1')
      .send({ userId: 1 });

    expect(response.status).toBe(400);
  });

  it('некорректный телефон — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1')
      .send({ userId: 1, phone: '89001112233' });

    expect(response.status).toBe(400);
  });

  it('правка чужой учётной записи — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/2')
      .send({ userId: 1, phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(403);
  });

  it('несуществующий пользователь — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/99')
      .send({ userId: 99, phone: '+7 (900) 111-22-33' });

    expect(response.status).toBe(404);
  });

  it('настройки уведомлений читаются и пишутся', async () => {
    const patch = await request(harness.app.getHttpServer())
      .patch('/users/1/notification-preferences')
      .send({ userId: 1, preferences: { booking_rejected: false } });

    expect(patch.status).toBe(200);
    expect(patch.body.data.notificationPreferences.booking_rejected).toBe(false);

    const read = await request(harness.app.getHttpServer()).get(
      '/users/1/notification-preferences',
    );

    expect(read.body.data.notificationPreferences.booking_rejected).toBe(false);
  });

  it('обязательные типы молча отбрасываются', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/1/notification-preferences')
      .send({
        userId: 1,
        preferences: {
          booking_confirmed: false,
          quarantine_start: false,
          booking_cancelled_by_provider: false,
          booking_rejected: false,
        },
      });

    expect(response.status).toBe(200);
    expect(response.body.data.notificationPreferences).toEqual({ booking_rejected: false });
  });

  it('чужие настройки править нельзя — 403', async () => {
    const response = await request(harness.app.getHttpServer())
      .patch('/users/2/notification-preferences')
      .send({ userId: 1, preferences: { booking_rejected: false } });

    expect(response.status).toBe(403);
  });
});
