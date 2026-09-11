// Тесты уведомлений. Проверяются обе особенности: счётчики внутри `data`
// и молчаливое отбрасывание чужих идентификаторов при удалении.
//
// Фаза 34 убрала отсюда `userId` — и из тела, и из строки запроса. Раньше лента
// принадлежала тому, чей номер назвали: `GET /api/notifications?userId=2` отдавал
// чужие уведомления, а `read-all` с чужим номером помечал прочитанным чужое.
// Теперь адресат — всегда владелец сессии, а полный срез площадки (`?scope=all`)
// закрыт правом `use_admin_tools`.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections, fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

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
    // `?scope=all` отдаёт уведомления всех людей разом. До фазы 34 для этого хватало
    // одного параметра в строке запроса — без входа вообще.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?scope=all')
      .set('Cookie', firstCookie);

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав');
    expect(response.body.data).toBeUndefined();
  });

  it('полный срез ленты площадки гостю закрыт', async () => {
    const response = await request(harness.app.getHttpServer()).get('/api/notifications?scope=all');

    expect(response.status).toBe(401);
  });

  it('администратору полный срез отдаётся целиком', async () => {
    // Обратная сторона отказа: право есть — выдача обязана работать, иначе
    // проверка прав превратилась бы в поломку раздела.
    const response = await request(harness.app.getHttpServer())
      .get('/api/notifications?scope=all')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body.data.items).toHaveLength(5);
    expect(response.body.data.total).toBe(5);
    expect(response.body.data.unreadCount).toBe(4);
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
      notifications: Array.from({ length: 150 }, (_, index) => ({
        id: index + 1,
        createdAt: new Date(Date.UTC(2026, 1, 1, 0, index)).toISOString(),
        userId: 1,
        type: 'booking_created',
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
    expect(
      await feedSize(`?clubId=${clubId}`),
      'настройка задним числом убрала пришедшее',
    ).toBe(before);
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
