// Тесты модерации и сводного списка публикаций.
//
// Фаза 34: `moderatorId` из тела убран — скрывший берётся из сессии, а сам маршрут
// закрыт правом `moderate_publications`. Раньше модератором становился любой, кто
// прислал номер администратора: проверка была не «кто ты», а «чей номер ты назвал».

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { MODERATION_ERRORS } from '@sporthub/domain';
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

  it('скрытие при ТРЁХ администраторах даёт ОДНУ строку', async () => {
    // ⚠️ Дыра покрытия, найденная ревизией 37.73. Стенд держал одного
    // администратора, а на одном «одна строка на всех» и «по строке каждому»
    // дают одинаковый результат — то есть не проверяются вовсе.
    //
    // Копии по числу администраторов сломали бы разбор: «этим занялись» стало бы
    // личным, и второй не увидел бы, что первый уже взялся.
    const existing =
      await harness.read<{ id: number; accountKind?: string; email: string }[]>('users');

    await harness.writeMany({
      users: [
        ...existing,
        {
          id: 4,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Админ 2',
          email: 'a2@test.local',
          phone: '+7 (900) 000-00-04',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Админ 3',
          email: 'a3@test.local',
          phone: '+7 (900) 000-00-05',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: [],
    });

    // ⚠️ Cookie выдаётся ЗАНОВО: запись пересобирает базу целиком, а сессии
    // лежат в ней обычной таблицей и гаснут вместе с остальными данными.
    await request(harness.app.getHttpServer())
      .post('/api/moderation')
      .set('Cookie', await harness.as(3))
      .send({ action: 'hide', entityType: 'club', entityId: 1, reason: 'жалоба' })
      .expect(200);

    const rows = await harness.read<{ addresseeKind: string; type: string }[]>('notifications');
    const oversight = rows.filter((row) => row.type === 'oversight_publication_hidden');

    expect(oversight, 'строка размножилась по администраторам').toHaveLength(1);
    expect(oversight[0].addresseeKind).toBe('supervision');
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
    expect(written).not.toContain('actorUserId');
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
    // Текст — из словаря действий: перечень собирается из него, и пятое действие
    // меняет текст само, а не роняет этот кейс (38.39).
    expect(response.body.error).toBe(MODERATION_ERRORS.unknownAction);
    expect(response.body.error).toMatch(/^Некорректное действие\. Ожидается hide/);
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

// ═════════════════════════════════════════════════════════════════════════════
// Верификация: verify / unverify (фаза 38, шаги 38.44–38.46)
// ═════════════════════════════════════════════════════════════════════════════
//
// Те же маршрут и словарь, что у скрытия: третье и четвёртое действие — строки
// словаря, а не новые развилки. Тренер проверяется наравне с клубом.
describe('Верификация публикаций', () => {
  let harness: TestHarness;
  let adminCookie: string;
  let providerCookie: string;

  const moderate = (cookie: string, body: Record<string, unknown>) =>
    request(harness.app.getHttpServer()).post('/api/moderation').set('Cookie', cookie).send(body);

  const readRows = <T>(name: string) => harness.read<T[]>(name);

  beforeAll(async () => {
    harness = await createTestHarness('moderation-verification');
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
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
        {
          id: 11,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Админ 2',
          email: 'a2@test.local',
          phone: '+7 (900) 000-00-11',
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
          name: 'Скрытый',
          slug: 'hidden-club',
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
          status: 'hidden',
          hideReason: 'Жалобы',
          hiddenKind: 'moderation',
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
      offerings: [],
      schedule: [],
      bookings: [],
      logs: [],
      notifications: [],
    });

    adminCookie = await harness.as(3);
    providerCookie = await harness.as(2);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('verify ставит «когда» и «кем», пишет verification_grant в журнал', async () => {
    const response = await moderate(adminCookie, {
      action: 'verify',
      entityType: 'club',
      entityId: 1,
    });

    expect(response.status).toBe(200);
    expect(typeof response.body.data.verifiedAt).toBe('string');
    expect(response.body.data.verifiedByUserId).toBe(3);

    const logs = await readRows<{ action: string; actorId: number; meta: unknown }>('logs');

    expect(logs[0]).toMatchObject({ action: 'verification_grant', actorId: 3, entityId: 1 });
  });

  it('verify не требует причины и не порождает надзорной строки', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });

    const rows = await readRows<{ type: string; addresseeKind: string }>('notifications');

    expect(rows.filter((row) => row.addresseeKind === 'supervision')).toEqual([]);
  });

  it('владелец узнаёт о подтверждении — письмом в ящик лица, без имени администратора', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });

    const rows = await readRows<{
      type: string;
      addresseeKind: string;
      addresseeType?: string;
      addresseeId?: number;
      payload: Record<string, unknown>;
    }>('notifications');
    const owner = rows.find((row) => row.type === 'publication_verified_for_owner');

    expect(owner).toMatchObject({ addresseeKind: 'club', addresseeType: 'club', addresseeId: 1 });
    expect(owner?.payload.publicationName).toBe('Волна');
    expect(JSON.stringify(owner?.payload)).not.toContain('actorUserId');
    expect(JSON.stringify(owner?.payload)).not.toContain('Админ');
  });

  it('тренер подтверждается наравне с клубом — письмо в ящик карточки', async () => {
    const response = await moderate(adminCookie, {
      action: 'verify',
      entityType: 'trainer',
      entityId: 1,
    });

    expect(response.status).toBe(200);
    expect(response.body.data.verifiedByUserId).toBe(3);

    const rows = await readRows<{ type: string; addresseeType?: string; addresseeId?: number }>(
      'notifications',
    );

    expect(rows.find((row) => row.type === 'publication_verified_for_owner')).toMatchObject({
      addresseeType: 'trainer',
      addresseeId: 1,
    });
  });

  it('скрытую публикацию подтвердить нельзя — 409 с текстом из словаря', async () => {
    const response = await moderate(adminCookie, {
      action: 'verify',
      entityType: 'club',
      entityId: 2,
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(MODERATION_ERRORS.notPublished);
  });

  it('unverify без причины — 400 «Причина отзыва обязательна» (д-45)', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });

    const response = await moderate(adminCookie, {
      action: 'unverify',
      entityType: 'club',
      entityId: 1,
    });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Причина отзыва обязательна');
    // Отказ обязан быть отказом: знак остался на месте.
    const clubs = await readRows<{ id: number; verifiedAt?: string }>('clubs');
    expect(clubs.find((row) => row.id === 1)?.verifiedAt).toBeDefined();
  });

  it('unverify с причиной обнуляет пару В БАЗЕ, пишет verification_revoke и причину', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });

    const response = await moderate(adminCookie, {
      action: 'unverify',
      entityType: 'club',
      entityId: 1,
      reason: 'Документы не подтвердились',
    });

    expect(response.status).toBe(200);
    expect('verifiedAt' in response.body.data).toBe(false);
    expect('verifiedByUserId' in response.body.data).toBe(false);

    const clubs = await readRows<{ id: number; verifiedAt?: string; verifiedByUserId?: number }>(
      'clubs',
    );
    const club = clubs.find((row) => row.id === 1);

    expect(club?.verifiedAt).toBeUndefined();
    expect(club?.verifiedByUserId).toBeUndefined();

    const logs = await readRows<{ action: string; meta: { reason?: string } }>('logs');

    expect(logs.find((row) => row.action === 'verification_revoke')).toMatchObject({
      meta: { reason: 'Документы не подтвердились' },
    });
  });

  it('отзыв уходит владельцу с причиной и в очередь надзора с исполнителем', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });
    await moderate(adminCookie, {
      action: 'unverify',
      entityType: 'club',
      entityId: 1,
      reason: 'Документы не подтвердились',
    });

    const rows = await readRows<{
      type: string;
      addresseeKind: string;
      payload: Record<string, unknown>;
    }>('notifications');
    const owner = rows.find((row) => row.type === 'publication_verification_revoked_for_owner');
    const oversight = rows.filter((row) => row.type === 'oversight_verification_revoked');

    expect(owner?.payload.reason).toBe('Документы не подтвердились');
    expect(JSON.stringify(owner?.payload)).not.toContain('actorUserId');
    // Одна строка при двух администраторах в срезе — общая очередь (38.50).
    expect(oversight).toHaveLength(1);
    expect(oversight[0]).toMatchObject({ addresseeKind: 'supervision' });
    expect(oversight[0].payload).toMatchObject({
      reason: 'Документы не подтвердились',
      actorUserId: 3,
      subjectType: 'club',
      subjectId: 1,
    });
  });

  it('отозвать неподтверждённую нельзя — 409 с текстом из словаря', async () => {
    const response = await moderate(adminCookie, {
      action: 'unverify',
      entityType: 'club',
      entityId: 1,
      reason: 'нет',
    });

    expect(response.status).toBe(409);
    expect(response.body.error).toBe(MODERATION_ERRORS.notVerified);
  });

  it('владелец подтвердить свою публикацию не может — 403', async () => {
    const response = await moderate(providerCookie, {
      action: 'verify',
      entityType: 'club',
      entityId: 1,
    });

    expect(response.status).toBe(403);
    expect(
      (await readRows<{ id: number; verifiedAt?: string }>('clubs'))[0].verifiedAt,
    ).toBeUndefined();
  });

  it('скрытие модератором ГАСИТ подтверждение (38.46)', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });

    const response = await moderate(adminCookie, {
      action: 'hide',
      entityType: 'club',
      entityId: 1,
      reason: 'Жалобы',
    });

    expect(response.status).toBe(200);

    const clubs = await readRows<{ id: number; verifiedAt?: string; verifiedByUserId?: number }>(
      'clubs',
    );
    const club = clubs.find((row) => row.id === 1);

    expect(club?.verifiedAt).toBeUndefined();
    expect(club?.verifiedByUserId).toBeUndefined();
  });

  it('архив владельца подтверждение НЕ гасит (38.46)', async () => {
    await moderate(adminCookie, { action: 'verify', entityType: 'club', entityId: 1 });

    const archived = await request(harness.app.getHttpServer())
      .delete('/api/clubs/1')
      .set('Cookie', providerCookie);

    expect(archived.status).toBe(200);
    expect(archived.body.data.outcome).toBe('archived');

    const clubs = await readRows<{ id: number; status: string; verifiedAt?: string }>('clubs');
    const club = clubs.find((row) => row.id === 1);

    expect(club?.status).toBe('hidden');
    expect(club?.verifiedAt).toBeDefined();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Раздел модерации: отбор «непроверенные» — в запросе (фаза 38, шаг 38.47)
// ═════════════════════════════════════════════════════════════════════════════
//
// Стенд: 150 клубов. Сто десять НОВЕЙШИХ подтверждены, сорок САМЫХ СТАРЫХ — нет.
// Список идёт «свежие сверху», страница — 50 строк: все непроверенные лежат
// за третьей страницей. Отсев в памяти поверх выданной страницы вернул бы ноль;
// отбор в запросе — все сорок (диверсия д-44).
describe('Отбор «непроверенные» считает запрос', () => {
  let harness: TestHarness;
  let adminCookie: string;

  const TOTAL = 150;
  const UNVERIFIED = 40;

  beforeAll(async () => {
    harness = await createTestHarness('publications-verified-filter');
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
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
      clubs: Array.from({ length: TOTAL }, (_, index) => {
        const id = index + 1;

        return {
          id,
          // Чем больше номер, тем новее — и тем выше в списке «свежие сверху».
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)).toISOString(),
          name: `Клуб ${id}`,
          slug: `club-${id}`,
          description: 'Описание',
          shortDescription: 'Кратко',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          priceFrom: 500,
          distanceKm: 1,
          city: 'Самара',
          sportIds: [3],
          tagIds: [],
          amenityIds: [],
          imageUrls: [],
          rating: 4,
          reviewCount: 0,
          status: 'published',
          ...(id > UNVERIFIED
            ? { verifiedAt: '2026-09-15T12:00:00.000Z', verifiedByUserId: 3 }
            : {}),
        };
      }),
      trainers: [],
      offerings: [],
      schedule: [],
      bookings: [],
      logs: [],
      notifications: [],
    });

    adminCookie = await harness.as(3);
  });

  afterAll(async () => {
    await harness.close();
  });

  const list = (query: string) =>
    request(harness.app.getHttpServer())
      .get(`/api/publications${query}`)
      .set('Cookie', adminCookie);

  it('verified=false достаёт непроверенных ИЗ-ЗА ПРЕДЕЛОВ первой страницы (д-44)', async () => {
    const response = await list('?verified=false&limit=6');

    expect(response.status).toBe(200);
    expect(response.body.total, 'отбор посчитал только первую страницу').toBe(UNVERIFIED);
    expect(response.body.data).toHaveLength(6);
    expect(
      (response.body.data as { verifiedAt?: string }[]).every(
        (item) => item.verifiedAt === undefined,
      ),
    ).toBe(true);
  });

  it('verified=true — проверенные, и строка несёт «когда»', async () => {
    const response = await list('?verified=true&limit=1');

    expect(response.body.total).toBe(TOTAL - UNVERIFIED);
    expect(response.body.data[0].verifiedAt).toBe('2026-09-15T12:00:00.000Z');
    // «Кем» разделу не отдаётся: в строке списка этого поля нет вовсе.
    expect('verifiedByUserId' in response.body.data[0]).toBe(false);
  });

  it('без параметра выдача прежняя — старый клиент переживает выкатку', async () => {
    const response = await list('');

    expect(response.body.total).toBe(TOTAL);
  });

  it('мусор в параметре означает его отсутствие', async () => {
    const response = await list('?verified=yes');

    expect(response.body.total).toBe(TOTAL);
  });

  it('отбор складывается с типом и состоянием: верификация — не видимость', async () => {
    // Скрытая непроверенная публикация в очереди «непроверенных» есть — она
    // просто скрыта. Отбор по проверенности не подменяет отбор по состоянию.
    await harness.write('clubs', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Клуб 1',
        slug: 'club-1',
        description: 'Описание',
        shortDescription: 'Кратко',
        address: 'ул. Ленина, 1',
        phone: '+7 900 000-00-00',
        coordinates: { lat: 53.2, lng: 50.1 },
        priceFrom: 500,
        distanceKm: 1,
        city: 'Самара',
        sportIds: [3],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 4,
        reviewCount: 0,
        status: 'hidden',
      },
    ]);

    // Запись пересобирает базу и гасит сессии — cookie берётся заново.
    adminCookie = await harness.as(3);

    const all = await list('?verified=false');
    const hiddenOnly = await list('?verified=false&status=hidden');

    expect(all.body.total).toBe(1);
    expect(hiddenOnly.body.total).toBe(1);
  });
});
