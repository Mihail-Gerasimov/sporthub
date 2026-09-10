// Сверка с эталоном контрактов.
//
// Эталон лежит в `contracts/contract-snapshot.json`. Снят он был с прежнего бэкенда
// до его удаления и пережил два переезда — на NestJS и на PostgreSQL, — доказывая
// каждый раз, что поведение не изменилось.
//
// ⚠️ Фаза 34 изменила поведение сознательно: там, где раньше отдавались данные, теперь
// 401, а личность перестала приходить от клиента. Эталон переснят под новое поведение
// (шаг 34.60), и с этого момента он защищает уже его. Вызовы идут С СЕССИЕЙ того, кому
// маршрут положен: сверка проверяет ФОРМУ ответа, а закрытость — отдельный сторож
// `route-guard.test.ts`.
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
  fixtureBookings,
  fixtureCollections,
  fixtureConfirmedLinkCollections,
  fixtureHistoricLinkCollections,
} from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';
import { ISO_TIME_SHAPE, VOLATILE_KEYS, collectTimeShapes } from './time-shape';

const SNAPSHOT_PATH = path.join(process.cwd(), '..', '..', 'contracts', 'contract-snapshot.json');

export function normalize(value: unknown): unknown {
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
 * Причина, общая для семи выдач каталога (шаг 35.20a).
 *
 * Объявлена ОДНОЙ строкой, а не переписана семь раз: расхождение одно, и семь
 * его копий разъехались бы между собой при первой же правке текста.
 */
const OWNER_REMOVED_FROM_PUBLIC_CATALOG =
  'Шаг 35.20a: номер владельца (`managedByUserId`) убран из публичной выдачи ' +
  'каталога — по нему кто угодно строил карту «эти лица принадлежат одному ' +
  'человеку», скачав каталог одним запросом. Аффилиация показывается ' +
  'подтверждённой связью тренер↔клуб, а не техническим полем. Своё лицо человек ' +
  'берёт из ответа «кто я» (`faces`), администратор — из `GET /api/users`.';

/**
 * Принятые расхождения. Каждое — сознательное решение, а не случайность.
 */
const KNOWN_DIFFERENCES: Record<string, string> = {
  // ⚠️ Фаза 35 в работе. Каждая запись здесь — обещание, которое пришлось изменить,
  // и она держится ровно до шага 35.46: там эталон переснимается один раз, и список
  // снова становится пустым. Промежуточные пересъёмки обесценили бы сам список.
  'POST /api/trainer-club-links':
    'Шаг 35.10, решение заказчика 22: когда обе стороны связи принадлежат одному ' +
    'человеку, ждать нечего и спрашивать некого — связь встаёт сразу `confirmed`. ' +
    'Эталон снят на прежнем поведении, где она проходила через `pending`.',
  'PATCH /api/users/[id]':
    'Шаги 35.18 и 35.24: в ответе появился `accountKind` — вид учётной записи, ' +
    'и ушло поле `role`. Роль удалена вместе с колонкой: она не принимала ' +
    'решений, а «тренер» и «владелец клуба» выводятся из владения лицами услуг. ' +
    '`accountKind` необязателен, старый клиент его просто не читает; поле `role` ' +
    'старый клиент читать перестанет — это и есть изменённое обещание.',
  'PATCH /api/clubs/[id] (чужой)':
    'Шаг 35.19: отказ приходит по ВЛАДЕНИЮ, а не по праву роли. Код прежний, ' +
    'изменился текст: раньше «Недостаточно прав» (роль), теперь про владение.',
  'POST /api/trainers':
    'Шаг 35.19c: завести карточку тренера может любой вошедший человек. ' +
    'Раньше это было правом роли `trainer`, и представитель услуг получал 403 ' +
    'на собственную карточку — дефект 4.6 № 1.',
  'POST /api/bookings (не атлет)':
    'Шаг 35.19c и решение заказчика 16: записаться может любой человек, ' +
    'включая владельца зала. Отказ остался только у администратора (решение 13).',
  'POST /api/auth/register':
    'Шаги 35.22 и 35.23: регистрация больше не спрашивает тип учётной записи — ' +
    'она заводит человека. Схема `.strict()`, поэтому вызов эталона с полем ' +
    '`accountType` отвергается: старому клиенту придётся перестать его слать.',
  'GET /api/analytics':
    'Шаг 35.19e: провайдеры считаются по владению лицами услуг, а не по роли. ' +
    'Человек с клубом и карточкой тренера — один провайдер, а не два. ' +
    'Форма ответа прежняя, изменились числа.',
  'POST /api/provider-client-notes':
    'Шаг 35.27a, решение заказчика 19: заметка о клиенте ложится ПРИ ЛИЦЕ услуг, ' +
    'и в ответе появилась пара `faceType` / `faceId`. Поля необязательные — старый ' +
    'клиент их просто не читает, — а само лицо выведено по записям клиента: он ' +
    'ходил ровно в один клуб этого человека, гадать было не о чем.',
  'POST /api/trainer-club-links (нет прав)':
    'Шаг 35.19: вести связи может владелец любой из сторон — это владение, ' +
    'а не право роли. Подмена ЧУЖОЙ стороны по-прежнему 403.',
  // Оба вызова ниже снимались от лица `marina@studio.local` (пользователь 2),
  // а карточки тренера 1 и 5 в фикстурах принадлежат ЕЙ ЖЕ. Эталон зафиксировал
  // 403 на собственной вещи: право `manage_own_trainer_profile` есть только
  // у роли `trainer`, а владеет карточкой представитель услуг.
  'PATCH /api/trainers/[id]':
    'Шаг 35.17: владение решает вместо роли — владелец правит свою карточку ' +
    'тренера, кем бы он ни был по роли. Было 403, стало 200.',
  'DELETE /api/trainers/[id]':
    'Шаг 35.17: та же причина для удаления — владелец сносит свою карточку. ' +
    'Было 403, стало 200.',

  // ⚠️ Шаг 35.20a — семь строк на одну причину, и повторять её в каждой было бы
  // враньём о числе изменений: изменение ОДНО. `managedByUserId` — техническая
  // связь лица услуг с человеком, и она уезжала гостю в каждой карточке
  // каталога: одним запросом к `GET /api/clubs` скачивалась готовая карта
  // «эти лица принадлежат одному человеку». Поле убрано из ВСЕХ публичных
  // выдач каталога — списка, карточки и адреса-ссылки, — и убрано для всех,
  // включая владельца и администратора: условная выдача одного маршрута разным
  // людям это то, на чём ошибаются незаметно. Старый клиент поле читать
  // перестанет — это и есть изменённое обещание; своё лицо он берёт из ответа
  // «кто я» (`faces`), а владельцев администратор — из `GET /api/users`.
  'GET /api/clubs': OWNER_REMOVED_FROM_PUBLIC_CATALOG,
  'GET /api/clubs?sportId=3': OWNER_REMOVED_FROM_PUBLIC_CATALOG,
  'GET /api/clubs?sort=reliability': OWNER_REMOVED_FROM_PUBLIC_CATALOG,
  'GET /api/clubs/[id]': OWNER_REMOVED_FROM_PUBLIC_CATALOG,
  'GET /api/trainers': OWNER_REMOVED_FROM_PUBLIC_CATALOG,
  'GET /api/trainers?clubId=1': OWNER_REMOVED_FROM_PUBLIC_CATALOG,
  'GET /api/trainers/[id]': OWNER_REMOVED_FROM_PUBLIC_CATALOG,

  // Прежнее состояние списка — пустое.
  //
  // Эталон переснят 09.09.2026 (шаг 34.60): он больше не снимок прежнего бэкенда,
  // а снимок поведения ПОСЛЕ фазы 34. Расхождения, накопленные фазой, перечислены
  // в её файле и в истории git; держать их здесь дальше означало бы сверяться
  // с поведением, которого больше нет.
  //
  // Непустой список — это всегда обещание, которое пришлось изменить. Пустой —
  // обещание держится.
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

export type Call = {
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

export const CALLS: Call[] = [
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
    // Свободное посещение под этот вызов.
    //
    // В общем срезе у пользователя 1 ровно одно завершённое занятие у тренера 1
    // и уже оставленный отзыв о нём. С правилом «одна оценка на посещение» его
    // квота исчерпана, и вызов упирался бы в 409 — то есть сверка проверяла бы
    // отказ вместо формы успешного ответа, ради которой она и снята. Второе
    // посещение возвращает вызову ту предпосылку, при которой снимался эталон;
    // сам ответ от этого не меняется — отзыв всё так же получает номер 3.
    prepare: (harness: TestHarness) =>
      harness.writeMany({
        bookings: [...fixtureBookings, { ...fixtureBookings[1], id: 4 }],
      }),
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
    // Те же данные, что и при съёмке эталона: пакет фикстур общий, БЕЗ исключений.
    // Срез идёт данными, а не записью файлов: у обвязки на базе директории данных нет.
    //
    // Прежде тренер отсюда исключался: эталон был снят на трёх ролях, и четвёртый
    // человек делал бы сводку платформы расхождением — не из-за поведения, а из-за
    // данных. Пересъёмка (34.60) это сняла: эталон снят на полном наборе.
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
