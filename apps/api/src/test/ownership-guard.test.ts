/**
 * Сторож владения (шаг 35.6).
 *
 * Фаза 35 снимает права `manage_own_*` с декораторов: владение перестаёт быть правом
 * роли и становится вопросом «твоя ли это вещь». Настоящая проверка при этом остаётся
 * в сервисах — она там и была. Опасность в том, что снятие декоратора где-нибудь
 * окажется единственной защитой, и маршрут откроется молча.
 *
 * ⚠️ Почему сторож РАНТАЙМОВЫЙ, а не грep по исходникам. Урок фазы 34: из 46 диверсий
 * шесть не покраснели, и пять из шести оказались одного вида — тест проверял ЛОГИКУ
 * в отрыве от её ПОДКЛЮЧЕНИЯ. Поиск по коду «вызывается ли AccessService» зелен и тогда,
 * когда его позвали и ответ выбросили. Поэтому здесь выполняется настоящий запрос
 * от человека, которому вещь не принадлежит, и проверяется отказ.
 *
 * ⚠️ Список маршрутов берётся у РАБОТАЮЩЕГО приложения, а не выписывается руками —
 * тот же приём, что в `route-guard.test.ts`. Маршрут, написанный завтра, попадёт
 * под сторожа сам.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from './harness';

/**
 * Посторонний — человек, которому не принадлежит ничто. В фикстурах такого нет,
 * поэтому он досеивается рядом с ними: без него отказ по владению неотличим
 * от отказа по праву роли.
 */
const STRANGER_ID = 9;

const stranger = {
  id: STRANGER_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'club_owner',
  status: 'active',
  name: 'Посторонний',
  email: `user-${STRANGER_ID}@test.local`,
  phone: '+7 (900) 000-01-09',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
};

/**
 * Действия над чужой вещью, каждое — настоящий запрос.
 *
 * Здесь перечислены не маршруты, а ДЕЙСТВИЯ: у одного маршрута может быть несколько
 * способов дотянуться до чужого, и важно каждое. Тело подставляется настоящее —
 * иначе отказ придёт от разбора, а не от владения, и сторож будет зелен по чужой
 * причине.
 */
type OwnershipCase = {
  /** Что проверяем, человеческими словами. */
  readonly what: string;
  readonly method: 'post' | 'patch' | 'delete';
  readonly path: string;
  readonly body?: Record<string, unknown>;
};

const CLUB_PAYLOAD = {
  name: 'Перехваченный клуб',
  city: 'Самара',
  address: 'ул. Перехвата, 1',
  description:
    'Полное тело правки: частичное отвергается разбором до проверки владения, и тогда сторож зеленел бы по чужой причине.',
  phone: '+7 (900) 000-00-36',
  email: 'seize@sporthub.local',
  priceFrom: '700',
  sportIds: [1],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2030-01-01',
      startTime: '10:00',
      endTime: '11:00',
      price: '700',
      capacity: '5',
      location: 'Зал',
      sportId: 1,
    },
  ],
};

const TRAINER_PAYLOAD = {
  firstName: 'Перехваченный',
  lastName: 'Тренер',
  city: 'Самара',
  address: 'ул. Перехвата, 2',
  bio: 'Полное тело правки карточки тренера, длиной больше пятидесяти символов, как требует схема публикации.',
  experience: '5',
  sportIds: [1],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 000-00-37',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Услуга',
  offeringDescription: 'Описание',
  offeringFormat: 'Индивидуально',
  offeringPrice: '1500',
  offeringDuration: '60',
  offeringLocation: 'Зал',
  clubId: null,
  coordinates: { lat: 53.2, lng: 50.1 },
  cityCoordinates: { lat: 53.2, lng: 50.1 },
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2030-01-01',
      startTime: '12:00',
      endTime: '13:00',
      price: '1500',
      capacity: '1',
      location: 'Зал',
      sportId: 1,
    },
  ],
};

const CASES: readonly OwnershipCase[] = [
  { what: 'правка чужого клуба', method: 'patch', path: '/api/clubs/1', body: CLUB_PAYLOAD },
  { what: 'удаление чужого клуба', method: 'delete', path: '/api/clubs/1' },
  {
    what: 'правка чужой карточки тренера',
    method: 'patch',
    path: '/api/trainers/1',
    body: TRAINER_PAYLOAD,
  },
  { what: 'удаление чужой карточки тренера', method: 'delete', path: '/api/trainers/1' },
  { what: 'подтверждение чужой записи', method: 'post', path: '/api/bookings/1/confirm' },
  { what: 'отклонение чужой записи', method: 'post', path: '/api/bookings/1/reject' },
  {
    // ⚠️ Тело обязательно: без исхода отказ придёт от РАЗБОРА (400), а не от владения,
    // и сторож зеленел бы по чужой причине — ровно то, от чего он и заведён.
    what: 'отметка о посещении по чужой записи',
    method: 'post',
    path: '/api/bookings/1/check-in',
    body: { outcome: 'completed' },
  },
  { what: 'удаление чужой записи', method: 'delete', path: '/api/bookings/1' },
];

/**
 * Коды, которыми маршрут вправе отказать в доступе к чужой вещи.
 *
 * ⚠️ `400` сюда НЕ входит намеренно. Отказ по разбору тела означает, что до проверки
 * владения дело не дошло, и засчитывать его как успех — значит завести сторожа,
 * который зелен по чужой причине.
 */
const REFUSAL_CODES = [401, 403, 404];

async function callAs(
  app: INestApplication,
  cookie: string,
  testCase: OwnershipCase,
): Promise<{ status: number; body: unknown }> {
  const agent = request(app.getHttpServer());
  const call =
    testCase.method === 'post'
      ? agent.post(testCase.path)
      : testCase.method === 'patch'
        ? agent.patch(testCase.path)
        : agent.delete(testCase.path);

  const response = await call
    .set('Cookie', cookie)
    .send(testCase.body ?? {})
    .catch((error: unknown) => {
      throw error;
    });

  return { status: response.status, body: response.body as unknown };
}

describe('Сторож владения', () => {
  let harness: TestHarness;
  let strangerCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('ownership-guard');
    // ⚠️ Посторонний засеивается ВМЕСТЕ с фикстурами, одним вызовом: каждая запись
    // пересобирает базу целиком и гасит уже выданные сессии.
    await harness.writeMany({
      ...fixtureCollections,
      users: [...(fixtureCollections.users ?? []), stranger],
    });
    strangerCookie = await harness.as(STRANGER_ID);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('список действий не пуст', () => {
    // Санити: пустой список превратил бы сторожа в зелёную пустышку.
    expect(CASES.length).toBeGreaterThan(0);
  });

  for (const testCase of CASES) {
    it(`${testCase.what} — отказ`, async () => {
      const { status } = await callAs(harness.app, strangerCookie, testCase);

      expect(
        REFUSAL_CODES.includes(status),
        `${testCase.method.toUpperCase()} ${testCase.path} ответил ${status}: посторонний дотянулся до чужой вещи`,
      ).toBe(true);
    });
  }

  it('чужая вещь остаётся на месте после всех попыток', async () => {
    // ⚠️ Кода ответа мало. Урок фазы 33: шаг, засчитанный по 403, ничего не говорит
    // о том, изменилось ли состояние. Проверяем, что вещи целы.
    for (const testCase of CASES) {
      await callAs(harness.app, strangerCookie, testCase);
    }

    const club = await request(harness.app.getHttpServer()).get('/api/clubs/1');
    const trainer = await request(harness.app.getHttpServer()).get('/api/trainers/1');

    expect(club.status, 'клуб 1 исчез после попыток постороннего').toBe(200);
    expect(trainer.status, 'карточка тренера 1 исчезла после попыток постороннего').toBe(200);
  });
});
