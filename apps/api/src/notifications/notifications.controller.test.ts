// Тесты уведомлений. Проверяются обе особенности: счётчики внутри `data`
// и молчаливое отбрасывание чужих идентификаторов при удалении.
//
// Фаза 34 убрала отсюда `userId` — и из тела, и из строки запроса. Раньше лента
// принадлежала тому, чей номер назвали: `GET /api/notifications?userId=2` отдавал
// чужие уведомления, а `read-all` с чужим номером помечал прочитанным чужое.
// Теперь адресат — всегда владелец сессии, а полный срез площадки (`?scope=all`)
// закрыт правом `use_admin_tools`.

import { RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA, ROUTE_ARGS_METADATA } from '@nestjs/common/constants';
import { RouteParamtypes } from '@nestjs/common/enums/route-paramtypes.enum';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections, fixtureDictionaryCollections } from '@sporthub/fixtures';

import { API_PREFIX } from '../configure-app';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import { NotificationsController } from './notifications.controller';

const notification = (id: number, over: Record<string, unknown>) => ({
  id,
  createdAt: `2026-02-0${id}T00:00:00.000Z`,
  userId: 1,
  type: 'booking_confirmed',
  payload: {},
  ...over,
});

/** Маршруты раздела: гостю обязан отвечать отказом каждый. */
const NOTIFICATION_ROUTES = [
  { method: 'get', path: '/api/notifications' },
  { method: 'get', path: '/api/notifications/unread-count' },
  { method: 'post', path: '/api/notifications/1/read' },
  { method: 'post', path: '/api/notifications/read-all' },
  { method: 'delete', path: '/api/notifications' },
] as const;

describe('Маршруты уведомлений', () => {
  let harness: TestHarness;
  // ⚠️ Cookie выдаются после засева: перенос среза пересобирает базу целиком,
  // а сессии лежат в ней обычной таблицей.
  let firstCookie: string;
  let secondCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-http');
  });

  beforeEach(async () => {
    // Пользователи и уведомления переносятся ОДНИМ срезом: каждая запись пересобирает
    // базу, и раздельные вызовы означали бы два переноса подряд ради одного набора.
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Алексей',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Пётр',
          email: 'p@test.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
          notificationPreferences: { booking_completed: false },
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Админ',
          email: 'ad@test.local',
          phone: '+7 (900) 000-00-03',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: [
        notification(1, {}),
        notification(2, { type: 'booking_rejected' }),
        notification(3, { readAt: '2026-02-05T00:00:00.000Z' }),
        notification(4, { userId: 2, type: 'booking_completed' }),
        notification(5, { userId: 2, type: 'booking_rejected' }),
      ],
    });

    firstCookie = await harness.as(1);
    secondCookie = await harness.as(2);
    adminCookie = await harness.as(3);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('GET отдаёт items, total и unreadCount внутри data', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(3);
    expect(response.body.data.unreadCount).toBe(2);
    expect(response.body.data.items).toHaveLength(3);
  });

  it('unreadOnly=true оставляет только непрочитанные', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', firstCookie);

    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([2, 1]);
  });

  it('пагинация режет выдачу, но не total', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?offset=1&limit=1')
      .set('Cookie', firstCookie);

    expect(response.body.data.items).toHaveLength(1);
    expect(response.body.data.total).toBe(3);
  });

  it('выключенная настройка НЕ прячет уже пришедшее', async () => {
    // ⚠️ Шаг 36.50, смена обещания. Прежде здесь проверялось обратное: строка
    // с выключенным типом создавалась и пряталась при чтении. Отсюда и росли три
    // ошибки подряд — прятали её трое (лента, счётчик, колокольчик), каждый по-своему.
    //
    // Теперь настройка решает при ОТПРАВКЕ (36.49): выключенного типа в базе нет,
    // а то, что уже пришло, остаётся в ленте. Это названная цена решения 22,
    // и человеку она сказана прямо на странице настроек.
    //
    // Что настройка действительно не пускает НОВОЕ — проверяет
    // `notification-delivery.test.ts`: там предмет проверки отсутствие строки,
    // а не её показ.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', secondCookie);

    // У человека 2 выключен `booking_completed`, и строка 4 такого типа лежит
    // в базе с прежних времён. Она обязана остаться видимой.
    expect(response.body.data.items.map((item: { id: number }) => item.id).sort()).toEqual([4, 5]);
    expect(response.body.data.unreadCount).toBe(2);
  });

  it('счётчик непрочитанных отдаётся отдельным маршрутом', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications/unread-count')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ unreadCount: 2 });
  });

  it('пометка прочитанным проставляет время', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/1/read')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.readAt).toBeDefined();
  });

  it('чужое уведомление отвечает «не найдено», а не отказом в правах', async () => {
    // Ответ намеренно не отличается от ответа на несуществующий номер: иначе
    // по коду можно было бы перебором выяснить, какие уведомления вообще есть.
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/4/read')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Уведомление не найдено');

    // И чужое уведомление осталось непрочитанным.
    const stored = await harness.read<{ id: number; readAt?: string }[]>('notifications');
    expect(stored.find((item) => item.id === 4)?.readAt).toBeUndefined();
  });

  it('read-all возвращает число обновлённых', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 2 });
  });

  it('удаление отбрасывает чужие идентификаторы молча', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', firstCookie)
      .send({ ids: [1, 4] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 1 });

    const stored = await harness.read<{ id: number }[]>('notifications');
    expect(stored.map((item) => item.id)).toEqual([2, 3, 4, 5]);
  });

  it('пустой список идентификаторов — 400', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', firstCookie)
      .send({ ids: [] });

    expect(response.status).toBe(400);
  });

  it('нечисловой идентификатор уведомления отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/abc/read')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректный id уведомления');
  });

  it('нечисловая постраничность отклоняется', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?offset=абв')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });

  it('гость не проходит ни на один маршрут раздела', async () => {
    const offenders: string[] = [];

    for (const route of NOTIFICATION_ROUTES) {
      const response = await request(harness.app.getHttpServer())
        [route.method](route.path)
        .send({ userId: 1, ids: [1] });

      if (response.status !== 401) {
        offenders.push(`${route.method} ${route.path} — ответил ${response.status} вместо 401`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);

    // Гостевые вызовы ничего не тронули: все пять уведомлений на месте.
    expect(await harness.read<unknown[]>('notifications')).toHaveLength(5);
  });

  it('userId в строке запроса не открывает чужую ленту', async () => {
    // Именно так чужие уведомления и читались до фазы 34 — одной цифрой в адресе.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?userId=2')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items.map((item: { id: number }) => item.id)).toEqual([3, 2, 1]);
  });

  it('userId в строке запроса не подменяет счётчик непрочитанных', async () => {
    // У второго пользователя непрочитанное одно, у первого — два. Ответ обязан
    // остаться про того, кто спрашивает.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications/unread-count?userId=2')
      .set('Cookie', firstCookie);

    expect(response.body.data).toEqual({ unreadCount: 2 });
  });

  it('userId в теле read-all не помечает чужую ленту', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all')
      .set('Cookie', firstCookie)
      .send({ userId: 2 });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 2 });

    // Уведомления второго пользователя остались непрочитанными.
    const stored =
      await harness.read<{ id: number; userId: number; readAt?: string }[]>('notifications');
    expect(stored.filter((item) => item.userId === 2).every((item) => !item.readAt)).toBe(true);
  });

  it('userId в теле удаления не даёт удалить чужое', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', firstCookie)
      .send({ userId: 2, ids: [4, 5] });

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ deleted: 0 });

    const stored = await harness.read<{ id: number }[]>('notifications');
    expect(stored).toHaveLength(5);
  });

  it('полный срез ленты площадки обычному пользователю закрыт', async () => {
    // `?scope=all` отдавал уведомления всех людей разом. До фазы 34 для этого хватало
    // одного параметра в строке запроса — без входа вообще.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?scope=all')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
  });

  it('полный срез ленты площадки гостю закрыт', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/notifications?scope=all');

    expect(response.status).toBe(401);
  });

  it('полный срез ленты площадки закрыт И АДМИНИСТРАТОРУ ТОЖЕ', async () => {
    // ⚠️ Утверждение ПЕРЕВЁРНУТО на шаге 37.19, а не удалено. Прежде здесь
    // проверялось обратное: «право есть — выдача обязана работать». Режим был
    // последним полным чтением ленты платформы в память и держался на одном
    // доводе — «нужен сводкам кабинета провайдера». Довод устарел: из веба маршрут
    // в этом режиме не зовётся ни разу.
    //
    // С появлением очереди надзора он стал ещё и опасен: отдал бы администратору
    // чужие надзорные строки вперемешку с личными лентами всех людей площадки.
    // Закрыт ОТКАЗОМ, а не молчаливым сужением: клиент, который его всё-таки звал,
    // обязан узнать об этом, а не получить половину ленты и счесть это нормой.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?scope=all')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
  });
});

/**
 * Ящики лиц (шаг 35.28).
 *
 * У человека с двумя лицами ящиков три: клуба, карточки тренера и личный. Набор
 * проверяет, что они РАЗНЫЕ на чтении, на счётчике и на «прочитать всё» — и что
 * чужое лицо назвать нечем.
 *
 * ⚠️ Ловушка 7.7 фазы 35: «прочитать всё» в ящике одного клуба не имеет права
 * погасить ящики остальных лиц. Операция массовая, необратимая и в один клик,
 * а прежний тест смотрел на репозиторий по `userId` и остался бы зелёным.
 */
describe('Ящики лиц', () => {
  let harness: TestHarness;
  let asOwner: string; // пользователь 2 — клуб 1 и карточка тренера 1
  let asStranger: string; // пользователь 1 — ни одного лица

  const face = (id: number, over: Record<string, unknown>) => ({
    id,
    createdAt: `2026-03-0${id}T00:00:00.000Z`,
    userId: 2,
    type: 'booking_requested',
    payload: {},
    ...over,
  });

  beforeAll(async () => {
    harness = await createTestHarness('notifications-mailboxes');
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          status: 'active',
          name: 'Посторонний',
          email: 'stranger@test.local',
          phone: '+7 (900) 000-00-11',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          status: 'active',
          name: 'Владелец двух лиц',
          email: 'owner@test.local',
          phone: '+7 (900) 000-00-12',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
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
          sportIds: [3],
          tagIds: [],
          amenityIds: [],
          imageUrls: [],
          rating: 4,
          reviewCount: 0,
          priceFrom: 500,
          distanceKm: 1,
          managedByUserId: 2,
          status: 'published',
        },
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина',
          slug: 'marina',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          priceFrom: 1000,
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Чужая карточка',
          slug: 'chuzhaya',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 3,
          priceFrom: 800,
          managedByUserId: 1,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 4,
          reviewCount: 0,
          status: 'published',
        },
      ],
      // Три ящика одного человека: клуб, карточка, личный — по два уведомления,
      // и все шесть непрочитанные.
      notifications: [
        face(1, { addresseeType: 'club', addresseeId: 1 }),
        face(2, { addresseeType: 'club', addresseeId: 1, type: 'link_requested' }),
        face(3, { addresseeType: 'trainer', addresseeId: 1 }),
        face(4, { addresseeType: 'trainer', addresseeId: 1, type: 'link_requested' }),
        face(5, { type: 'booking_confirmed' }),
        face(6, { type: 'booking_rejected' }),
      ],
      offerings: [],
      schedule: [],
      bookings: [],
      logs: [],
    });

    [asOwner, asStranger] = await Promise.all([harness.as(2), harness.as(1)]);
  });

  afterAll(async () => {
    await harness.close();
  });

  const get = (path: string, cookie: string) =>
    request(harness.app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  const ids = (response: { body: { data: { items: { id: number }[] } } }) =>
    response.body.data.items.map((item) => item.id).sort((a, b) => a - b);

  it('лента лица отдаёт только его ящик', async () => {
    const club = await get('/notifications?clubId=1', asOwner);
    const trainer = await get('/notifications?trainerId=1', asOwner);

    expect(ids(club)).toEqual([1, 2]);
    expect(ids(trainer)).toEqual([3, 4]);
  });

  it('личный ящик — это отсутствие лица, а не «всё моё»', async () => {
    const personal = await get('/notifications?scope=personal', asOwner);

    expect(ids(personal)).toEqual([5, 6]);
  });

  it('без параметров лента остаётся объединённой — старый клиент переживает выкатку', async () => {
    const all = await get('/notifications', asOwner);

    expect(ids(all)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(all.body.data.total).toBe(6);
  });

  it('счётчик непрочитанных считает по тому же ящику, что и лента', async () => {
    const club = await get('/notifications?clubId=1', asOwner);
    const counter = await get('/notifications/unread-count?clubId=1', asOwner);

    // Два числа об одном ящике: то, что в ленте, и то, что на колокольчике.
    expect(counter.body.data.unreadCount).toBe(club.body.data.unreadCount);
    expect(counter.body.data.unreadCount).toBe(2);
  });

  it('«прочитать всё» в ящике клуба не гасит ящики остальных лиц', async () => {
    // Ловушка 7.7. Без области действия один клик погасил бы все шесть строк.
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all?clubId=1')
      .set('Cookie', asOwner);

    expect(response.status).toBe(200);
    expect(response.body.data).toEqual({ updatedCount: 2 });

    const stored = await harness.read<{ id: number; readAt?: string }[]>('notifications');
    const read = stored.filter((item) => item.readAt !== undefined).map((item) => item.id);

    expect(read.sort()).toEqual([1, 2]);
  });

  it('«прочитать всё» без ящика по-прежнему гасит всё разом', async () => {
    // Обратная сторона: область действия не должна превратиться в «ничего
    // не гасим, пока не назвали лицо» — умолчание осталось прежним.
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all')
      .set('Cookie', asOwner);

    expect(response.body.data).toEqual({ updatedCount: 6 });
  });

  it('уведомление своему лицу помечается прочитанным и удаляется владельцем', async () => {
    // Проверка владения обязана понимать лицо: сузь её до личного ящика —
    // и владелец клуба получит «не найдено» на собственном уведомлении.
    const marked = await request(harness.app.getHttpServer())
      .post('/api/notifications/1/read')
      .set('Cookie', asOwner);

    expect(marked.status).toBe(200);
    expect(marked.body.data.readAt).toBeDefined();
    expect(marked.body.data.addresseeType).toBe('club');
    expect(marked.body.data.addresseeId).toBe(1);

    const removed = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', asOwner)
      .send({ ids: [3] });

    expect(removed.body.data).toEqual({ deleted: 1 });
  });

  it('чужое лицо назвать нечем — отказ, а не пустая лента', async () => {
    // Пустая лента читалась бы как «уведомлений пока нет» и прятала бы то,
    // что спрашивать было нечего.
    const foreign = await get('/notifications?trainerId=2', asOwner);

    expect(foreign.status).toBe(403);
    expect(foreign.body.error).toBe('Недостаточно прав');

    const counter = await get('/notifications/unread-count?trainerId=2', asOwner);
    expect(counter.status).toBe(403);

    const readAll = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all?trainerId=2')
      .set('Cookie', asOwner);
    expect(readAll.status).toBe(403);

    // И чужой ящик не тронут.
    const stored = await harness.read<{ readAt?: string }[]>('notifications');
    expect(stored.every((item) => item.readAt === undefined)).toBe(true);
  });

  it('человек без лиц не открывает ящик чужого лица', async () => {
    const response = await get('/notifications?clubId=1', asStranger);

    expect(response.status).toBe(403);
  });

  it('два лица разом — некорректные параметры', async () => {
    const response = await get('/notifications?clubId=1&trainerId=1', asOwner);

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные параметры запроса');
  });
});

/**
 * Сколько САМЫХ СТАРЫХ строк стенда отданы теме «связи».
 *
 * Число объявлено рядом со стендом и используется и в засеве, и в утверждениях:
 * две копии разъехались бы при первой же правке размера стенда, причём молча —
 * проверка продолжила бы сравнивать выдачу с числом, которого в базе уже нет.
 *
 * Сорок при потолке страницы в сто и ленте в сто пятьдесят строк выбраны так,
 * чтобы НИ ОДНА из них не попала в первую страницу: 150 − 40 = 110 > 100.
 */
const OLDEST_LINKS = 40;

describe('Постраничность ленты по умолчанию (шаг 35.45)', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-default-limit');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // Уведомлений заведомо больше потолка: иначе «страница ограничена» нечем
    // отличить от «их просто мало».
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Алексей',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      // ⚠️ Метка времени собирается своя: общий помощник рассчитан на девять строк
      // (`2026-02-0${id}`) и на сто пятидесяти даёт несуществующую дату.
      //
      // ⚠️ Ревизия 37.73. Прежде все сто пятьдесят строк были ОДНОГО типа, и стенд
      // умел проверять только постраничность. Теперь тем две, и распределены они
      // не случайно: сорок строк темы «связи» — САМЫЕ СТАРЫЕ, то есть в порядке
      // «новые сверху» они начинаются со сто одиннадцатой и в первую страницу
      // не попадают НИ ОДНОЙ. Отбор, сделанный в памяти поверх выданной сотни,
      // вернул бы на такой ленте ноль; отбор в запросе возвращает все сорок.
      notifications: Array.from({ length: 150 }, (_, index) => ({
        id: index + 1,
        createdAt: new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString(),
        userId: 1,
        type: index < OLDEST_LINKS ? 'link_requested' : 'booking_confirmed',
        payload: {},
      })),
      ...fixtureDictionaryCollections,
    });
  });

  it('лента без лимита отдаёт СТРАНИЦУ, а не всю историю', async () => {
    // ⚠️ Найдено нагрузкой. Потолок в сто строк существовал, но применялся только
    // к ЗАДАННОМУ лимиту: клиент, не назвавший его, получал ленту целиком, и цена
    // запроса росла вместе с историей человека. Постраничность была — просто
    // по умолчанию выключена.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', await harness.as(1));

    expect(response.status).toBe(200);
    expect(
      (response.body as { data?: { items?: unknown[] } }).data?.items?.length,
      'лента без лимита вернула больше страницы',
    ).toBe(100);
  });

  it('общее число едет рядом — дочитать остальное есть чем', async () => {
    // Страница без общего числа превращает постраничность в обрезание: клиент
    // не знает, есть ли что дальше.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', await harness.as(1));

    expect((response.body as { data?: { total?: number } }).data?.total).toBe(150);
  });

  it('названный лимит больше потолка срезается до потолка', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?limit=500')
      .set('Cookie', await harness.as(1));

    expect((response.body as { data?: { items?: unknown[] } }).data?.items?.length).toBe(100);
  });

  it('названный лимит меньше потолка соблюдается', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?limit=7')
      .set('Cookie', await harness.as(1));

    expect((response.body as { data?: { items?: unknown[] } }).data?.items?.length).toBe(7);
  });

  it('отбор по теме достаёт строки ИЗ-ЗА ПРЕДЕЛОВ первой страницы (37.18)', async () => {
    // ⚠️ Дыра покрытия, найденная ревизией 37.73. Обещание шага 37.18 —
    // «отбор по теме уходит в ЗАПРОС, а не делается в памяти», — до сих пор
    // проверялось на двух-трёх строках. На такой ленте отбор в памяти поверх
    // выданной страницы неотличим от отбора в запросе: обе страницы помещаются
    // целиком, и разницы нет.
    //
    // Здесь разница есть и она полная. Все сорок строк темы «связи» лежат
    // за сотой позицией, поэтому отбор в памяти вернул бы РОВНО НОЛЬ — и молча:
    // пустая лента читается как «таких событий нет».
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?group=links')
      .set('Cookie', await harness.as(1));

    expect(response.status).toBe(200);
    expect(
      (response.body as { data?: { total?: number } }).data?.total,
      'отбор по теме посчитал только то, что попало в первую страницу',
    ).toBe(OLDEST_LINKS);
    expect(
      (response.body as { data?: { items?: unknown[] } }).data?.items?.length,
      'отбор по теме отдал только то, что попало в первую страницу',
    ).toBe(OLDEST_LINKS);
    // И это действительно та тема, а не «что-нибудь сорок штук».
    expect(
      (response.body as { data: { items: { type: string }[] } }).data.items.every(
        (item) => item.type === 'link_requested',
      ),
    ).toBe(true);
  });

  it('отбор по теме НЕ отменяет постраничность', async () => {
    // Контрольная группа к предыдущей проверке. Без неё «отбор уехал в запрос»
    // было бы зелено и у реализации, которая на любой `group` отдаёт всю ленту
    // целиком: сорок строк она бы тоже отдала.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?group=booking')
      .set('Cookie', await harness.as(1));

    expect((response.body as { data?: { total?: number } }).data?.total).toBe(150 - OLDEST_LINKS);
    expect((response.body as { data?: { items?: unknown[] } }).data?.items?.length).toBe(100);
  });
});

describe('Настройки уведомлений ПРИМЕНЯЮТСЯ к своему ящику', () => {
  let harness: TestHarness;
  let cookie: string;
  let clubId: number;

  const OWNER_ID = 2;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-preferences-applied');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // ⚠️ Одним вызовом: каждая запись пересобирает базу и гасит выданные сессии,
    // поэтому cookie берётся строго ПОСЛЕ засева, а уведомления едут вместе
    // с фикстурами, а не отдельной записью.
    const own = (fixtureCollections.clubs ?? []).find((row) => row.managedByUserId === OWNER_ID);

    if (own === undefined) throw new Error('в фикстурах нет клуба владельца');

    clubId = own.id;

    await harness.writeMany({
      ...fixtureCollections,
      notifications: [
        {
          id: 9001,
          createdAt: '2026-05-01T10:00:00.000Z',
          userId: OWNER_ID,
          type: 'review_created',
          payload: {},
          addresseeType: 'club',
          addresseeId: clubId,
        },
        {
          id: 9002,
          createdAt: '2026-05-01T10:00:00.000Z',
          userId: OWNER_ID,
          type: 'review_created',
          payload: {},
        },
      ],
    });

    cookie = await harness.as(OWNER_ID);
  });

  /** Сколько строк отдаёт лента названного ящика. */
  async function feedSize(query: string): Promise<number> {
    const response = await request(harness.app.getHttpServer())
      .get(`/api/notifications${query}`)
      .set('Cookie', cookie);

    expect(response.status).toBe(200);

    return (response.body as { data?: { items?: unknown[] } }).data?.items?.length ?? 0;
  }

  /** Выключить тип в названном ящике. */
  async function disable(face?: { faceType: string; faceId: number }): Promise<void> {
    await request(harness.app.getHttpServer())
      .patch(`/api/users/${OWNER_ID}/notification-preferences`)
      .set('Cookie', cookie)
      .send({ preferences: { review_created: false }, ...(face ?? {}) })
      .expect(200);
  }

  it('настройка ЛИЦА сохраняется и читается обратно', async () => {
    // ⚠️ Шаг 36.50, смена обещания. Прежде здесь проверялось, что настройка лица
    // УМЕНЬШАЕТ ленту этого лица: `before - 1`. Так было, пока отбор стоял при чтении.
    //
    // Теперь настройка решает при отправке, и уже пришедшее она не трогает —
    // ни в ящике лица, ни в личном. Проверять «лента уменьшилась» стало нельзя:
    // это утверждение о поведении, которого больше нет.
    //
    // Что осталось проверять здесь: настройка лица долетает до хранилища и читается
    // обратно именно как настройка ЛИЦА. Что она не пускает новое — в
    // `notification-delivery.test.ts`, там проверяется отсутствие строки.
    const before = await feedSize(`?clubId=${clubId}`);

    expect(before, 'подготовка не удалась: в ящике лица пусто').toBeGreaterThan(0);

    await disable({ faceType: 'club', faceId: clubId });

    const saved = await request(harness.app.getHttpServer())
      .get(`/api/users/${OWNER_ID}/notification-preferences?faceType=club&faceId=${clubId}`)
      .set('Cookie', cookie)
      .expect(200);

    expect(
      saved.body.data.notificationPreferences.review_created,
      'настройка лица не сохранилась',
    ).toBe(false);

    // И ровно то, что теперь обещано: уже пришедшее осталось на месте.
    expect(await feedSize(`?clubId=${clubId}`), 'настройка задним числом убрала пришедшее').toBe(
      before,
    );
  });

  it('настройка ЛИЦА не глушит личный ящик', async () => {
    // Обратная половина: без неё «подействовало» неотличимо от «выключило всем».
    const before = await feedSize('?scope=personal');

    expect(before, 'подготовка не удалась: личный ящик пуст').toBeGreaterThan(0);

    await disable({ faceType: 'club', faceId: clubId });

    expect(await feedSize('?scope=personal'), 'настройка лица погасила личный ящик').toBe(before);
  });

  it('личная настройка не глушит ленту лица', async () => {
    // И третья сторона того же: ящики не протекают ни в одну сторону.
    const before = await feedSize(`?clubId=${clubId}`);

    await disable();

    expect(await feedSize(`?clubId=${clubId}`), 'личная настройка погасила ящик лица').toBe(before);
  });

  it('счётчик непрочитанных слушает те же настройки, что и лента', async () => {
    // ⚠️ Разойдясь, они дают «в колокольчике 3, в списке 0»: цифра есть,
    // а строк под ней нет.
    await disable({ faceType: 'club', faceId: clubId });

    const feed = await request(harness.app.getHttpServer())
      .get(`/api/notifications?clubId=${clubId}`)
      .set('Cookie', cookie);
    const counter = await request(harness.app.getHttpServer())
      .get(`/api/notifications/unread-count?clubId=${clubId}`)
      .set('Cookie', cookie);

    expect((counter.body as { data?: { unreadCount?: number } }).data?.unreadCount).toBe(
      (feed.body as { data?: { unreadCount?: number } }).data?.unreadCount,
    );
  });
});

// --- Шаги 37.15–37.19: очередь надзора как четвёртый адресат --------------------

describe('Очередь надзора в маршрутах уведомлений', () => {
  let harness: TestHarness;
  let personCookie: string;
  let adminCookie: string;
  let secondAdminCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-supervision');
  });

  beforeEach(async () => {
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Человек',
          email: 'person@sup.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Первый администратор',
          email: 'admin1@sup.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Второй администратор',
          email: 'admin2@sup.local',
          phone: '+7 (900) 000-00-03',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: [
        // Личная строка человека — контрольная группа: она не имеет права
        // появиться в очереди надзора, а надзорные — в его ленте.
        {
          id: 1,
          createdAt: '2026-02-01T00:00:00.000Z',
          addresseeKind: 'personal',
          userId: 1,
          type: 'booking_confirmed',
          payload: { subjectType: 'booking', subjectId: 1 },
        },
        {
          id: 2,
          createdAt: '2026-02-02T00:00:00.000Z',
          addresseeKind: 'supervision',
          type: 'publication_recheck_requested',
          payload: { subjectType: 'club', subjectId: 1 },
        },
        {
          id: 3,
          createdAt: '2026-02-03T00:00:00.000Z',
          addresseeKind: 'supervision',
          type: 'oversight_link_force_revoked',
          payload: { subjectType: 'link', subjectId: 1 },
        },
      ],
      // ⚠️ Журнал засевается вместе с очередью (ревизия 37.73). Он нужен
      // обратной проверке: уборка ОЧЕРЕДИ не имеет права уносить ИСТОРИЮ.
      // Это две разные обязанности — «что требует меня сейчас» и «что было,
      // если я пришёл искать», — и путать их нельзя ни в какую сторону.
      logs: [
        {
          id: 1,
          createdAt: '2026-02-02T00:00:00.000Z',
          action: 'moderation_hide',
          actorId: 2,
          actorRole: 'admin',
          entityType: 'club',
          entityId: 1,
        },
        {
          id: 2,
          createdAt: '2026-02-03T00:00:00.000Z',
          action: 'link_revoke',
          actorId: 2,
          actorRole: 'admin',
          entityType: 'trainer',
          entityId: 1,
        },
      ],
    });

    personCookie = await harness.as(1);
    adminCookie = await harness.as(2);
    secondAdminCookie = await harness.as(3);
  });

  afterAll(async () => {
    await harness.close();
  });

  const feed = (cookie: string, query = '') =>
    request(harness.app.getHttpServer())
      .get(`/api/notifications?scope=supervision${query}`)
      .set('Cookie', cookie);

  it('человеку очередь надзора закрыта ОТКАЗОМ, а не пустой лентой', async () => {
    // ⚠️ Пустая лента читается как «событий пока нет» и прячет то, что спрашивать
    // было нечего. Это правило раздела с фазы 35, и оно распространяется
    // на четвёртый вид адресата тоже.
    const response = await feed(personCookie);

    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
  });

  it('гостю очередь надзора закрыта', async () => {
    const response = await request(harness.app.getHttpServer()).get(
      '/api/notifications?scope=supervision',
    );

    expect(response.status).toBe(401);
  });

  it('ОБА администратора видят одну и ту же очередь', async () => {
    // Это и есть смысл общей очереди: событие одно, строка одна, видят все.
    const first = await feed(adminCookie);
    const second = await feed(secondAdminCookie);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(first.body.data.total).toBe(2);
    expect(second.body.data.total).toBe(2);
    expect(first.body.data.items.map((item: { id: number }) => item.id)).toEqual(
      second.body.data.items.map((item: { id: number }) => item.id),
    );
  });

  it('личная строка человека в очередь надзора не попадает', async () => {
    const response = await feed(adminCookie);

    expect(
      response.body.data.items.some((item: { type: string }) => item.type === 'booking_confirmed'),
    ).toBe(false);
  });

  it('надзорная строка не попадает в ленту человека', async () => {
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications')
      .set('Cookie', personCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].type).toBe('booking_confirmed');
  });

  it('счётчик значка считает очередь тем же способом, что и лента', async () => {
    // ⚠️ Именно расхождение этих двух чисел давало «в колокольчике 3, в списке 0»
    // дважды за две фазы. Поэтому они сверяются друг с другом, а не с константой.
    const list = await feed(adminCookie, '&unreadOnly=true');
    const badge = await request(harness.app.getHttpServer())
      .get('/api/notifications/unread-count?scope=supervision')
      .set('Cookie', adminCookie);

    expect(badge.status).toBe(200);
    expect(badge.body.data.unreadCount).toBe(list.body.data.total);
  });

  it('отбор по теме уходит в ЗАПРОС и режет очередь', async () => {
    const moderation = await feed(adminCookie, '&group=oversight_catalog');
    const links = await feed(adminCookie, '&group=oversight_admin');

    expect(moderation.body.data.total).toBe(1);
    expect(moderation.body.data.items[0].type).toBe('publication_recheck_requested');
    expect(links.body.data.total).toBe(1);
    expect(links.body.data.items[0].type).toBe('oversight_link_force_revoked');
  });

  it('неизвестная тема отвергается, а не расширяет выдачу молча', async () => {
    // Молчаливое расширение там, где просили сузить, — способ не заметить
    // опечатку в адресе и решить, что событий действительно нет.
    const response = await feed(adminCookie, '&group=nonsense');

    expect(response.status).toBe(400);
  });

  it('разобрал один — видно всем, и подпись называет его', async () => {
    const marked = await request(harness.app.getHttpServer())
      .post('/api/notifications/2/read')
      .set('Cookie', adminCookie);

    expect(marked.status).toBe(200);
    expect(marked.body.data.readByUserId).toBe(2);

    // Второй администратор видит строку уже разобранной.
    const second = await feed(secondAdminCookie, '&unreadOnly=true');

    expect(second.body.data.items.some((item: { id: number }) => item.id === 2)).toBe(false);
  });

  it('разбор НЕ перезаписывается вторым нажатием', async () => {
    // ⚠️ Прежде здесь стояли `findUnique` и безусловный `update` вне транзакции:
    // занявшимся оказывался нажавший последним, а не тот, кто взял дело.
    await request(harness.app.getHttpServer())
      .post('/api/notifications/2/read')
      .set('Cookie', adminCookie);

    const again = await request(harness.app.getHttpServer())
      .post('/api/notifications/2/read')
      .set('Cookie', secondAdminCookie);

    expect(again.status).toBe(200);
    expect(again.body.data.readByUserId).toBe(2);
  });

  it('два ОДНОВРЕМЕННЫХ разбора дают одного занявшегося (37.17)', async () => {
    // ⚠️ Дыра покрытия, найденная ревизией 37.73. Соседняя проверка выше —
    // ПОСЛЕДОВАТЕЛЬНАЯ: первый разбор успевает записаться целиком, и второй
    // приходит на уже разобранную строку. Именно этого случая гонка и не содержит.
    //
    // Механизм в коде верный (`updateMany` с условием `readAt: null`, один запрос
    // вместо пары «прочитал — записал»), доказательства не было. Здесь оба
    // администратора жмут «разобрать» одновременно, и очередь обязана назвать
    // ОДНОГО занявшегося — одного и того же в обоих ответах и в базе.
    const [first, second] = await Promise.all([
      request(harness.app.getHttpServer())
        .post('/api/notifications/2/read')
        .set('Cookie', adminCookie),
      request(harness.app.getHttpServer())
        .post('/api/notifications/2/read')
        .set('Cookie', secondAdminCookie),
    ]);

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);

    // Занявшийся один — и это НЕ «кто-то», а конкретный администратор.
    const winner = first.body.data.readByUserId;

    expect([2, 3], 'занявшимся оказался не тот, кто жал').toContain(winner);
    expect(second.body.data.readByUserId, 'два ответа назвали РАЗНЫХ занявшихся').toBe(winner);
    expect(second.body.data.readAt, 'два ответа назвали разное время разбора').toBe(
      first.body.data.readAt,
    );

    // База согласна с обоими ответами.
    const stored = (
      await harness.read<{ id: number; readAt?: string; readByUserId?: number }[]>('notifications')
    ).find((row) => row.id === 2);

    expect(stored?.readByUserId).toBe(winner);
    expect(stored?.readAt).toBe(first.body.data.readAt);

    // ⚠️ Вот эта половина и краснеет при снятии условия `readAt: null`.
    // Согласие двух ответов гонка гарантировать не может — оба перечитывают строку
    // после записи и увидели бы одно и то же даже у безусловной записи. А вот
    // ВТОРОЙ одновременный заход по уже разобранной строке безусловная запись
    // перепишет: сменится и подпись, и время.
    const secondRound = await Promise.all([
      request(harness.app.getHttpServer())
        .post('/api/notifications/2/read')
        .set('Cookie', adminCookie),
      request(harness.app.getHttpServer())
        .post('/api/notifications/2/read')
        .set('Cookie', secondAdminCookie),
    ]);

    for (const response of secondRound) {
      expect(response.body.data.readByUserId, 'повторный разбор переписал подпись').toBe(winner);
      expect(response.body.data.readAt, 'повторный разбор переписал время').toBe(
        first.body.data.readAt,
      );
    }
  });

  it('человек получает 403 на отметку надзорной строки, а не 404', async () => {
    // ⚠️ Утверждение исправлено после браузерного прогона (37.61). Прежде здесь
    // стоял 404, и это было враньё: строка есть, просто прав не хватает. Скрывать
    // её номер незачем — очередь не принадлежит никому конкретно и тайны не хранит.
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/2/read')
      .set('Cookie', personCookie);

    expect(response.status).toBe(403);
  });

  it('человек получает 403 и на возврат надзорной строки в очередь', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/2/unread')
      .set('Cookie', personCookie);

    expect(response.status).toBe(403);
  });

  it('чужая ЛИЧНАЯ строка по-прежнему отвечает «не найдено»', async () => {
    // Обратная сторона: здесь 404 остаётся и обязан остаться. Иначе по коду ответа
    // перебирались бы чужие номера — ровно то, от чего 404 и защищает.
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/1/read')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(404);
  });

  it('человек получает 403 на удаление надзорных строк, а не 200 с нулём', async () => {
    // ⚠️ Прежде такой запрос отвечал 200 с `deleted: 0`, то есть отказ выглядел
    // как успех: «удалил, просто удалять было нечего». Нашёл браузерный прогон.
    const response = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', personCookie)
      .send({ ids: [2, 3] });

    expect(response.status).toBe(403);

    const stillThere = await feed(adminCookie);

    expect(stillThere.body.data.total).toBe(2);
  });

  it('уборка разобранных строк НЕ трогает журнал (37.48)', async () => {
    // ⚠️ Обещание шага 37.48, не проверявшееся нигде (найдено ревизией 37.73).
    //
    // Очередь и журнал отвечают на разные вопросы: очередь — «что требует меня
    // СЕЙЧАС», журнал — «что было, если я пришёл искать». Поэтому разобранную
    // строку из очереди убирают — это нормальная работа с очередью, — и именно
    // поэтому уборка не имеет права уносить историю: иначе «прибраться в ленте»
    // означало бы стереть след администраторских действий, причём необратимо
    // и в один клик.
    const before = await harness.read<unknown[]>('logs');

    expect(before, 'стенд без журнала: проверять было бы нечего').toHaveLength(2);

    await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all?scope=supervision')
      .set('Cookie', adminCookie)
      .expect(200);

    const removed = await request(harness.app.getHttpServer())
      .delete('/api/notifications')
      .set('Cookie', adminCookie)
      .send({ ids: [2, 3] });

    // Контрольная группа: уборка действительно случилась. Без неё «журнал цел»
    // зелено и у маршрута, который не удаляет ничего.
    expect(removed.status).toBe(200);
    expect(removed.body.data.deleted).toBe(2);
    expect((await feed(adminCookie)).body.data.total).toBe(0);

    // А журнал — на месте, строка в строку.
    expect(await harness.read<unknown[]>('logs'), 'уборка очереди унесла журнал').toHaveLength(2);
  });

  it('строку можно ВЕРНУТЬ В ОЧЕРЕДЬ: разбор и подпись снимаются', async () => {
    // ⚠️ Без возврата очередь очередью не является: ошибочная отметка необратима
    // для всей команды — строка исчезает из «не разобрано» у всех сразу.
    await request(harness.app.getHttpServer())
      .post('/api/notifications/2/read')
      .set('Cookie', adminCookie);

    const returned = await request(harness.app.getHttpServer())
      .post('/api/notifications/2/unread')
      .set('Cookie', secondAdminCookie);

    expect(returned.status).toBe(200);
    expect(returned.body.data.readAt).toBeUndefined();
    expect(returned.body.data.readByUserId).toBeUndefined();

    // И это видно обоим: строка снова в работе.
    const unread = await feed(adminCookie, '&unreadOnly=true');

    expect(unread.body.data.items.some((item: { id: number }) => item.id === 2)).toBe(true);
  });

  it('«отметить всё» гасит очередь всем и подписывает разобравшего', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all?scope=supervision')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.updatedCount).toBe(2);

    const second = await feed(secondAdminCookie, '&unreadOnly=true');

    expect(second.body.data.total).toBe(0);
  });

  it('«отметить всё» в очереди не трогает личную ленту человека', async () => {
    await request(harness.app.getHttpServer())
      .post('/api/notifications/read-all?scope=supervision')
      .set('Cookie', adminCookie);

    const person = await request(harness.app.getHttpServer())
      .get('/api/notifications?unreadOnly=true')
      .set('Cookie', personCookie);

    expect(person.body.data.total).toBe(1);
  });
});

// --- Шаг 37.19: состояние разбора как ОТБОР, а не признак выданной строки -------

describe('Состояние разбора в отборе очереди (37.19)', () => {
  let harness: TestHarness;
  let adminCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-read-state');
  });

  beforeEach(async () => {
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Администратор',
          email: 'state@sup.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: [
        {
          id: 1,
          createdAt: '2026-02-01T00:00:00.000Z',
          addresseeKind: 'supervision',
          type: 'oversight_publication_created',
          payload: { subjectType: 'club', subjectId: 1 },
        },
        {
          id: 2,
          createdAt: '2026-02-02T00:00:00.000Z',
          addresseeKind: 'supervision',
          type: 'oversight_publication_hidden',
          payload: { subjectType: 'club', subjectId: 2 },
          readAt: '2026-02-03T00:00:00.000Z',
        },
      ],
    });

    adminCookie = await harness.as(1);
  });

  afterAll(async () => {
    await harness.close();
  });

  const feed = (query: string) =>
    request(harness.app.getHttpServer())
      .get(`/api/notifications?scope=supervision${query}`)
      .set('Cookie', adminCookie);

  it('без параметров видно ВСЁ — и разобранное тоже', async () => {
    // ⚠️ Разобранная строка не исчезает: она меняет состояние. Иначе «отметить»
    // означало бы «стереть», и вернуть её было бы нечем.
    const response = await feed('');

    expect(response.body.data.total).toBe(2);
  });

  it('«не разобрано» показывает только неразобранное', async () => {
    const response = await feed('&unreadOnly=true');

    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].id).toBe(1);
  });

  it('«разобрано» показывает только разобранное', async () => {
    // Этого отбора до шага 37.19 не существовало вовсе: сервер умел сказать
    // только «покажи непрочитанное», и вкладке «разобрано» пришлось бы фильтровать
    // выданную страницу — честно ровно до её потолка.
    const response = await feed('&readOnly=true');

    expect(response.body.data.total).toBe(1);
    expect(response.body.data.items[0].id).toBe(2);
  });

  it('оба состояния сразу — отказ, а не молчаливый выбор одного', async () => {
    const response = await feed('&unreadOnly=true&readOnly=true');

    expect(response.status).toBe(400);
  });

  it('счётчик неразобранного не зависит от выбранного состояния', async () => {
    // ⚠️ Значок показывает очередь, а не текущий отбор. Иначе переключение вкладки
    // на «разобрано» обнуляло бы значок — и человек решил бы, что дел не осталось.
    const onRead = await feed('&readOnly=true');

    expect(onRead.body.data.unreadCount).toBe(1);
  });
});

// --- Ревизия 37.73: право на очередь спрашивается на ВСЕХ её путях -------------

/**
 * Пути очереди надзора — СПРОШЕНЫ У КОНТРОЛЛЕРА, а не выписаны списком.
 *
 * ⚠️ Зачем так, а не константой. Шаг 37.15 обещал «очередь закрыта от человека»,
 * а проверен был один путь из трёх: лента. Счётчик значка и «отметить всё»
 * звались в наборе только админской cookie — то есть их отказ не проверял никто,
 * и снятие проверки в `resolveAudience` увидела бы ровно одна строка теста.
 *
 * Выписанный руками список закрыл бы сегодняшнюю дыру и завёл завтрашнюю:
 * четвёртый путь очереди в него забыли бы внести. Урок фазы 35 ровно про это —
 * сторож владения «брал маршруты у приложения» при списке, набранном вручную,
 * и диверсия его не покраснила.
 *
 * Путь очереди — это маршрут, у которого ЕСТЬ параметр `scope`: другого способа
 * попросить очередь не существует. Он и спрашивается — у метаданных самого
 * контроллера, из которых Nest строит маршруты. Новый такой маршрут попадёт
 * под проверку сам, без правки набора.
 */
function supervisionQueueRoutes(): { method: 'get' | 'post' | 'delete'; path: string }[] {
  const controllerPath = Reflect.getMetadata(PATH_METADATA, NotificationsController) as string;
  const prototype = NotificationsController.prototype as unknown as Record<string, unknown>;
  const methodNames = ['get', 'post', 'delete'] as const;
  const routes: { method: 'get' | 'post' | 'delete'; path: string }[] = [];

  for (const name of Object.getOwnPropertyNames(prototype)) {
    if (name === 'constructor') continue;

    // Аргументы маршрута лежат словарём «вид:позиция» → описание. Нужен ровно
    // один вид — параметр строки запроса, — и ровно одно имя: `scope`.
    const args =
      (Reflect.getMetadata(ROUTE_ARGS_METADATA, NotificationsController, name) as Record<
        string,
        { data?: unknown }
      > | null) ?? {};
    const takesScope = Object.entries(args).some(
      ([key, value]) =>
        key.startsWith(`${RouteParamtypes.QUERY}:`) &&
        (value as { data?: unknown }).data === 'scope',
    );

    if (!takesScope) continue;

    const handler = prototype[name] as object;
    const verb = Reflect.getMetadata(METHOD_METADATA, handler) as RequestMethod;
    const method = methodNames.find(
      (candidate) => RequestMethod[candidate.toUpperCase() as 'GET' | 'POST' | 'DELETE'] === verb,
    );

    if (method === undefined) continue;

    const methodPath = (Reflect.getMetadata(PATH_METADATA, handler) as string) ?? '/';
    const tail = methodPath === '/' || methodPath === '' ? '' : `/${methodPath}`;

    routes.push({ method, path: `/${API_PREFIX}/${controllerPath}${tail}` });
  }

  return routes;
}

describe('Право на очередь надзора спрашивается на ВСЕХ её путях (37.15)', () => {
  let harness: TestHarness;
  let personCookie: string;
  let adminCookie: string;

  const routes = supervisionQueueRoutes();
  /** Тот же список, но с подписью для названия проверки: «get /api/notifications». */
  const named = routes.map((route) => [`${route.method} ${route.path}`, route] as const);

  beforeAll(async () => {
    harness = await createTestHarness('notifications-supervision-paths');
  });

  beforeEach(async () => {
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Человек',
          email: 'person@paths.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Администратор',
          email: 'admin@paths.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: [
        {
          id: 1,
          createdAt: '2026-02-01T00:00:00.000Z',
          addresseeKind: 'supervision',
          type: 'oversight_publication_created',
          payload: { subjectType: 'club', subjectId: 1 },
        },
      ],
    });

    personCookie = await harness.as(1);
    adminCookie = await harness.as(2);
  });

  afterAll(async () => {
    await harness.close();
  });

  const call = (route: { method: 'get' | 'post' | 'delete'; path: string }, cookie?: string) => {
    const query = `${route.path}?scope=supervision`;
    const started = request(harness.app.getHttpServer())[route.method](query);

    return cookie === undefined ? started : started.set('Cookie', cookie);
  };

  it('пути очереди СОБРАНЫ, а не оказались пустым списком', () => {
    // ⚠️ Главная опасность обхода по собранному списку: сломается сбор — и цикл
    // пройдёт по нулю путей, оставшись зелёным. Поэтому список сверяется
    // с известными сегодня путями; четвёртый, появившись, просто добавится
    // к ним и попадёт в обход сам.
    expect(routes.map((route) => `${route.method} ${route.path}`).sort()).toEqual(
      expect.arrayContaining([
        'get /api/notifications',
        'get /api/notifications/unread-count',
        'post /api/notifications/read-all',
      ]),
    );
  });

  it.each(named)('человеку закрыт путь очереди «%s» — 403', async (_title, route) => {
    // ⚠️ До ревизии 37.73 это проверялось ровно на ленте. Счётчик значка
    // и «отметить всё» звались только админской cookie: снятие проверки
    // в `resolveAudience` они бы не заметили, а «отметить всё» вдобавок
    // ГАСИТ очередь всем сразу — отказ там дороже всего.
    const response = await call(route, personCookie);

    expect(response.status).toBe(403);
    expect(response.body.data).toBeUndefined();
  });

  it.each(named)('гостю закрыт путь очереди «%s» — 401', async (_title, route) => {
    const response = await call(route);

    expect(response.status).toBe(401);
  });

  it.each(named)('администратору путь очереди «%s» открыт', async (_title, route) => {
    // Контрольная группа. Без неё «человеку 403 везде» было бы зелено и у очереди,
    // закрытой для ВСЕХ, — то есть у неработающего раздела.
    const response = await call(route, adminCookie);

    expect(response.status).toBe(200);
  });
});

// --- Ревизия 37.73: отбор по теме на очереди БОЛЬШЕ страницы ------------------

/** Сколько самых старых строк очереди отданы теме «безопасность». */
const OLDEST_SECURITY = 40;

describe('Отбор очереди по теме честен за пределами страницы (37.18)', () => {
  let harness: TestHarness;
  let adminCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('notifications-supervision-volume');
  });

  beforeEach(async () => {
    // ⚠️ Очередь заведомо длиннее страницы: сто пятьдесят строк при потолке в сто.
    // Сорок строк темы «безопасность» — САМЫЕ СТАРЫЕ, то есть в порядке «новые
    // сверху» ни одна из них в первую страницу не попадает. Отбор, сделанный
    // в памяти поверх выданной сотни, вернул бы ноль.
    //
    // Для общей очереди это не теоретический случай: она копится по всей площадке
    // и переваливает за сотню быстрее любой человеческой ленты.
    await harness.writeMany({
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Администратор',
          email: 'admin@volume.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
      ],
      notifications: Array.from({ length: 150 }, (_, index) => ({
        id: index + 1,
        createdAt: new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString(),
        addresseeKind: 'supervision',
        ...(index < OLDEST_SECURITY
          ? {
              type: 'oversight_login_blocked',
              payload: { subjectType: 'user', subjectId: 1, accountExists: true },
            }
          : {
              type: 'oversight_publication_created',
              payload: { subjectType: 'club', subjectId: index + 1 },
            }),
      })),
    });

    adminCookie = await harness.as(1);
  });

  afterAll(async () => {
    await harness.close();
  });

  const feed = (query = '') =>
    request(harness.app.getHttpServer())
      .get(`/api/notifications?scope=supervision${query}`)
      .set('Cookie', adminCookie);

  it('без темы очередь отдаёт СТРАНИЦУ и общее число', async () => {
    // Контрольная группа: стенд действительно длиннее страницы, иначе следующая
    // проверка ничего не доказывала бы.
    const response = await feed();

    expect(response.status).toBe(200);
    expect(response.body.data.total).toBe(150);
    expect(response.body.data.items).toHaveLength(100);
  });

  it('тема достаёт строки ИЗ-ЗА ПРЕДЕЛОВ первой страницы', async () => {
    const response = await feed('&group=oversight_security');

    expect(response.body.data.total, 'тема посчитана по выданной странице').toBe(OLDEST_SECURITY);
    expect(response.body.data.items, 'тема отобрана по выданной странице').toHaveLength(
      OLDEST_SECURITY,
    );
    expect(
      response.body.data.items.every(
        (item: { type: string }) => item.type === 'oversight_login_blocked',
      ),
    ).toBe(true);
  });

  it('счётчик неразобранного считает тему тем же запросом, что и лента', async () => {
    // ⚠️ Расхождение этих двух чисел дважды за две фазы давало «в значке 3,
    // в списке 0». На стенде длиннее страницы отбор в памяти дал бы 0 и 40.
    const response = await feed('&group=oversight_security');

    expect(response.body.data.unreadCount).toBe(OLDEST_SECURITY);
  });

  it('тема НЕ отменяет постраничность', async () => {
    const response = await feed('&group=oversight_catalog');

    expect(response.body.data.total).toBe(150 - OLDEST_SECURITY);
    expect(response.body.data.items).toHaveLength(100);
  });
});
