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
 *
 * ⚠️ Как именно попадёт — и почему не «вызовом с пустым телом». Диверсия d-33
 * (новый изменяющий маршрут `PATCH /api/clubs/:id/nickname` без единой проверки)
 * сторожа НЕ покрасила: заявление в этом комментарии было, а таблица маршрутов
 * не читалась вовсе — `CASES` были выписаны руками. Ровно та ошибка, ради которой
 * фаза завела «тихие» диверсии, только в самом стороже.
 *
 * Позвать незнакомый маршрут вслепую нельзя: без настоящего тела отказ придёт
 * от РАЗБОРА (400), а не от владения, и сторож зеленел бы по чужой причине —
 * см. соседнее замечание про `check-in`. Поэтому обход требует не вызова,
 * а РЕШЕНИЯ: каждый изменяющий маршрут с параметром обязан быть либо описан
 * в `CASES` настоящим телом, либо назван в `NOT_ABOUT_OWNERSHIP` с причиной.
 * Забыть нельзя — незнакомый маршрут краснит сторожа и называет себя.
 */

import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { mutatingRoutesWithParam, routeKey } from './app-routes';
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
  // ⚠️ Связи клуба и тренера — тоже владение: решение по заявке принимает владелец
  // НАЗВАННОЙ стороны. Попали в сторожа не выбором автора, а обходом таблицы
  // маршрутов: до диверсии d-33 их здесь не было вовсе.
  {
    what: 'подтверждение чужой связи клуба и тренера',
    method: 'post',
    path: '/api/trainer-club-links/1/approve',
  },
  {
    what: 'отклонение чужой связи клуба и тренера',
    method: 'post',
    path: '/api/trainer-club-links/1/reject',
    body: { reason: 'Причина отказа, достаточно длинная для схемы.' },
  },
  {
    what: 'разрыв чужой связи клуба и тренера',
    method: 'post',
    path: '/api/trainer-club-links/1/revoke',
  },
];

/**
 * Коды, которыми маршрут вправе отказать в доступе к чужой вещи.
 *
 * ⚠️ `400` сюда НЕ входит намеренно. Отказ по разбору тела означает, что до проверки
 * владения дело не дошло, и засчитывать его как успех — значит завести сторожа,
 * который зелен по чужой причине.
 */
const REFUSAL_CODES = [401, 403, 404];

/**
 * Изменяющие маршруты с параметром, к владению отношения не имеющие.
 *
 * У каждого — причина, и она обязана быть про предмет, а не про удобство:
 * «здесь нечем владеть» или «здесь владение спрашивается о другом». Строка
 * без причины — это молчаливое исключение, то есть та самая дыра.
 */
const NOT_ABOUT_OWNERSHIP: Record<string, string> = {
  'post /api/auth/impersonate/:id':
    'Работа от чужого лица — вопрос административного полномочия, а не владения; закрыт `use_admin_tools`.',
  'post /api/bookings/:id/cancel':
    'Отменяют обе стороны сделки. Владение здесь выбирает СТОРОНУ отмены, а не право её сделать; проверено в стороже «сам себе», точка 6.',
  'delete /api/bookings/:id':
    'Отмена клиентом своей же записи. Владение проверяет сервис по номеру человека, предмет тот же — проверено ниже в `CASES`.',
  'patch /api/users/:id':
    'Своя учётная запись: цель всегда сам вошедший, чужой номер отвергается сравнением с сессией.',
  'patch /api/users/:id/notification-preferences':
    'Свои настройки. Чужое ЛИЦО закрыто отдельно — `users/notification-preferences-face.test.ts`.',
  'post /api/notifications/:id/read':
    'Чужое уведомление недостижимо: отбор идёт по адресату, а не по номеру строки.',
  'post /api/notifications/:id/unread':
    'Возврат строки в очередь (37.48). Основание то же, что у отметки: доступность решает адресат — человеческий ящик по владельцу, надзорная очередь по полномочию, — и чужая строка просто не попадает в отбор.',
  'patch /api/provider-client-notes/:id':
    'Заметка живёт при лице; владение спрашивается в маршруте и проверено в стороже «сам себе», точка 9.',
  'delete /api/provider-client-notes/:id': 'То же основание, что у правки заметки.',
  'delete /api/admin/bookings/:id':
    'Административное удаление записи: полномочие `manage_any_booking`, владения у администратора нет по определению.',
  'post /api/admin/trainer-club-links/:id/force-revoke':
    'Разрыв связи властью площадки — он и нужен затем, что своей связь администратору не является.',
  'post /api/admin/users/:id/password':
    'Смена чужого пароля администратором: полномочие `manage_any_user`.',
};

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
  });

  // ⚠️ Засев перед КАЖДЫМ тестом, а не один раз на набор. Наборы делят одну
  // тестовую схему, и соседний файл пересобирает базу своим `beforeEach` —
  // данные, засеянные один раз, из-под этого набора уезжают.
  //
  // ⚠️ Посторонний засеивается ВМЕСТЕ с фикстурами, одним вызовом: каждая запись
  // пересобирает базу целиком и гасит уже выданные сессии.
  beforeEach(async () => {
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

  it('каждый изменяющий маршрут с параметром либо проверен, либо объяснён', async () => {
    // ⚠️ Сердце сторожа и ответ на диверсию d-33. Таблица берётся у ПРИЛОЖЕНИЯ,
    // поэтому маршрут, написанный завтра, попадает сюда сам — и красит сторожа,
    // пока автор не решит, про владение он или нет.
    const routes = mutatingRoutesWithParam(harness.app);

    expect(routes.length, 'таблица маршрутов пуста — сторож ничего не обходит').toBeGreaterThan(10);

    // Путь у описанного действия конкретный (`/api/clubs/1`), у маршрута —
    // с параметром (`/api/clubs/:id`). Сводим к одному виду: числа в пути
    // становятся параметром.
    const covered = new Set(
      CASES.map((testCase) => `${testCase.method} ${testCase.path.replace(/\/\d+/g, '/:id')}`),
    );

    const unexplained = routes
      .map(routeKey)
      .filter((key) => !covered.has(key) && NOT_ABOUT_OWNERSHIP[key] === undefined);

    expect(
      unexplained,
      `изменяющие маршруты без решения о владении: ${unexplained.join(', ')}. ` +
        'Добавьте действие в CASES с настоящим телом — или причину в NOT_ABOUT_OWNERSHIP.',
    ).toEqual([]);
  });

  it('в объяснениях нет строк про несуществующие маршруты', async () => {
    // Иначе список исключений превращается в кладбище: маршрут переименовали,
    // строка осталась, и следующий с тем же именем проходит молча.
    const live = new Set(mutatingRoutesWithParam(harness.app).map(routeKey));
    const stale = Object.keys(NOT_ABOUT_OWNERSHIP).filter((key) => !live.has(key));

    expect(stale, `объяснения для исчезнувших маршрутов: ${stale.join(', ')}`).toEqual([]);
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
