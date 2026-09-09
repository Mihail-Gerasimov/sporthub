// Сверка с эталоном контрактов.
//
// Эталон снят с прежнего бэкенда до его удаления (contracts/contract-snapshot.json).
// Здесь те же вызовы идут на новый сервер, и ответы обязаны совпасть: это
// и есть проверка главного обещания фазы — поведение не изменилось.
//
// Расхождения, найденные и принятые осознанно, перечислены в KNOWN_DIFFERENCES
// вместе с причиной. Пустой список означал бы, что переезд прошёл совсем
// незаметно для клиента; каждая запись в нём — обещание, которое пришлось
// изменить, и она должна быть объяснима.
//
// Значения меток времени сравнивать нельзя — они зависят от момента вызова, поэтому
// маскируются. Но вместе со значением пряталcя и вид записи, а он при переезде
// хранилища меняется первым: файл отдаёт строку, база — объект даты. Поэтому вид
// проверяется отдельным сторожем (`time-shape.ts`): значение по-прежнему не сравнивается,
// формат — сравнивается. Эталон снят с файлового хранилища, оно же и задаёт формат.

import { readFile } from 'node:fs/promises';
import path from 'node:path';

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  fixtureCollections,
  fixtureConfirmedLinkCollections,
  fixtureHistoricLinkCollections,
} from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';
import { ISO_TIME_SHAPE, VOLATILE_KEYS, collectTimeShapes } from './time-shape';

const SNAPSHOT_PATH = path.join(process.cwd(), '..', '..', 'contracts', 'contract-snapshot.json');

function normalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(normalize);
  }

  if (value && typeof value === 'object') {
    const result: Record<string, unknown> = {};

    for (const [key, item] of Object.entries(value as Record<string, unknown>)) {
      result[key] = VOLATILE_KEYS.has(key) && item !== undefined ? '<время>' : normalize(item);
    }

    return result;
  }

  return value;
}

/**
 * Принятые расхождения. Каждое — сознательное решение, а не случайность.
 */
const KNOWN_DIFFERENCES: Record<string, string> = {
  // Прежний сервер отвечал на неизвестный адрес-ссылку тем же телом, что и на
  // числовой идентификатор. Новый разделил эти случаи разными маршрутами.

  // --- Фаза 34: вход начал проверять пароль ---
  //
  // Оба вызова эталона снимались БЕЗ пароля — до фазы 34 маршрут пускал по одной
  // лишь почте, и клиент пароль даже не отправлял. Теперь пароль обязателен, поэтому
  // вызов без него не доходит до сверки и отбивается разбором тела (400).
  //
  // Отдельно: сам эталон не содержит ни одного УСПЕШНОГО входа — снимок делался
  // на почте, которой нет в фикстурах, и обе записи это ответ «не найден». То есть
  // вход как таковой сверкой контрактов не покрывался никогда; покрытие живёт
  // в `auth.controller.test.ts`.
  'POST /api/auth/login':
    'Фаза 34: пароль обязателен, вызов без него отбивается разбором тела (400 вместо 404).',
  'POST /api/auth/login (нет)':
    'Фаза 34: пароль обязателен, вызов без него отбивается разбором тела (400 вместо 404).',

  // --- Фаза 34: личность больше не приходит от клиента ---
  'POST /api/clubs (ошибка)':
    'Фаза 34: поле `userId` в теле публикации стало необязательным — владельца берут ' +
    'из сессии. Код ответа и текст прежние, из разбора ошибок пропала строка про `userId`.',

  // --- Фаза 34: отказ по правам приходит раньше, чем отказ по владению ---
  //
  // Оба случая раньше доходили до сервиса, и он отвечал своим подробным текстом.
  // Теперь запрос останавливает guard: у роли нет самого права на такое действие,
  // и до проверки «а его ли это вещь» дело не доходит. Код ответа тот же — 403.
  'POST /api/trainer-club-links (нет прав)':
    'Фаза 34: спортсмена останавливает право (`Недостаточно прав`), а не проверка владения.',
  'POST /api/moderation (не админ)':
    'Фаза 34: владельца клуба останавливает право (`Недостаточно прав`), а не проверка роли ' +
    'внутри маршрута.',

  // --- Фаза 34: запись в журнал с клиента убрана совсем ---
  'POST /api/logs':
    'Фаза 34: маршрут удалён — журнал пишет только сервер, исполнителя берёт из сессии. ' +
    'Раньше кто угодно мог записать действие от имени администратора.',
};

type SnapshotEntry = { status: number; body: unknown };

const clubForm = {
  name: 'Снимок Клуб',
  city: 'Самара',
  address: 'Ленина 1',
  description: 'Описание клуба для снимка контрактов, достаточно длинное чтобы пройти проверку.',
  phone: '+7 (900) 000-00-00',
  email: '',
  priceFrom: '1000',
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2026-04-01',
      startTime: '10:00',
      endTime: '11:00',
      price: '500',
      capacity: '10',
      location: 'Зал',
      sportId: 3,
    },
  ],
};

const trainerForm = {
  firstName: 'Снимок',
  lastName: 'Тренер',
  city: 'Самара',
  address: 'Ленина 2',
  bio: 'Описание тренера для снимка контрактов, достаточно длинное чтобы пройти проверку.',
  experience: '5',
  sportIds: [3],
  specialtyIds: [1],
  workFormatIds: [1],
  phone: '+7 (900) 000-00-00',
  vk: '',
  telegram: '',
  facebook: '',
  offeringName: 'Персональная',
  offeringDescription: 'Занятие один на один',
  offeringFormat: 'Индивидуальная',
  offeringPrice: '2000',
  offeringDuration: '60',
  offeringLocation: 'Зал',
  clubId: null,
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2026-04-02',
      startTime: '09:00',
      endTime: '10:00',
      price: '2000',
      capacity: '1',
      location: 'Зал',
      sportId: 3,
    },
  ],
};

type Call = {
  name: string;
  method: 'get' | 'post' | 'patch' | 'delete';
  url: string;
  body?: unknown;
  /** Дозасев перед вызовом: базовый срез для него неполон. */
  prepare?: (harness: TestHarness) => Promise<void>;
  /**
   * От чьего лица идёт вызов (фаза 34).
   *
   * ⚠️ Сверка контрактов проверяет ФОРМУ ответа, а не доступ к нему. После того как
   * маршруты закрылись, анонимный вызов возвращает 401 — и сверка перестала бы
   * сравнивать данные вообще, превратившись в проверку того, что всё закрыто.
   * Поэтому вызовы идут с сессией того, кому маршрут положен, а закрытость
   * проверяет отдельный сторож `route-guard.test.ts`.
   *
   * Номера соответствуют фикстурам: 1 — спортсмен, 2 — владелец клуба, 3 — админ.
   */
  as?: number;
};

const CALLS: Call[] = [
  { name: 'GET /api/sports', method: 'get', url: '/api/sports' },
  { name: 'GET /api/cities', method: 'get', url: '/api/cities' },
  { name: 'GET /api/clubs', method: 'get', url: '/api/clubs' },
  { name: 'GET /api/clubs?sportId=3', method: 'get', url: '/api/clubs?sportId=3' },
  {
    name: 'GET /api/clubs?sort=reliability',
    method: 'get',
    url: '/api/clubs?sort=reliability&dir=desc',
  },
  { name: 'POST /api/clubs', method: 'post', url: '/api/clubs', body: clubForm, as: 2 },
  {
    name: 'POST /api/clubs (ошибка)',
    method: 'post',
    url: '/api/clubs',
    body: { name: 'Плохо', as: 2 },
  },
  { name: 'GET /api/clubs/[id]', method: 'get', url: '/api/clubs/1' },
  { name: 'GET /api/clubs/[id] (нет)', method: 'get', url: '/api/clubs/999' },
  {
    name: 'PATCH /api/clubs/[id]',
    as: 2,
    method: 'patch',
    url: '/api/clubs/1',
    body: { ...clubForm, scheduleSlots: [{ ...clubForm.scheduleSlots[0], id: 1 }] },
  },
  {
    name: 'PATCH /api/clubs/[id] (чужой)',
    as: 1,
    method: 'patch',
    url: '/api/clubs/1',
    body: { ...clubForm },
  },
  // Клуб 3 в фикстурах без владельца, и удалить его теперь может только тот,
  // кому это разрешает право модерации. До фазы 34 бесхозную публикацию вместе
  // со всеми записями на занятия сносил кто угодно.
  { name: 'DELETE /api/clubs/[id]', method: 'delete', url: '/api/clubs/3', as: 3 },
  { name: 'GET /api/trainers', method: 'get', url: '/api/trainers' },
  {
    name: 'GET /api/trainers?clubId=1',
    method: 'get',
    url: '/api/trainers?clubId=1',
    prepare: (harness: TestHarness) => harness.writeMany(fixtureConfirmedLinkCollections),
  },
  { name: 'POST /api/trainers', method: 'post', url: '/api/trainers', body: trainerForm, as: 2 },
  {
    name: 'GET /api/trainers/[id]',
    method: 'get',
    url: '/api/trainers/1',
    // Ответ отдаёт `trainerClubLinkId: 1` при пустом `affiliatedClub`: связь есть,
    // но недействующая. Базовый срез её не держит — дозасеваем здесь.
    prepare: (harness: TestHarness) => harness.writeMany(fixtureHistoricLinkCollections),
  },
  { name: 'GET /api/trainers/[id] (нет)', method: 'get', url: '/api/trainers/999' },
  {
    name: 'PATCH /api/trainers/[id]',
    as: 2,
    method: 'patch',
    url: '/api/trainers/1',
    body: { ...trainerForm, scheduleSlots: [{ ...trainerForm.scheduleSlots[0], id: 1001 }] },
    // Правка сохраняет номер связи у услуги — значит, связь должна существовать.
    prepare: (harness: TestHarness) => harness.writeMany(fixtureHistoricLinkCollections),
  },
  { name: 'DELETE /api/trainers/[id]', method: 'delete', url: '/api/trainers/5', as: 2 },
  { name: 'GET /api/schedule', method: 'get', url: '/api/schedule' },
  {
    name: 'GET /api/schedule?ownerType=trainer',
    method: 'get',
    url: '/api/schedule?ownerType=trainer',
  },
  { name: 'GET /api/schedule (ошибка)', method: 'get', url: '/api/schedule?ownerType=owner' },
  { name: 'GET /api/reviews', method: 'get', url: '/api/reviews' },
  { name: 'GET /api/reviews?clubId=1', method: 'get', url: '/api/reviews?clubId=1' },
  {
    name: 'POST /api/reviews',
    as: 1,
    method: 'post',
    url: '/api/reviews',
    body: { trainerId: 1, rating: 5, text: 'Снимок' },
  },
  {
    name: 'POST /api/reviews (без адресата)',
    as: 1,
    method: 'post',
    url: '/api/reviews',
    body: { rating: 5, text: 'Снимок' },
  },
  { name: 'GET /api/bookings', method: 'get', url: '/api/bookings', as: 1 },
  {
    name: 'POST /api/bookings',
    as: 1,
    method: 'post',
    url: '/api/bookings',
    body: { scheduleId: 1001 },
  },
  {
    name: 'POST /api/bookings (не атлет)',
    as: 2,
    method: 'post',
    url: '/api/bookings',
    body: { scheduleId: 1001 },
  },
  {
    name: 'DELETE /api/bookings/[id]',
    as: 1,
    method: 'delete',
    url: '/api/bookings/3',
    body: {},
  },
  {
    name: 'POST /api/bookings/[id]/confirm',
    as: 2,
    method: 'post',
    url: '/api/bookings/3/confirm',
    body: {},
  },
  {
    name: 'POST /api/bookings/[id]/reject',
    as: 2,
    method: 'post',
    url: '/api/bookings/3/reject',
    body: { reason: 'Нет мест' },
  },
  {
    name: 'POST /api/bookings/[id]/cancel',
    as: 1,
    method: 'post',
    url: '/api/bookings/1/cancel',
    body: {},
  },
  {
    name: 'GET /api/trainer-club-links',
    as: 2,
    method: 'get',
    url: '/api/trainer-club-links',
    prepare: (harness: TestHarness) => harness.writeMany(fixtureConfirmedLinkCollections),
  },
  {
    name: 'POST /api/trainer-club-links',
    as: 2,
    method: 'post',
    url: '/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1 },
  },
  {
    name: 'POST /api/trainer-club-links (нет прав)',
    as: 1,
    method: 'post',
    url: '/api/trainer-club-links',
    body: { trainerId: 1, clubId: 1 },
  },
  { name: 'GET /api/notifications', method: 'get', url: '/api/notifications', as: 1 },
  {
    name: 'GET /api/notifications/unread-count',
    as: 1,
    method: 'get',
    url: '/api/notifications/unread-count',
  },
  {
    name: 'POST /api/notifications/read-all',
    as: 1,
    method: 'post',
    url: '/api/notifications/read-all',
    body: {},
  },
  {
    name: 'GET /api/provider-client-notes',
    as: 2,
    method: 'get',
    url: '/api/provider-client-notes',
  },
  {
    name: 'POST /api/provider-client-notes',
    as: 2,
    method: 'post',
    url: '/api/provider-client-notes',
    body: { clientUserId: 1, note: 'Снимок' },
  },
  { name: 'GET /api/logs', method: 'get', url: '/api/logs', as: 3 },
  {
    name: 'POST /api/logs',
    as: 3,
    method: 'post',
    url: '/api/logs',
    body: {
      action: 'admin_login',
      entityType: 'user',
      entityId: 3,
    },
  },
  { name: 'GET /api/publications', method: 'get', url: '/api/publications', as: 3 },
  {
    name: 'POST /api/moderation',
    as: 3,
    method: 'post',
    url: '/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, reason: 'Снимок' },
  },
  {
    name: 'POST /api/moderation (не админ)',
    as: 2,
    method: 'post',
    url: '/api/moderation',
    body: { action: 'hide', entityType: 'club', entityId: 1, reason: 'Снимок' },
  },
  { name: 'GET /api/analytics', method: 'get', url: '/api/analytics', as: 3 },
  {
    name: 'POST /api/auth/login',
    method: 'post',
    url: '/api/auth/login',
    body: { email: 'alexey@example.com', accountType: 'athlete' },
  },
  {
    name: 'POST /api/auth/login (нет)',
    method: 'post',
    url: '/api/auth/login',
    body: { email: 'nobody@example.com', accountType: 'athlete' },
  },
  {
    name: 'POST /api/auth/register',
    method: 'post',
    url: '/api/auth/register',
    body: {
      name: 'Новый',
      email: 'snapshot@example.com',
      password: 'secret1',
      accountType: 'athlete',
    },
  },
  {
    name: 'PATCH /api/users/[id]',
    as: 1,
    method: 'patch',
    url: '/api/users/1',
    body: { phone: '+7 (900) 111-22-33' },
  },
  {
    name: 'GET /api/users/[id]/notification-preferences',
    as: 1,
    method: 'get',
    url: '/api/users/1/notification-preferences',
  },
  {
    name: 'PATCH /api/users/[id]/notification-preferences',
    as: 1,
    method: 'patch',
    url: '/api/users/1/notification-preferences',
    body: { preferences: { booking_rejected: false } },
  },
  {
    name: 'DELETE /api/admin/bookings/[id]',
    as: 3,
    method: 'delete',
    url: '/api/admin/bookings/1',
    body: {},
  },
  {
    name: 'POST /api/admin/users/[id]/lift-quarantine',
    as: 3,
    method: 'post',
    url: '/api/admin/users/1/lift-quarantine',
    body: {},
  },
  {
    name: 'POST /api/admin/users/[id]/password',
    as: 3,
    method: 'post',
    url: '/api/admin/users/1/password',
    body: { newPassword: 'fresh-password-99' },
  },
  {
    name: 'POST /api/admin/users/[id]/recompute-reliability',
    as: 3,
    method: 'post',
    url: '/api/admin/users/1/recompute-reliability',
    body: {},
  },
];

describe('Сверка с эталоном контрактов прежнего бэкенда', () => {
  let harness: TestHarness;
  let expected: Record<string, SnapshotEntry>;

  beforeAll(async () => {
    // Никакой копии рабочего каталога: набор фиксирован в пакете фикстур.
    // Иначе после удаления `data/` сверку нельзя было бы запустить — а она
    // и есть главный признак того, что переезд ничего не сломал.
    harness = await createTestHarness('contract-parity');
    expected = JSON.parse(await readFile(SNAPSHOT_PATH, 'utf8')) as Record<string, SnapshotEntry>;
  });

  beforeEach(async () => {
    // Те же данные, что и при съёмке эталона: пакет фикстур общий. Срез идёт
    // ДАННЫМИ, а не записью файлов: у обвязки на базе директории данных нет вовсе.
    await harness.writeMany(fixtureCollections);
  });

  afterAll(async () => {
    await harness.close();
  });

  it('эталон покрывает все сверяемые вызовы', () => {
    const missing = CALLS.filter((call) => expected[call.name] === undefined).map(
      (call) => call.name,
    );

    expect(missing).toEqual([]);
  });

  for (const call of CALLS) {
    it(`${call.name} отвечает так же, как прежний бэкенд`, async () => {
      if (call.prepare) {
        await call.prepare(harness);
      }

      const agent = request(harness.app.getHttpServer());
      const cookie = call.as === undefined ? undefined : await harness.as(call.as);
      const pending = agent[call.method](call.url);

      if (cookie !== undefined) pending.set('Cookie', cookie);

      const response =
        call.body === undefined ? await pending : await pending.send(call.body as object);

      const actual = { status: response.status, body: normalize(response.body) };
      const reference = expected[call.name];

      // Вид записи каждой метки времени. Сравнение тела его не увидит: там маска.
      const wrongShape = collectTimeShapes(response.body).filter(
        (entry) => entry.shape !== ISO_TIME_SHAPE,
      );

      expect(wrongShape).toEqual([]);

      if (KNOWN_DIFFERENCES[call.name]) {
        expect(actual).not.toEqual(reference);

        return;
      }

      expect(actual).toEqual(reference);
    });
  }
});
