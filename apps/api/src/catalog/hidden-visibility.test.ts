// Сторож видимости скрытой публикации: ВСЕ пути отвечают одинаково (шаг 36.13a).
//
// ⚠️ Зачем сторож, а не набор отдельных проверок. До этой фазы проверки статуса
// в детальных маршрутах не было НИ ОДНОЙ: ни `GET /api/clubs/:id`, ни `/by-slug/:slug`,
// ни те же у тренеров, ни контекст слота статус не смотрели. Отсев жил только
// в списках и управлялся флагом из запроса — а флаг был открыт кому угодно.
// Проверено на живом приложении 10.09.2026: гость получал скрытую публикацию вместе
// с `hideReason`, `hiddenByUserId` (номером администратора) и `hiddenAt`.
//
// Закрыть один путь и считать работу сделанной легко: их шесть, и шестой —
// список тренеров клуба — заметен меньше всех. Поэтому пути перечислены СПИСКОМ
// и проверяются в цикле: правило, отвечающее «видно» всегда, обязано уронить все.
//
// ⚠️ Отказ — 404, а не 403. Отказ по правам сообщает, что публикация существует,
// и по нему её можно перечислить.

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Владелец публикации — 2, посторонний — 4, администратор — 3. */
const OWNER_ID = 2;
const STRANGER_ID = 4;
const ADMIN_ID = 3;

const user = (id: number, accountKind: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@hidden-visibility.test`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('скрытая публикация: шесть путей отвечают одинаково', () => {
  let harness: TestHarness;
  let server: () => INestApplication['getHttpServer'] extends never
    ? never
    : ReturnType<INestApplication['getHttpServer']>;

  beforeAll(async () => {
    harness = await createTestHarness('hidden-visibility');
    server = () => harness.app.getHttpServer();
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [user(OWNER_ID, 'person'), user(ADMIN_ID, 'admin'), user(STRANGER_ID, 'person')],
      clubs: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Скрытый клуб',
          slug: 'skrytyy-klub',
          description: 'Описание',
          shortDescription: 'Кратко',
          city: 'Самара',
          address: 'ул. Ленина, 1',
          phone: '+7 (846) 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          sportIds: [1],
          imageUrls: [],
          amenityIds: [],
          tagIds: [],
          rating: 0,
          reviewCount: 0,
          priceFrom: 1000,
          distanceKm: 0,
          managedByUserId: OWNER_ID,
          status: 'hidden',
          hideReason: 'Жалоба',
          hiddenByUserId: ADMIN_ID,
          hiddenAt: '2026-04-01T00:00:00.000Z',
          hiddenKind: 'moderation',
        },
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Скрытый тренер',
          slug: 'skrytyy-trener',
          bio: 'Описание',
          avatarUrl: '',
          experienceYears: 5,
          specialtyIds: [1],
          sportIds: [1],
          workFormatIds: [1],
          rating: 0,
          reviewCount: 0,
          priceFrom: 1000,
          city: 'Самара',
          address: 'ул. Ленина, 2',
          phone: '+7 (900) 000-00-02',
          coordinates: { lat: 53.2, lng: 50.1 },
          managedByUserId: OWNER_ID,
          status: 'hidden',
          hideReason: 'Жалоба',
          hiddenByUserId: ADMIN_ID,
          hiddenAt: '2026-04-01T00:00:00.000Z',
          hiddenKind: 'moderation',
        },
      ],
      offerings: [],
      schedule: [],
      bookings: [],
      reviews: [],
      notifications: [],
      logs: [],
      'trainer-club-links': [],
      'provider-client-notes': [],
    });
  });

  /**
   * Шесть путей к скрытой публикации.
   *
   * `carriesHidden` — как понять, что скрытое всё-таки уехало наружу. У карточки
   * это код ответа, у списка — наличие публикации в теле.
   */
  const PATHS = [
    { what: 'карточка клуба по номеру', path: '/api/clubs/1', kind: 'detail' as const },
    {
      what: 'карточка клуба по адресу-ссылке',
      path: '/api/clubs/by-slug/skrytyy-klub',
      kind: 'detail' as const,
    },
    { what: 'карточка тренера по номеру', path: '/api/trainers/1', kind: 'detail' as const },
    {
      what: 'карточка тренера по адресу-ссылке',
      path: '/api/trainers/by-slug/skrytyy-trener',
      kind: 'detail' as const,
    },
    { what: 'список каталога', path: '/api/clubs', kind: 'list' as const },
    {
      what: 'список каталога с флагом «показать скрытые»',
      path: '/api/clubs?includeHidden=true',
      kind: 'list' as const,
    },
    {
      what: 'список тренеров с флагом «показать скрытые»',
      path: '/api/trainers?includeHidden=true',
      kind: 'list' as const,
    },
  ];

  for (const route of PATHS) {
    it(`гость не получает скрытую публикацию: ${route.what}`, async () => {
      const response = await request(server()).get(route.path);

      if (route.kind === 'detail') {
        expect(response.status).toBe(404);
      } else {
        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(0);
      }
    });

    it(`посторонний не получает скрытую публикацию: ${route.what}`, async () => {
      // ⚠️ Вошедший посторонний идёт ДРУГОЙ веткой, чем гость: сессия разобрана,
      // владения нет. Проверять только гостя — значит не проверять эту ветку вовсе.
      const response = await request(server())
        .get(route.path)
        .set('Cookie', await harness.as(STRANGER_ID));

      if (route.kind === 'detail') {
        expect(response.status).toBe(404);
      } else {
        expect(response.body.data).toHaveLength(0);
      }
    });
  }

  it('отказ гостю — 404, а не 403: по 403 публикацию можно перечислить', async () => {
    const response = await request(server()).get('/api/clubs/1');

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Клуб не найден');
  });

  it('скрытые поля не уходят наружу ни на одном пути', async () => {
    // Прямая проверка того, что нашли на живом приложении: гость получал
    // `hideReason`, `hiddenByUserId` и `hiddenAt`.
    for (const route of PATHS) {
      const response = await request(server()).get(route.path);
      const body = JSON.stringify(response.body);

      expect(body).not.toContain('hideReason');
      expect(body).not.toContain('Жалоба');
      expect(body).not.toContain('hiddenByUserId');
    }
  });

  it('ВЛАДЕЛЕЦ свою скрытую публикацию видит — иначе он её не починит', async () => {
    const cookie = await harness.as(OWNER_ID);

    const detail = await request(server()).get('/api/clubs/1').set('Cookie', cookie);
    expect(detail.status).toBe(200);

    const list = await request(server()).get('/api/clubs?includeHidden=true').set('Cookie', cookie);
    expect(list.body.data).toHaveLength(1);
  });

  it('МОДЕРАТОР видит скрытую публикацию и карточкой, и списком', async () => {
    const cookie = await harness.as(ADMIN_ID);

    const detail = await request(server()).get('/api/clubs/1').set('Cookie', cookie);
    expect(detail.status).toBe(200);

    const list = await request(server()).get('/api/clubs?includeHidden=true').set('Cookie', cookie);
    expect(list.body.data).toHaveLength(1);
  });

  it('владелец без флага скрытых не получает — флаг решает, а не владение', async () => {
    // Иначе публичная витрина владельца показывала бы ему его скрытые вперемешку
    // с чужими живыми, и он бы не понял, видит ли их кто-то ещё.
    const response = await request(server())
      .get('/api/clubs')
      .set('Cookie', await harness.as(OWNER_ID));

    expect(response.body.data).toHaveLength(0);
  });

  it('опубликованная публикация приходит всем — правило ничего не сужает сверх скрытых', async () => {
    // Контрольная группа. Без неё «гость не видит скрытую» было бы зелено и в случае,
    // когда гость не видит вообще ничего.
    await harness.write('clubs', [
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Живой клуб',
        slug: 'zhivoy-klub',
        description: 'Описание',
        shortDescription: 'Кратко',
        city: 'Самара',
        address: 'ул. Ленина, 3',
        phone: '+7 (846) 000-00-01',
        coordinates: { lat: 53.2, lng: 50.1 },
        sportIds: [1],
        imageUrls: [],
        amenityIds: [],
        tagIds: [],
        rating: 0,
        reviewCount: 0,
        priceFrom: 1000,
        distanceKm: 0,
        managedByUserId: OWNER_ID,
        status: 'published',
      },
    ]);

    const detail = await request(server()).get('/api/clubs/2');
    expect(detail.status).toBe(200);

    const list = await request(server()).get('/api/clubs');
    expect(list.body.data).toHaveLength(1);
  });
});
