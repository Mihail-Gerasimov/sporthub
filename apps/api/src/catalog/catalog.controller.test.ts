// Тесты новых маршрутов услуг и пользователей.
// Главный из них — про пароль: маршрут пользователей отдаёт то, что лежит
// в хранилище, и утечка хеша здесь была бы дороже всего остального в фазе.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections, fixtureDictionaryCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

/**
 * Хеш пароля тестового пользователя.
 *
 * Он же — образец для поиска утечки в теле ответа: значение заведомо узнаваемое,
 * поэтому найденное совпадение означает именно утечку, а не случайное сходство.
 */
const SECRET_HASH = '$argon2id$v=19$m=19456,t=2,p=1$c29sdHNvbHRzb2x0cw$очень-секретный-хеш';

/** Клуб-владелец первой услуги. Хозяина не имеет: он в этих проверках не участвует. */
const CLUB = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Клуб владельца',
  slug: 'owner-club',
  description: 'Описание клуба',
  shortDescription: 'Кратко',
  city: 'Самара',
  address: 'Ленина 1',
  phone: '+7 (900) 000-00-10',
  coordinates: { lat: 53.2, lng: 50.1 },
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  imageUrls: [],
  rating: 0,
  reviewCount: 0,
  priceFrom: 500,
  distanceKm: 0,
  source: 'seed',
  status: 'published',
};

/** Тренер-владелец второй услуги: номер 5 — по нему идёт фильтр в проверке ниже. */
const TRAINER = {
  id: 5,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Анна Миронова',
  slug: 'anna-mironova',
  bio: 'Биография',
  avatarUrl: '',
  experienceYears: 8,
  priceFrom: 900,
  sportIds: [3],
  specialtyIds: [],
  workFormatIds: [],
  rating: 0,
  reviewCount: 0,
  source: 'seed',
  status: 'published',
};

/** Общая часть услуги: проверки смотрят только на владельца и название. */
const offeringBase = {
  createdAt: '2026-01-01T00:00:00.000Z',
  sportId: 3,
  description: 'Описание услуги',
  format: 'group',
  price: 500,
  durationMinutes: 60,
  capacity: 10,
  address: 'Ленина 1',
  coordinates: { lat: 53.2, lng: 50.1 },
};

describe('Маршруты услуг и пользователей', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('catalog-http');

    // Один перенос на весь срез: у базы услуга ссылается и на владельца, и на вид
    // спорта внешними ключами, поэтому справочники, клуб и тренер обязаны приехать
    // вместе с самими услугами — отдельной записью услугу было бы не вставить.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      clubs: [CLUB],
      trainers: [TRAINER],
      offerings: [
        { ...offeringBase, id: 1, ownerType: 'club', ownerId: CLUB.id, title: 'Клубная' },
        { ...offeringBase, id: 2, ownerType: 'trainer', ownerId: TRAINER.id, title: 'Тренерская' },
      ],
      users: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Иван',
          email: 'ivan@test.local',
          phone: '+7 (900) 000-00-00',
          passwordHash: SECRET_HASH,
          favoriteClubIds: [],
        },
        // Администратор нужен самому набору: список пользователей после фазы 34
        // отдаётся только под его правом.
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          accountKind: 'admin',
          name: 'Админ',
          email: 'admin@test.local',
          phone: '+7 (900) 000-00-01',
          passwordHash: SECRET_HASH,
          favoriteClubIds: [],
        },
      ],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  describe('GET /offerings', () => {
    it('без фильтров отдаёт все услуги', async () => {
      const response = await request(harness.app.getHttpServer()).get('/api/offerings');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    it('фильтрует по владельцу', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/api/offerings?ownerType=trainer&ownerId=5',
      );

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].title).toBe('Тренерская');
    });

    it('неверный тип владельца отклоняется', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/api/offerings?ownerType=xxx&ownerId=1',
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Некорректные параметры запроса',
      });
    });

    it('нечисловой идентификатор владельца отклоняется', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/api/offerings?ownerType=club&ownerId=abc',
      );

      expect(response.status).toBe(400);
    });
  });

  describe('GET /users', () => {
    it('отдаёт пользователей администратору', async () => {
      const response = await request(harness.app.getHttpServer())
        .get('/api/users')
        .set('Cookie', await harness.as(2));

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      expect(response.body.data[0].email).toBe('ivan@test.local');
    });

    it('⚠️ гостю почты и телефоны платформы не отдаются вовсе', async () => {
      // Главная дыра, найденная аудитом: до фазы 34 маршрут отдавал почты
      // и телефоны ВСЕХ зарегистрированных любому, кто попросит.
      const response = await request(harness.app.getHttpServer()).get('/api/users');

      expect(response.status).toBe(401);
      expect(JSON.stringify(response.body)).not.toContain('ivan@test.local');
    });

    it('⚠️ обычному пользователю список тоже не отдаётся', async () => {
      // Вошёл — не значит «вправе видеть всех». Спортсмену список не положен.
      const response = await request(harness.app.getHttpServer())
        .get('/api/users')
        .set('Cookie', await harness.as(1));

      expect(response.status).toBe(403);
      expect(JSON.stringify(response.body)).not.toContain('ivan@test.local');
    });

    it('⚠️ ни пароль, ни его хеш не уходят наружу ни в каком виде', async () => {
      const response = await request(harness.app.getHttpServer())
        .get('/api/users')
        .set('Cookie', await harness.as(2));

      expect(response.body.data[0]).not.toHaveProperty('password');
      expect(response.body.data[0]).not.toHaveProperty('passwordHash');
      // Дополнительная страховка: ищем значение хеша во всём теле ответа.
      expect(JSON.stringify(response.body)).not.toContain('очень-секретный-хеш');
      expect(JSON.stringify(response.body)).not.toContain('$argon2');
    });
  });
});

describe('Клиенты провайдера', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('users-clients');
  });

  beforeEach(async () => {
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  // ⚠️ «Провайдер» здесь и ниже — не роль, а человек с лицами услуг: с шага
  // 35.19b режим открывает владение клубом или карточкой тренера, и ничто больше.
  it('владелец лиц услуг получает только своих клиентов', async () => {
    // ⚠️ Ради этого режим и заведён. Закрыв маршрут целиком, фаза уронила кабинет
    // провайдера: страницы заявок и клиентов подписывают атлета именем и падали
    // пятисоткой. Нашлось на поднятом приложении — тесты этого не ловили.
    const response = await request(harness.app.getHttpServer())
      .get('/api/users?scope=clients')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(200);

    // Контрольная группа: в ответе нет тех, кто к этому провайдеру не ходил.
    const all = await request(harness.app.getHttpServer())
      .get('/api/users')
      .set('Cookie', await harness.as(3));

    expect(response.body.data.length).toBeLessThan(all.body.data.length);
  });

  it('человеку без лиц услуг режим клиентов закрыт отказом, а не пустотой', async () => {
    // ⚠️ Шаг 35.19b переписал условие этого режима: клиенты есть у того, у кого
    // есть лица услуг, а не у того, кому это положено по роли. Проверка от этого
    // не ослабла, но её смысл сместился — и вместе с ним появилась новая ловушка.
    //
    // Ловушка в том, что «лиц нет» легко превратить в пустой список: выборка по
    // пустому набору владельцев честно вернёт ноль строк, и маршрут ответит 200.
    // Читается это как «клиентов пока нет», хотя спрашивать было нечего вовсе.
    // Поэтому сверяется не только код, но и то, что данных в ответе НЕТ.
    const response = await request(harness.app.getHttpServer())
      .get('/api/users?scope=clients')
      .set('Cookie', await harness.as(1));

    expect(response.status).toBe(403);
    expect(response.body.error).toBe('Недостаточно прав');
    expect(response.body.data).toBeUndefined();
  });

  it('полный список провайдеру по-прежнему закрыт', async () => {
    // Режим клиентов не открывает соседнюю дверь: почты и телефоны всей площадки
    // остаются под правом администратора.
    const response = await request(harness.app.getHttpServer())
      .get('/api/users')
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(403);
  });

  it('гостю не отдаётся ничего', async () => {
    expect(
      (await request(harness.app.getHttpServer()).get('/api/users?scope=clients')).status,
    ).toBe(401);
  });
});
