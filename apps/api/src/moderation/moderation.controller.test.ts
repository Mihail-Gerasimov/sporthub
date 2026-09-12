// Тесты модерации и сводного списка публикаций.
//
// Фаза 34: `moderatorId` из тела убран — скрывший берётся из сессии, а сам маршрут
// закрыт правом `moderate_publications`. Раньше модератором становился любой, кто
// прислал номер администратора: проверка была не «кто ты», а «чей номер ты назвал».

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import type { ClubsRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY } from '../repositories/entities.repository';
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
          name: 'Алексей',
          email: 'al@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина',
          email: 'm@test.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
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
      // ⚠️ Уведомления переносятся пустыми вместе со срезом: без этого надзорные
      // строки копятся между проверками, и «создалась одна» зеленеет на второй.
      notifications: [],
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

  it('скрытие уходит В ОЧЕРЕДЬ НАДЗОРА — с причиной и с тем, кто скрыл', async () => {
    // ⚠️ Шаг 37.31. Двое администраторов, не зная о решениях друг друга, способны
    // отменять их по очереди, и обнаружится это только по жалобе владельца.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'жалоба' });

    const rows = await harness.read<
      {
        addresseeKind: string;
        userId?: number;
        type: string;
        payload: Record<string, unknown>;
      }[]
    >('notifications');
    const oversight = rows.filter((row) => row.type === 'oversight_publication_hidden');

    expect(oversight).toHaveLength(1);
    expect(oversight[0].addresseeKind).toBe('supervision');
    // У очереди владельца-человека нет: строка переживёт увольнение скрывшего.
    expect(oversight[0].userId).toBeUndefined();
    expect(oversight[0].payload.reason).toBe('жалоба');
    expect(oversight[0].payload.subjectType).toBe('club');
    expect(oversight[0].payload.subjectId).toBe(1);
  });

  it('ВОЗВРАТ публикации надзорной строки не порождает', async () => {
    // Обратная сторона: очередь надзора — про то, что требует внимания, а снятие
    // ограничения внимания не требует. Полный след обоих действий — в журнале.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'жалоба' });
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'unhide', entityType: 'club', entityId: 1 });

    const rows = await harness.read<{ type: string }[]>('notifications');

    expect(rows.filter((row) => row.type === 'oversight_publication_hidden')).toHaveLength(1);
  });

  it('ВЛАДЕЛЕЦ узнаёт о скрытии — письмом в ящик своего лица, с причиной', async () => {
    // ⚠️ Довесок к фазе 37. Прежде владелец узнавал о скрытии, только если сам
    // заходил на карточку и видел плашку: публикации нет в каталоге, записи не идут,
    // а человек ждёт и не знает.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'жалоба' });

    const rows = await harness.read<
      {
        addresseeKind: string;
        addresseeType?: string;
        addresseeId?: number;
        userId?: number;
        type: string;
        payload: Record<string, unknown>;
      }[]
    >('notifications');
    const owner = rows.filter((row) => row.type === 'publication_hidden_for_owner');

    expect(owner).toHaveLength(1);
    // ⚠️ Адресат — ЛИЦО, а не человек: у владельца трёх клубов письмо ложится
    // в ящик того клуба, чью публикацию тронули (модель фазы 35).
    expect(owner[0].addresseeKind).toBe('club');
    expect(owner[0].addresseeType).toBe('club');
    expect(owner[0].addresseeId).toBe(1);
    expect(owner[0].payload.reason).toBe('жалоба');
  });

  it('в письме владельцу НЕТ имени администратора', async () => {
    // Решение заказчика: владельцу важна причина, а не фамилия — имя превращает
    // административное решение в личный конфликт. В журнале исполнитель остаётся.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'жалоба' });

    const rows =
      await harness.read<{ type: string; payload: Record<string, unknown> }[]>('notifications');
    const owner = rows.find((row) => row.type === 'publication_hidden_for_owner');
    const written = JSON.stringify(owner?.payload ?? {});

    expect(written).not.toContain('Админ');
    expect(written).not.toContain('hiddenByUserId');
    expect(written).not.toContain('moderator');
  });

  it('ВОЗВРАТ публикации владельцу тоже приходит', async () => {
    // ⚠️ Без этого человек, исправивший нарушение, не узнает, что его вернули,
    // и продолжит ждать: молчание здесь читается как отказ.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'жалоба' });
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'unhide', entityType: 'club', entityId: 1 });

    const rows = await harness.read<{ type: string; addresseeId?: number }[]>('notifications');
    const returned = rows.filter((row) => row.type === 'publication_unhidden_for_owner');

    expect(returned).toHaveLength(1);
    expect(returned[0].addresseeId).toBe(1);
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

  // --- Вид скрытия (шаг 36.12) --------------------------------------------------

  it('скрытие модератором помечается видом «moderation»', async () => {
    // ⚠️ Прежде вид скрытия выводился из ТЕКСТА причины: если он совпадал
    // со служебной строкой владельца — считалось архивом. То есть владелец мог
    // выдать чужое скрытие за свой архив, просто вписав ту же причину.
    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({
        action: 'hide',
        entityType: 'club',
        entityId: 1,
        reason: 'Убрано владельцем из каталога',
      });

    expect(response.status).toBe(200);
    // Причина ровно та, что прислали, а вид — всё равно модерация.
    expect(response.body.data).toMatchObject({
      hideReason: 'Убрано владельцем из каталога',
      hiddenKind: 'moderation',
    });
  });

  it('восстановление гасит и вид скрытия, и признак повторной проверки', async () => {
    // Забытый признак оставил бы живую публикацию в разделе модерации навсегда,
    // а забытый вид — показал бы плашку на возвращённой карточке.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    // ⚠️ Признак выставляется ЯВНО, а не подразумевается. Дыра, найденная диверсией
    // д-35: без этой строки набор снимал скрытие с публикации, у которой признака
    // и не было, — и «unhide его гасит» зеленело, ничего не проверяя.
    const clubs = harness.app.get<ClubsRepository>(CLUBS_REPOSITORY);
    await clubs.update(1, { awaitingRecheck: true });

    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'unhide', entityType: 'club', entityId: 1 });

    expect(response.body.data.hiddenKind).toBeUndefined();
    expect(response.body.data.awaitingRecheck).toBe(false);
  });

  it('повторное скрытие сбрасывает признак повторной проверки', async () => {
    // Новая причина начинает разбирательство заново: прежнее «исправлено»
    // к ней отношения не имеет.
    const clubs = harness.app.get<ClubsRepository>(CLUBS_REPOSITORY);
    await clubs.update(1, { awaitingRecheck: true });

    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Новая жалоба' });

    expect(response.body.data.awaitingRecheck).toBe(false);
  });

  // --- Запрет скрытия при живых записях (шаг 36.19, решение заказчика 14) -------

  /**
   * Живая запись на клуб 1.
   *
   * ⚠️ День занятия считается от СЕГОДНЯ, а не вписан числом: запрет смотрит
   * на будущее, и вписанная дата однажды станет прошлым — проверка запрета молча
   * перестанет проверять запрет.
   */
  const seedUpcomingBooking = async (status = 'confirmed', shiftDays = 3): Promise<void> => {
    const day = new Date(Date.now() + shiftDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);

    await harness.writeMany({
      offerings: [
        {
          id: 1,
          createdAt: '2026-01-03T00:00:00.000Z',
          ownerType: 'club',
          ownerId: 1,
          clubId: 1,
          sportId: 3,
          title: 'Тренировка',
          description: 'Описание',
          format: 'group',
          price: 1000,
          durationMinutes: 60,
          capacity: 10,
          address: 'ул. Ленина, 1',
          coordinates: { lat: 53.2, lng: 50.1 },
        },
      ],
      schedule: [
        {
          id: 1,
          createdAt: '2026-01-03T00:00:00.000Z',
          offeringId: 1,
          ownerType: 'club',
          ownerId: 1,
          clubId: 1,
          sportId: 3,
          title: 'Утро',
          date: day,
          startTime: '08:00',
          endTime: '09:00',
          durationMinutes: 60,
          level: 'all_levels',
          capacity: 10,
          bookedCount: 1,
          price: 1000,
        },
      ],
      bookings: [
        {
          id: 1,
          createdAt: '2026-01-03T00:00:00.000Z',
          scheduleId: 1,
          ownerType: 'club',
          ownerId: 1,
          clubId: 1,
          userId: 1,
          sportId: 3,
          date: day,
          status,
          paymentStatus: 'unpaid',
          totalPrice: 1000,
        },
      ],
    });

    // ⚠️ Обвязка пересобирает базу на каждой записи и гасит выданные сессии.
    // Cookie выдаётся ЗАНОВО после засева, иначе запрос придёт гостем и упрётся
    // в 401 — то есть проверка запрета зеленела бы по чужой причине.
    adminCookie = await harness.as(3);
  };

  it('скрыть публикацию с живой будущей записью нельзя — 409 с числом', async () => {
    // ⚠️ Тот же запрет, что у уборки лица, и по той же причине: скрытая публикация
    // исчезает из каталога, но уже созданную запись не отменяет — человек придёт
    // к закрытой двери. Право модерации даёт трогать чужую вещь, а не отменять
    // чужое занятие молча.
    await seedUpcomingBooking();

    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    expect(response.status).toBe(409);
    expect(response.body.error).toMatch(/записаны люди \(1\)/);

    // Отказ обязан быть отказом: публикация осталась в каталоге.
    const clubs = await harness.read<{ id: number; status?: string }[]>('clubs');
    expect(clubs.find((club) => club.id === 1)?.status).not.toBe('hidden');
  });

  it('отменённая запись скрытию не мешает', async () => {
    // Счётчик общий с запретом удаления слота (36.8): считай он отменённые —
    // ошибка удвоилась бы сразу в двух местах.
    await seedUpcomingBooking('cancelled_by_user');

    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    expect(response.status).toBe(200);
  });

  it('прошедшая запись скрытию не мешает', async () => {
    await seedUpcomingBooking('confirmed', -3);

    const response = await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', adminCookie)
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'Жалобы' });

    expect(response.status).toBe(200);
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

  // --- Очередь повторной проверки (шаг 36.22) ----------------------------------

  /**
   * Скрытая модератором публикация, которую владелец уже исправил.
   *
   * ⚠️ Признак ставится ЧЕРЕЗ репозиторий, а не подкладыванием строки в срез:
   * так проверка идёт по тому же пути, что и правка публикации в бою, и вместе
   * с ней проверяется, что колонка вообще пишется.
   */
  const markAwaitingRecheck = async (): Promise<void> => {
    const clubs = harness.app.get<ClubsRepository>(CLUBS_REPOSITORY);

    await clubs.update(1, {
      status: 'hidden',
      hideReason: 'Жалобы',
      hiddenKind: 'moderation',
      awaitingRecheck: true,
    });
  };

  it('отбор «ждёт повторной проверки» отдаёт только исправленные', async () => {
    // ⚠️ Отбор обязан уходить В ЗАПРОС: под него заведён частичный индекс
    // `clubs_awaiting_recheck_idx`. Отсев после чтения выглядел бы так же,
    // но дорожал бы вместе с каталогом — ровно то, что запрещает главное правило.
    await markAwaitingRecheck();

    const response = await request(harness.app.getHttpServer())
      .get('/api/publications?awaitingRecheck=true')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(
      response.body.data.map((item: { type: string; id: number }) => `${item.type}-${item.id}`),
    ).toEqual(['club-1']);
    expect(response.body.total).toBe(1);
  });

  it('без параметра отбора выдача прежняя — старый клиент переживает выкатку', async () => {
    // Параметр необязательный: клиент, ничего о нём не знающий, обязан получить
    // ровно то же, что получал до выкатки.
    await markAwaitingRecheck();

    const all = await request(harness.app.getHttpServer())
      .get('/api/publications')
      .set('Cookie', adminCookie);
    expect(all.body.data).toHaveLength(3);

    // Явное «нет» — тоже не отбор, а его отсутствие.
    const off = await request(harness.app.getHttpServer())
      .get('/api/publications?awaitingRecheck=false')
      .set('Cookie', adminCookie);
    expect(off.body.data).toHaveLength(3);
  });

  it('элемент выдачи несёт вид скрытия и признак повторной проверки', async () => {
    // Без этих полей раздел модерации не отличит архив владельца от своего же
    // скрытия и не покажет, что публикацию уже исправили.
    await markAwaitingRecheck();

    const response = await request(harness.app.getHttpServer())
      .get('/api/publications?status=hidden')
      .set('Cookie', adminCookie);

    const item = response.body.data.find(
      (row: { type: string; id: number }) => row.type === 'club' && row.id === 1,
    );

    expect(item).toMatchObject({ hiddenKind: 'moderation', awaitingRecheck: true });
  });

  it('отбор по повторной проверке складывается с отбором по типу', async () => {
    // Условия обязаны СУЖАТЬ друг друга, а не заменять: иначе новый параметр
    // тихо отменил бы уже существующий.
    await markAwaitingRecheck();

    const byTrainer = await request(harness.app.getHttpServer())
      .get('/api/publications?awaitingRecheck=true&type=trainer')
      .set('Cookie', adminCookie);

    expect(byTrainer.body.data).toHaveLength(0);
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
