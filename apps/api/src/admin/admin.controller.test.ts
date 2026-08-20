// Тесты административных маршрутов: каждый проверяет роль по хранилищу.

import { verify } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

describe('Административные маршруты', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('admin-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: запись ссылается на слот, слот — на услугу и клуб,
    // публикация — на справочник видов спорта. По отдельности такой срез в базу не ляжет.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'athlete',
          name: 'Атлет',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'club_owner',
          name: 'Провайдер',
          email: 'p@test.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
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
      schedule: [
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
      ],
      bookings: [
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
          totalPrice: 500,
          statusHistory: [],
        },
      ],
      clubs: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Волна',
          slug: 'volna',
          description: 'Описание',
          shortDescription: 'Кратко',
          city: 'Самара',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
          managedByUserId: 2,
          sportIds: [3],
          tagIds: [],
          amenityIds: [],
          imageUrls: [],
          rating: 4,
          reviewCount: 0,
          status: 'published',
        },
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Тренер',
          slug: 'trener',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          priceFrom: 900,
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
      ],
      'trainer-club-links': [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          trainerId: 1,
          clubId: 1,
          status: 'confirmed',
          initiatedBy: 'trainer',
        },
      ],
      offerings: [
        // Услуга слота: раньше её в наборе не было вовсе, а слот на неё ссылался.
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'club',
          ownerId: 1,
          sportId: 3,
          title: 'Занятия',
          description: 'Описание',
          format: 'group',
          price: 500,
          durationMinutes: 60,
          capacity: 10,
          address: 'ул. Ленина, 1',
          coordinates: { lat: 53.2, lng: 50.1 },
        },
        {
          id: 1001,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'trainer',
          ownerId: 1,
          sportId: 3,
          title: 'Услуга',
          description: 'Описание',
          format: 'personal',
          price: 900,
          durationMinutes: 60,
          capacity: 1,
          address: 'ул. Ленина, 1',
          coordinates: { lat: 53.2, lng: 50.1 },
          trainerClubLinkId: 1,
        },
      ],
      logs: [],
      notifications: [],
    });
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

    // Услуга ищется по номеру, а не берётся первой: в наборе их теперь две,
    // и «первая попавшаяся» проверяла бы ту, у которой связи и не было.
    const offerings = await harness.read<{ id: number; trainerClubLinkId?: number }[]>('offerings');
    expect(offerings.find((item) => item.id === 1001)?.trainerClubLinkId).toBeUndefined();

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

    // В хранилище лежит хеш, а не сам пароль: проверяем это разбором строки
    // и сверкой с новым паролем.
    const users = await harness.read<{ passwordHash: string }[]>('users');
    expect(users[0].passwordHash.startsWith('$argon2id$')).toBe(true);
    expect(await verify(users[0].passwordHash, 'fresh-password-99')).toBe(true);

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

  it('принудительный разрыв связи не-администратором запрещён', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/trainer-club-links/1/force-revoke')
      .send({ adminUserId: 1 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Действие доступно только администратору');
  });

  it('снятие карантина не-администратором запрещено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/lift-quarantine')
      .send({ adminUserId: 1 });

    expect(response.status).toBe(403);
  });

  it('смена пароля не-администратором запрещена', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/password')
      .send({ adminUserId: 1, newPassword: 'взлом-пароля' });

    expect(response.status).toBe(403);

    const users = await harness.read<{ passwordHash: string }[]>('users');
    expect(users[0].passwordHash).toBe(DEMO_PASSWORD_HASH);
  });

  it('пересчёт надёжности не-администратором запрещён', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/recompute-reliability')
      .send({ adminUserId: 1 });

    expect(response.status).toBe(403);
  });

  it('снятие карантина несуществующему пользователю — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/99/lift-quarantine')
      .send({ adminUserId: 3 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Пользователь не найден');
  });

  it('смена пароля несуществующему пользователю — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/99/password')
      .send({ adminUserId: 3, newPassword: 'новый-пароль' });

    expect(response.status).toBe(404);
  });

  it('удаление записи без данных запроса отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/admin/bookings/1')
      .send({});

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные данные запроса');
  });
});
