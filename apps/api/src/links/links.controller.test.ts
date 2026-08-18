// Тесты связей тренер↔клуб. Главное здесь — симметрия прав: подтверждает всегда
// сторона, противоположная инициатору, и разрыв делает услуги частными.

import request from 'supertest';
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

const user = (id: number, role: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  name: `Пользователь ${id}`,
  email: `u${id}@test.local`,
  phone: '+7 (900) 000-00-00',
  password: 'demo123',
  favoriteClubIds: [],
});

describe('Маршруты связей тренер↔клуб', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('links-http');
  });

  beforeEach(async () => {
    // Пользователь 2 управляет и клубом 1, и тренером 1 — это позволяет
    // проверить обе стороны. Пользователь 5 — посторонний владелец тренера 3.
    await harness.write('users', [
      user(1, 'athlete'),
      user(2, 'club_owner'),
      user(3, 'admin'),
      user(5, 'trainer'),
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
        name: 'Марина',
        slug: 'marina',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
      {
        id: 3,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Алексей',
        slug: 'alexey',
        managedByUserId: 5,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 4,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('trainer-club-links', []);
    await harness.write('offerings', []);
    await harness.write('notifications', []);
    await harness.write('logs', []);
  });

  afterAll(async () => {
    await harness.close();
  });

  // Локальный помощник добавляет общий префикс адресов — тот же, что у сервера.
  const post = (path: string, body: object) =>
    request(harness.app.getHttpServer()).post(`/api${path}`).send(body);

  it('создаёт заявку и уведомляет противоположную сторону', async () => {
    const response = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({ status: 'pending', initiatedBy: 'trainer' });

    const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');
    expect(notifications).toEqual([expect.objectContaining({ userId: 2, type: 'link_requested' })]);
  });

  it('сторона с обеими ролями без initiatedBy считается тренером', async () => {
    const response = await post('/trainer-club-links', { trainerId: 1, clubId: 1, userId: 2 });

    expect(response.body.data.initiatedBy).toBe('trainer');
  });

  it('клуб приглашает стороннего тренера — initiatedBy=club', async () => {
    const response = await post('/trainer-club-links', {
      trainerId: 3,
      clubId: 1,
      userId: 2,
      initiatedBy: 'club',
    });

    expect(response.status).toBe(201);
    expect(response.body.data.initiatedBy).toBe('club');

    const notifications = await harness.read<{ userId: number }[]>('notifications');
    expect(notifications).toEqual([expect.objectContaining({ userId: 5 })]);
  });

  it('посторонний не может создать заявку — 403', async () => {
    const response = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 1 });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав для отправки запроса');
  });

  it('несуществующий тренер — 404', async () => {
    const response = await post('/trainer-club-links', { trainerId: 99, clubId: 1, userId: 2 });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Тренер не найден');
  });

  it('повторная заявка при активной связи — 409', async () => {
    await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const response = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Для этой пары уже существует активная связь');
  });

  it('заявку тренера подтверждает клуб', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/approve`, {
      userId: 2,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('confirmed');
    expect(response.body.data.approvedByUserId).toBe(2);
  });

  it('приглашение клуба подтверждает тренер, а сам клуб получает 403', async () => {
    const created = await post('/trainer-club-links', {
      trainerId: 3,
      clubId: 1,
      userId: 2,
      initiatedBy: 'club',
    });
    const linkId = created.body.data.id;

    const selfApprove = await post(`/trainer-club-links/${linkId}/approve`, { userId: 2 });
    expect(selfApprove.status).toBe(403);

    const trainerApprove = await post(`/trainer-club-links/${linkId}/approve`, { userId: 5 });
    expect(trainerApprove.status).toBe(200);
    expect(trainerApprove.body.data.status).toBe('confirmed');
  });

  it('подтверждение не-pending связи — 409', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    await post(`/trainer-club-links/${created.body.data.id}/approve`, { userId: 2 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/approve`, {
      userId: 2,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe('Связь не в состоянии pending');
  });

  it('отказ пишет причину и уведомляет инициатора', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/reject`, {
      userId: 2,
      reason: 'Нет мест',
    });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'rejected', rejectionReason: 'Нет мест' });

    const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');
    expect(notifications.some((item) => item.type === 'link_rejected' && item.userId === 5)).toBe(
      true,
    );
  });

  it('после отказа можно подать заявку заново', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    await post(`/trainer-club-links/${created.body.data.id}/reject`, { userId: 2 });
    const response = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });

    expect(response.status).toBe(201);
  });

  it('разрыв связи делает услуги тренера частными', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const linkId = created.body.data.id;
    await post(`/trainer-club-links/${linkId}/approve`, { userId: 2 });
    await harness.write('offerings', [
      {
        id: 1001,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'trainer',
        ownerId: 3,
        title: 'Персональная',
        trainerClubLinkId: linkId,
      },
    ]);

    const response = await post(`/trainer-club-links/${linkId}/revoke`, { userId: 5 });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'revoked', revokedBy: 'trainer' });

    const offerings = await harness.read<{ trainerClubLinkId?: number }[]>('offerings');
    expect(offerings[0].trainerClubLinkId).toBeUndefined();
  });

  it('тренер отзывает собственную ещё не одобренную заявку', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const response = await post(`/trainer-club-links/${created.body.data.id}/revoke`, {
      userId: 5,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.status).toBe('revoked');
  });

  it('разрыв посторонним — 403, повторный разрыв — 409', async () => {
    const created = await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const linkId = created.body.data.id;

    const stranger = await post(`/trainer-club-links/${linkId}/revoke`, { userId: 1 });
    expect(stranger.status).toBe(403);

    await post(`/trainer-club-links/${linkId}/revoke`, { userId: 5 });
    const again = await post(`/trainer-club-links/${linkId}/revoke`, { userId: 5 });
    expect(again.status).toBe(409);
    expect(again.body.error).toBe('Связь уже завершена (rejected/revoked)');
  });

  it('GET фильтрует по тренеру и статусу', async () => {
    await post('/trainer-club-links', { trainerId: 3, clubId: 1, userId: 5 });
    const response = await request(harness.app.getHttpServer()).get(
      '/api/trainer-club-links?trainerId=3&status=pending',
    );

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(1);
  });
});
