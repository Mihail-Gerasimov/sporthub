// Тесты модерации и сводного списка публикаций.
//
// Фаза 34: `moderatorId` из тела убран — скрывший берётся из сессии, а сам маршрут
// закрыт правом `moderate_publications`. Раньше модератором становился любой, кто
// прислал номер администратора: проверка была не «кто ты», а «чей номер ты назвал».

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

describe('Маршруты модерации', () => {
  let harness: TestHarness;
  // ⚠️ Сессии выдаются после засева: перенос среза пересобирает базу целиком,
  // а сессия лежит в ней обычной таблицей и умерла бы вместе с остальными данными.
  let adminCookie: string;
  let providerCookie: string;
  let athleteCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('moderation-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: у базы есть внешние ключи, и публикация,
    // записанная до справочника видов спорта, в неё просто не ляжет.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'athlete',
          name: 'Алексей',
          email: 'al@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'club_owner',
          name: 'Марина',
          email: 'm@test.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'admin',
          name: 'Админ',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-03',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      clubs: [
        {
          id: 1,
          createdAt: '2026-01-03T00:00:00.000Z',
          name: 'Волна',
          slug: 'volna',
          description: 'Описание',
          shortDescription: 'Кратко',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
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
          description: 'Описание',
          shortDescription: 'Кратко',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
          city: 'Москва',
          managedByUserId: 2,
          sportIds: [5],
          tagIds: [],
          amenityIds: [],
          imageUrls: [],
          rating: 4,
          reviewCount: 0,
        },
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина Соколова',
          slug: 'marina',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          priceFrom: 900,
          city: 'Самара',
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
      ],
      logs: [],
    });

    adminCookie = await harness.as(3);
    providerCookie = await harness.as(2);
    athleteCookie = await harness.as(1);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('скрытие ставит состояние и причину, пишет запись в журнал', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    expect(response.status).toBe(200);
    expect(response.body.data).toMatchObject({ status: 'hidden', hideReason: 'Жалобы' });

    const logs = await harness.read<{ action: string }[]>('logs');
    expect(logs[0].action).toBe('moderation_hide');
  });

  it('восстановление снимает состояние и причину', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'unhide', entityType: 'club', entityId: 1 });

    expect(response.body.data.status).toBe('published');
    expect(response.body.data.hideReason).toBeUndefined();
  });

  it('владелец клуба модерировать не может — 403', async () => {
    // Своя публикация или чужая — неважно: скрытие с причиной это действие площадки,
    // а не владельца. Прежде тот же вызов проходил, стоило прислать чужой номер.
    //
    // ⚠️ После шага 35.19 проверка стала строже, чем была. Прежде у роли
    // `club_owner` был свой набор прав, и вопрос стоял «нет ли среди них
    // модерации». Теперь набор у человека ПУСТ, а `moderate_publications`
    // осталось админским — и владение собственным клубом к нему не ведёт.
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', providerCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Хочу' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав');

    const clubs = await harness.read<{ id: number; status?: string }[]>('clubs');
    expect(clubs.find((club) => club.id === 1)?.status).toBe('published');
  });

  it('человек без публикаций модерировать не может — 403', async () => {
    // Пара к проверке выше: там у человека есть свои лица услуг, здесь нет ни
    // одного. С шага 35.19 это единственное различие, которое вообще осталось
    // между обычными людьми, — и ни одно из двух состояний к модерации не ведёт.
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', athleteCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Не нравится' });

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав');

    // Отказ обязан быть отказом: публикация не скрыта и в журнал ничего не легло.
    const clubs = await harness.read<{ id: number; status?: string }[]>('clubs');
    expect(clubs.find((club) => club.id === 1)?.status).toBe('published');
    expect(await harness.read<unknown[]>('logs')).toHaveLength(0);
  });

  it('гость модерировать не может — 401, и разбор тела до этого не доходит', async () => {
    // Тело намеренно негодное: 400 в ответе означал бы, что маршрут занялся чужим
    // вводом раньше, чем спросил, кто пришёл.
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .send({ action: 'сжечь', entityType: 'club', entityId: 1, moderatorId: 3 });

    expect(response.status).toBe(401);
    expect(response.body.error).toBe('Требуется вход');

    const logs = await harness.read<unknown[]>('logs');
    expect(logs).toHaveLength(0);
  });

  it('скрывший берётся из сессии, а moderatorId в теле ни на что не влияет', async () => {
    // Под администратором в теле лежит номер владельца клуба. Прочитай его контроллер —
    // и в карточке публикации, и в журнале осталось бы, что скрыл владелец.
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, moderatorId: 2, reason: 'Жалобы' });

    expect(response.status).toBe(200);
    expect(response.body.data.hiddenByUserId).toBe(3);

    const logs = await harness.read<{ actorId: number }[]>('logs');
    expect(logs[0].actorId).toBe(3);
  });

  it('скрытие без причины — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1 });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Причина скрытия обязательна');
  });

  it('несуществующая публикация — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 99, reason: 'Нет' });

    expect(response.status).toBe(404);
  });

  it('сводный список объединяет клубы и тренеров', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/publications')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toHaveLength(3);
    expect(response.body.total).toBe(3);
  });

  it('сводный список гостю не отдаётся', async () => {
    // В списке видно скрытое, причины скрытия и владельцев публикаций — это
    // служебная выдача админки, а не витрина.
    const response = await request(harness.app.getHttpServer()).get('/api/publications');

    expect(response.status).toBe(401);
  });

  it('отбор по состоянию: публикация без состояния считается опубликованной', async () => {
    const published = await request(harness.app.getHttpServer())
      .get('/api/publications?status=published')
      .set('Cookie', adminCookie);
    expect(published.body.data.map((item: { id: number }) => item.id)).toContain(2);

    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    const hidden = await request(harness.app.getHttpServer())
      .get('/api/publications?status=hidden')
      .set('Cookie', adminCookie);
    expect(hidden.body.data).toHaveLength(1);
  });

  it('отбор по типу и поиск по названию', async () => {
    const byType = await request(harness.app.getHttpServer())
      .get('/api/publications?type=club')
      .set('Cookie', adminCookie);
    expect(byType.body.data).toHaveLength(2);

    const bySearch = await request(harness.app.getHttpServer())
      .get('/api/publications?search=волна')
      .set('Cookie', adminCookie);
    expect(bySearch.body.data).toHaveLength(1);
  });

  it('пагинация отдаёт срез и общее число', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/publications?offset=1&limit=1')
      .set('Cookie', adminCookie);

    expect(response.body.data).toHaveLength(1);
    expect(response.body.total).toBe(3);
  });

  it('неизвестное действие отклоняется своим текстом', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'burn', entityType: 'club', entityId: 1, reason: 'нет' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректное действие. Ожидается hide или unhide');
  });

  it('неизвестный тип сущности отклоняется своим текстом', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'stadium', entityId: 1, reason: 'нет' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный тип сущности');
  });

  it('нечисловой идентификатор сущности отклоняется своим текстом', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 'один', reason: 'нет' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный entityId');
  });

  it('скрытие несуществующего тренера — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'trainer', entityId: 999, reason: 'нет' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Тренер не найден');
  });
});
