// Тесты административных маршрутов.
//
// Фаза 34 меняет здесь основание проверки. Раньше исполнитель приходил в теле
// (`adminUserId`), и «администратор» означал «клиент прислал номер, у которого
// в хранилище стоит роль admin»: подставил чужую цифру — стал кем угодно.
// Теперь исполнитель берётся из сессии, а весь раздел закрыт правом
// `use_admin_tools`.
//
// Отсюда три группы проверок вместо одной: что администратору положено, что гость
// и обычные роли не проходят вовсе, и что тело запроса на личность больше не влияет.

import { verify } from '@node-rs/argon2';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/**
 * Все маршруты раздела разом.
 *
 * Список нужен именно списком: проверки «гостя не пускают» и «обычной роли не
 * положено» обязаны накрывать раздел целиком, а не тот маршрут, про который
 * вспомнили. Маршрут, дописанный в контроллер завтра, добавляется сюда одной
 * строкой — и сразу попадает под обе проверки.
 */
const ADMIN_ROUTES = [
  { method: 'delete', path: '/api/admin/bookings/1' },
  { method: 'post', path: '/api/admin/trainer-club-links/1/force-revoke' },
  { method: 'post', path: '/api/admin/users/1/password' },
  { method: 'post', path: '/api/admin/users/1/recompute-reliability' },
] as const;

describe('Административные маршруты', () => {
  let harness: TestHarness;
  // ⚠️ Cookie выдаются в beforeEach ПОСЛЕ засева и заново на каждый кейс: перенос
  // среза пересобирает базу целиком, а сессии живут в ней же обычной таблицей.
  // Сессия, выданная до засева, умерла бы вместе с ним — и кейс покраснел бы
  // отказом в доступе, к которому проверка не имеет отношения.
  let adminCookie: string;
  let athleteCookie: string;
  let providerCookie: string;

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
          name: 'Атлет',
          email: 'a@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
        },
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Провайдер',
          email: 'p@test.local',
          phone: '+7 (900) 000-00-02',
          passwordHash: DEMO_PASSWORD_HASH,
          favoriteClubIds: [],
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

    adminCookie = await harness.as(3);
    athleteCookie = await harness.as(1);
    providerCookie = await harness.as(2);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('администратор удаляет запись и освобождает место', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/admin/bookings/1')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ success: true });

    const bookings = await harness.read<unknown[]>('bookings');
    expect(bookings).toHaveLength(0);

    const schedule = await harness.read<{ bookedCount: number }[]>('schedule');
    expect(schedule[0].bookedCount).toBe(0);
  });

  it('несуществующая запись — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .delete('/api/admin/bookings/99')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Запись не найдена');
  });

  it('принудительный разрыв связи уведомляет обе стороны и отвязывает услуги', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/trainer-club-links/1/force-revoke')
      .set('Cookie', adminCookie);

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
      .set('Cookie', adminCookie);

    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/trainer-club-links/1/force-revoke')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(409);
  });

  it('смена пароля администратором не требует текущего пароля', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/password')
      .set('Cookie', adminCookie)
      .send({ newPassword: 'fresh-password-99' });

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
      .set('Cookie', adminCookie)
      .send({ newPassword: '123' });

    expect(response.status).toBe(400);
  });

  it('пересчёт надёжности только пишет запись в журнал', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/recompute-reliability')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(200);

    const logs = await harness.read<{ action: string; entityId: number }[]>('logs');
    expect(logs[0]).toMatchObject({ action: 'reliability_recompute', entityId: 1 });
  });

  it('пересчёт для несуществующего пользователя — 404', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/99/recompute-reliability')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(404);
  });

  // Фаза 35, этап Э0a: ручное снятие санкций за неявки удалено вместе с самим
  // механизмом. Сторож — не «маршрут отвечает отказом», а «маршрута нет»: отказ
  // дал бы и живой маршрут при нехватке прав, и проверка молча ничего бы не значила.
  it('снятого маршрута ручного послабления больше нет — 404 даже администратору', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/lift-quarantine')
      .set('Cookie', adminCookie);

    expect(response.status).toBe(404);
  });

  it('смена пароля несуществующему пользователю — не найдено', async () => {
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/99/password')
      .set('Cookie', adminCookie)
      .send({ newPassword: 'новый-пароль' });

    expect(response.status).toBe(404);
  });

  it('гость не проходит ни на один маршрут раздела', async () => {
    // Отказ обязан быть именно 401, а не 400: четырёхсотый означал бы, что маршрут
    // успел разобрать чужое тело до проверки доступа.
    const offenders: string[] = [];

    for (const route of ADMIN_ROUTES) {
      const response = await request(harness.app.getHttpServer())
        [route.method](route.path)
        .send({ newPassword: 'подобранный-пароль' });

      if (response.status !== 401) {
        offenders.push(`${route.method} ${route.path} — ответил ${response.status} вместо 401`);
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);

    // И ни один отказ ничего не сделал по дороге.
    expect(await harness.read<unknown[]>('bookings')).toHaveLength(1);
    expect(await harness.read<unknown[]>('logs')).toHaveLength(0);
  });

  it('человеку без лиц услуг не положен ни один маршрут раздела', async () => {
    // Вход состоялся, права нет — это 403, а не 401. Разница существенная: 401
    // означает «войди», и клиент по нему отправляет пользователя на форму входа.
    //
    // ⚠️ Роли `athlete` больше нет (шаг 35.19): здесь просто человек, и раздел
    // закрыт ему потому, что шесть админских прав есть только у вида `admin`.
    const offenders: string[] = [];

    for (const route of ADMIN_ROUTES) {
      const response = await request(harness.app.getHttpServer())
        [route.method](route.path)
        .set('Cookie', athleteCookie)
        .send({ newPassword: 'взлом-пароля' });

      if (response.status !== 403 || response.body.error !== 'Недостаточно прав') {
        offenders.push(
          `${route.method} ${route.path} — ответил ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);

    // Ничего не изменилось и в журнал не попало: отказ случился до действия.
    expect(await harness.read<unknown[]>('bookings')).toHaveLength(1);
    expect(await harness.read<unknown[]>('logs')).toHaveLength(0);

    const users = await harness.read<{ passwordHash: string }[]>('users');
    expect(users[0].passwordHash).toBe(DEMO_PASSWORD_HASH);
  });

  it('владельцу лица услуг не положен ни один маршрут раздела', async () => {
    // ⚠️ Шаг 35.19 сменил СМЫСЛ этой проверки, не тронув её утверждений.
    //
    // Раньше она стерегла набор прав: у роли `club_owner` были свои пять прав,
    // и админский раздел мог открыться ей по ошибке в словаре. Своих прав
    // у неё больше нет — владение лицами услуг не даёт ни одного из шести
    // админских. Проверка от этого не устарела, а стала строже: теперь она
    // говорит, что владение публикациями к админке не ведёт ВООБЩЕ никак.
    //
    // Поэтому она и осталась отдельно от человека без лиц: пара «есть лица /
    // нет лиц» — единственное различие, которое сегодня могло бы просочиться
    // в решение о доступе.
    const offenders: string[] = [];

    for (const route of ADMIN_ROUTES) {
      const response = await request(harness.app.getHttpServer())
        [route.method](route.path)
        .set('Cookie', providerCookie)
        .send({ newPassword: 'взлом-пароля' });

      if (response.status !== 403 || response.body.error !== 'Недостаточно прав') {
        offenders.push(
          `${route.method} ${route.path} — ответил ${response.status} ${JSON.stringify(response.body)}`,
        );
      }
    }

    expect(offenders, offenders.join('\n')).toEqual([]);

    // Отказ обязан быть отказом: ни запись, ни журнал, ни пароль не тронуты.
    expect(await harness.read<unknown[]>('bookings')).toHaveLength(1);
    expect(await harness.read<unknown[]>('logs')).toHaveLength(0);

    const users = await harness.read<{ passwordHash: string }[]>('users');
    expect(users[0].passwordHash).toBe(DEMO_PASSWORD_HASH);
  });

  it('исполнитель берётся из сессии, а тело на него не влияет', async () => {
    // Главное следствие фазы: подсунуть чужой номер больше некуда. Под админской
    // сессией в теле лежит номер атлета — попади он в журнал, админское действие
    // выглядело бы действием атлета, и разбор инцидента пошёл бы по ложному следу.
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/recompute-reliability')
      .set('Cookie', adminCookie)
      .send({ adminUserId: 1, actorId: 1, actorRole: 'athlete' });

    expect(response.status).toBe(200);

    const logs = await harness.read<{ actorId: number; actorRole: string }[]>('logs');
    expect(logs[0]).toMatchObject({ actorId: 3, actorRole: 'admin' });
  });

  it('старое поле adminUserId в теле смены пароля отвергается', async () => {
    // Схема пароля строгая, и это здесь важно: клиент, продолжающий слать
    // `adminUserId`, обязан получить отказ, а не молча пройти. Иначе поле выглядело бы
    // рабочим ещё долго после того, как перестало что-либо значить.
    const response = await request(harness.app.getHttpServer())
      .post('/api/admin/users/1/password')
      .set('Cookie', adminCookie)
      .send({ adminUserId: 3, newPassword: 'fresh-password-99' });

    expect(response.status).toBe(400);

    const users = await harness.read<{ passwordHash: string }[]>('users');
    expect(users[0].passwordHash).toBe(DEMO_PASSWORD_HASH);
  });
});
