// Тесты маршрутов клубов и тренеров.
//
// Сверка с эталоном проверяет успешные ответы, но не ветки отказов: там
// подобраны только осмысленные запросы. Здесь закрыты именно отказы — разбор
// параметров выдачи, чужая публикация, несуществующие идентификаторы.
//
// ⚠️ Фаза 34 переписала половину набора, и причина не косметическая. Раньше
// личность публикующего приезжала полем `userId` в теле запроса: «чужая правка»
// изображалась сменой числа в JSON, а удаление не спрашивало вообще никого —
// снести чужой клуб вместе со всеми записями людей мог любой прохожий. Теперь
// исполнителя даёт сессия, и набор построен вокруг неё: у каждого закрытого
// действия есть контрольная группа «а гостю?», у каждого правила владения —
// «а чужому?», и рядом с каждым отказом стоит успех того, кому положено. Без
// этой пары зелёный отказ ничего не доказывает: он одинаково зелен и когда
// правило работает, и когда маршрут сломан для всех.
//
// ⚠️ Шаг 35.19 переписал набор во второй раз, и по той же причине — сменился
// сам вопрос, на который отвечает маршрут. Роли больше нет: пять владельческих
// прав ушли из словаря, и «положено ли это вообще такой роли» спрашивать не у
// кого. Остался один вопрос — «твоя ли это вещь», и отвечает на него владение.
//
// Отсюда три следствия, и все три проверяются ниже:
//   • завести лицо услуг (клуб, карточку тренера) может ЛЮБОЙ вошедший;
//   • посторонний с любой ролью получает один и тот же отказ — роль больше
//     не меняет ответа, и это самое важное утверждение набора;
//   • текст отказа зависит от МАРШРУТА, а не от нарушителя: правку роль
//     не требует вовсе, и владение сверяет сервис (отказ называет вещь
//     поимённо); удаление помечено правом модерации, и владение спрашивает
//     guard — оттуда приходит общее «Недостаточно прав».

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections, fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Владелец клубов 1 и 2. Карточка тренера ему теперь тоже не заказана. */
const OWNER_ID = 2;
/** Владелец карточки тренера 1. Клуб он завести может — как и любой вошедший. */
const TRAINER_ID = 4;
/** Человек без единой публикации — им проверяется «чужое». */
const STRANGER_ID = 9;
/**
 * Второй человек без публикаций, и роль в срезе у него ДРУГАЯ.
 *
 * Пара нужна ровно за этим: до шага 35.19 эти двое упирались в разные проверки
 * и получали разные тексты отказа. Теперь оба посторонние и оба получают одно
 * и то же — иначе роль всё ещё решает.
 */
const OTHER_TRAINER_ID = 10;
/** Администратор: право модерации разрешает ему трогать чужие публикации. */
const ADMIN_ID = 3;
/** Атлет: нужен записью на занятие, которую чужое удаление не имеет права унести. */
const ATHLETE_ID = 1;

const user = (id: number, accountKind: string, name: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
  status: 'active',
  name,
  email: `user-${id}@test.local`,
  phone: `+7 (900) 000-01-0${id}`,
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

const club = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  createdAt: `2026-01-0${id}T00:00:00.000Z`,
  name: `Клуб ${id}`,
  slug: `club-${id}`,
  city: 'Самара',
  address: 'Ленина 1',
  phone: '+7 (900) 000-00-00',
  description: 'Описание клуба',
  shortDescription: 'Кратко',
  managedByUserId: OWNER_ID,
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  imageUrls: [],
  rating: 4,
  reviewCount: 1,
  priceFrom: 500,
  distanceKm: 0,
  coordinates: { lat: 53.2, lng: 50.1 },
  source: 'seed',
  status: 'published',
  ...over,
});

// Основная услуга клуба 1: без неё правка публикации не проходит дальше поиска
// услуги. ⚠️ Услуга описана полностью — без описания, формата, длительности и
// адреса файлы её принимали, а база нет: половины обязательных колонок у неё нет.
const CLUB_OFFERING = {
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
  address: 'Ленина 1',
  coordinates: { lat: 53.2, lng: 50.1 },
};

// Основная услуга тренера 1: правка карточки ищет её так же, как правка клуба —
// свою. Без неё маршрут отвечает «Тренер не найден» ещё до проверки владения,
// и проверять разделение прав было бы не на чем.
const TRAINER_OFFERING = {
  id: 2,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'trainer',
  ownerId: 1,
  sportId: 3,
  title: 'Персональная',
  description: 'Описание',
  format: 'personal',
  price: 900,
  durationMinutes: 60,
  capacity: 1,
  address: 'Ленина 4',
  coordinates: { lat: 53.2, lng: 50.1 },
};

/** Слот клуба 1 и запись атлета на него — то, что уносит с собой удаление клуба. */
const CLUB_SLOT = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  offeringId: 1,
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  sportId: 3,
  title: 'Слот',
  date: '2026-09-01',
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 10,
  bookedCount: 1,
  price: 500,
};

/**
 * Отзыв атлета о клубе 1 — чужие слова.
 *
 * Лежит в общем срезе, а не заводится по месту: уборка лица (35.24a) не имеет
 * права его стирать, и проверить это можно только тогда, когда отзыв есть.
 */
const CLUB_REVIEW = {
  id: 1,
  createdAt: '2026-01-03T00:00:00.000Z',
  userId: ATHLETE_ID,
  clubId: 1,
  rating: 4,
  text: 'Хороший зал',
};

const CLUB_BOOKING = {
  id: 1,
  createdAt: '2026-01-02T00:00:00.000Z',
  scheduleId: 1,
  offeringId: 1,
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  userId: ATHLETE_ID,
  sportId: 3,
  date: '2026-09-01',
  status: 'confirmed',
  paymentStatus: 'unpaid',
  totalPrice: 500,
};

/**
 * Запись на слот клуба 1 — заготовка под проверки надёжности.
 *
 * Отдельная от `CLUB_BOOKING`: та одна и лежит в общем срезе, а надёжность
 * считается по НАБОРУ статусов, и каждый статус нужен своей строкой.
 */
const booking = (id: number, over: Record<string, unknown> = {}) => ({
  ...CLUB_BOOKING,
  id,
  createdAt: `2026-01-02T00:00:0${id % 10}.000Z`,
  ...over,
});

/**
 * Люди набора: администратор и четверо обычных людей — двое с лицами услуг,
 * двое без.
 *
 * Пара «свой + чужой» обязательна: без чужого зелёный отказ неотличим
 * от маршрута, сломанного для всех.
 *
 * ⚠️ Шаг 35.24: роли в срезе больше нет вовсе. Владельцы лиц услуг и люди без
 * них заведены ОДИНАКОВЫМ видом учётной записи (`person`) — различает их только
 * владение. Если решение о доступе снова начнёт зависеть не от владения,
 * а от какого-либо признака у человека, набор покраснеет.
 *
 * Список общий для всех срезов набора: каждая запись пересобирает базу целиком,
 * и срез, забывший кого-то из шестерых, отвечал бы его запросам 401 вместо
 * проверяемого отказа или успеха.
 */
const USERS = [
  user(ATHLETE_ID, 'person', 'Алексей'),
  user(OWNER_ID, 'person', 'Марина'),
  user(ADMIN_ID, 'admin', 'Администратор'),
  user(STRANGER_ID, 'person', 'Чужой'),
  user(TRAINER_ID, 'person', 'Павел'),
  user(OTHER_TRAINER_ID, 'person', 'Чужой тренер'),
];

/**
 * Карточка тренера. Владелец задаётся снаружи — именно он здесь и проверяется.
 *
 * Этап Э8a фазы 34 отдал карточку роли тренера; шаг 35.17 показал обратную
 * сторону того решения (карточками владеют и люди с другой ролью, и роль
 * запирала их у собственной вещи); шаг 35.19 убрал роль из ответа вовсе.
 * Остались двое: владелец и посторонний.
 */
const trainerCard = (over: Record<string, unknown> = {}) => ({
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Марина Соколова',
  slug: 'marina-sokolova',
  bio: 'Биография',
  avatarUrl: '',
  experienceYears: 5,
  priceFrom: 900,
  managedByUserId: TRAINER_ID,
  sportIds: [3],
  specialtyIds: [],
  workFormatIds: [],
  rating: 5,
  reviewCount: 0,
  status: 'published',
  ...over,
});

/**
 * Форма публикации клуба и форма карточки тренера.
 *
 * Обе живут на уровне файла: их шлют три набора проверок сразу, и копия,
 * разъехавшаяся с оригиналом, проверяла бы другую форму под тем же именем.
 * Отличия конкретного вызова задаются россыпью поверх.
 */
const CLUB_FORM = {
  name: 'Новый клуб',
  city: 'Самара',
  address: 'Ленина 2',
  description: 'Описание клуба длиной больше пятидесяти символов, чтобы пройти проверку формы.',
  phone: '+7 (900) 000-00-00',
  email: '',
  priceFrom: '900',
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  vk: '',
  telegram: '',
  facebook: '',
  scheduleSlots: [
    {
      title: 'Слот',
      date: '2026-09-01',
      startTime: '10:00',
      endTime: '11:00',
      price: '500',
      capacity: '10',
      location: 'Зал',
      sportId: 3,
    },
  ],
};

const TRAINER_FORM = {
  firstName: 'Павел',
  lastName: 'Тренеров',
  city: 'Самара',
  address: 'Ленина 4',
  bio: 'Описание тренера длиной больше пятидесяти символов, чтобы пройти проверку формы.',
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
      date: '2026-09-03',
      startTime: '09:00',
      endTime: '10:00',
      price: '2000',
      capacity: '1',
      location: 'Зал',
      sportId: 3,
    },
  ],
};

describe('Маршруты клубов и тренеров', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('clubs-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: у базы есть внешние ключи, и публикацию не записать
    // раньше справочника видов спорта.
    //
    // Все четверо пользователей засеиваются ЗДЕСЬ, а не по месту нужды: каждая
    // запись пересобирает базу целиком и гасит уже выданные сессии, так что
    // досев внутри теста обесценил бы cookie, взятую до него.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: USERS,
      clubs: [club(1), club(2, { rating: 2, sportIds: [5] })],
      // Карточка тренера принадлежит пользователю 4. Роль в срезе у него
      // тренерская, но с шага 35.19 ответ зависит только от владения — роль
      // здесь ровно декорация, и набор ниже это доказывает.
      trainers: [trainerCard()],
      offerings: [CLUB_OFFERING, TRAINER_OFFERING],
      schedule: [CLUB_SLOT],
      bookings: [CLUB_BOOKING],
      reviews: [CLUB_REVIEW],
      logs: [],
      // ⚠️ Уведомления переносятся пустыми вместе со срезом: обвязка правит только
      // НАЗВАННЫЕ коллекции, и надзорные строки копились бы между проверками —
      // «создалась одна» зеленело бы на второй и краснело на третьей.
      notifications: [],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer();

  /**
   * Тот же срез, но администраторов ТРОЕ.
   *
   * ⚠️ Ревизия 37.73. «Одна строка на всех» — главное свойство общей очереди,
   * и до сих пор оно проверялось на стенде с одним администратором: там одна
   * строка и три строки выглядят одинаково, то есть свойство не проверялось
   * вовсе. Копии по числу администраторов сломали бы разбор — «этим занялись»
   * стало бы личным, и второй не увидел бы, что первый уже взялся.
   *
   * Срез переписывается целиком и гасит выданные сессии, поэтому cookie
   * берётся ПОСЛЕ вызова.
   */
  const withThreeAdmins = async (): Promise<void> => {
    await harness.writeMany({
      users: [...USERS, user(11, 'admin', 'Администратор 2'), user(12, 'admin', 'Администратор 3')],
      notifications: [],
    });
  };

  describe('разбор параметров выдачи', () => {
    // ⚠️ Фаза 38, шаг 38.23. Единственной сортировкой выдачи была надёжность,
    // и вместе с ней ушли параметры `sort`, `dir` и `excludeDanger`. Прежние кейсы
    // «неизвестная сортировка отклоняется» держались на том, что параметр
    // существует; теперь он — лишний, а лишний параметр выдачу не роняет, как
    // любой другой незнакомый ключ строки запроса. Сортировка по рейтингу
    // заводится шагом 38.29 — и вернёт отказ на незнакомое ЗНАЧЕНИЕ.
    it('снятые параметры сортировки и отсева — лишние: выдача полная и без отказа', async () => {
      const response = await request(server()).get(
        '/api/clubs?sort=reliability&dir=desc&excludeDanger=true',
      );

      expect(response.status).toBe(200);
      expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([1, 2]);
    });

    it('оценка вне диапазона отклоняется', async () => {
      const response = await request(server()).get('/api/clubs?minRating=9');

      expect(response.status).toBe(400);
    });

    it('нечисловой вид спорта отклоняется', async () => {
      const response = await request(server()).get('/api/clubs?sportId=йога');

      expect(response.status).toBe(400);
    });

    it('фильтр по оценке оставляет только подходящие', async () => {
      const response = await request(server()).get('/api/clubs?minRating=3');

      expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([1]);
    });

    it('поиск ищет по названию и описанию', async () => {
      const response = await request(server()).get('/api/clubs?search=Клуб 2');

      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(2);
    });

    it('скрытые публикации в обычной выдаче не показываются', async () => {
      await harness.write('clubs', [club(1), club(3, { status: 'hidden' })]);

      const visible = await request(server()).get('/api/clubs');
      expect(visible.body.data.map((item: { id: number }) => item.id)).toEqual([1]);
    });

    it('флаг «показать скрытые» гостю ничего не открывает', async () => {
      // ⚠️ Шаг 36.14, смена обещания. Прежде здесь стояло
      // `expect(all.body.data).toHaveLength(2)` — то есть набор ФИКСИРОВАЛ дыру
      // как правильное поведение: запрос без cookie получал скрытую публикацию
      // вместе с `hideReason` и номером скрывшего её администратора. Проверено
      // на живом приложении 10.09.2026.
      //
      // Тест переписан на новое обещание, а не «починен»: молча перевёрнутое
      // утверждение выглядит одинаково и в честном виде, и в подогнанном.
      await harness.write('clubs', [club(1), club(3, { status: 'hidden' })]);

      const all = await request(server()).get('/api/clubs?includeHidden=true');

      // Не отказ, а сужение выдачи: фронт слал этот флаг безусловно, и 403
      // превратил бы публичные страницы в 500 у гостя.
      expect(all.status).toBe(200);
      expect(all.body.data.map((item: { id: number }) => item.id)).toEqual([1]);
    });

    it('то же у тренеров: снятые параметры не роняют выдачу', async () => {
      const response = await request(server()).get(
        '/api/trainers?sort=reliability&dir=asc&excludeDanger=true',
      );

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
    });
  });

  describe('карточка клуба', () => {
    it('нечисловой идентификатор отклоняется', async () => {
      const response = await request(server()).get('/api/clubs/abc');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректный идентификатор клуба');
    });

    it('несуществующий клуб — не найдено', async () => {
      const response = await request(server()).get('/api/clubs/999');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Клуб не найден');
    });

    it('неизвестный адрес-ссылка тренера — не найдено', async () => {
      const response = await request(server()).get('/api/trainers/by-slug/нет-такого');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Тренер не найден');
    });
  });

  // Витрина обязана открываться до входа. Проверки стоят здесь не «на всякий
  // случай»: закрыто теперь всё по умолчанию, и достаточно снять одну пометку
  // `@Public`, чтобы каталог начал требовать регистрацию раньше показа. Отказы
  // ниже такую поломку не заметили бы — 401 они ждут сами.
  describe('чтение открыто гостю', () => {
    it('каталог клубов отвечает гостю', async () => {
      const response = await request(server()).get('/api/clubs');

      expect(response.status).toBe(200);
      expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([1, 2]);
    });

    it('карточка клуба открыта гостю', async () => {
      const response = await request(server()).get('/api/clubs/1');

      expect(response.status).toBe(200);
      expect(response.body.data.club.id).toBe(1);
    });

    it('клуб по адресу-ссылке открыт гостю', async () => {
      const response = await request(server()).get('/api/clubs/by-slug/club-1');

      expect(response.status).toBe(200);
      expect(response.body.data.club.id).toBe(1);
    });

    it('каталог и карточка тренера открыты гостю', async () => {
      const list = await request(server()).get('/api/trainers');
      expect(list.status).toBe(200);
      expect(list.body.data).toHaveLength(1);

      const detail = await request(server()).get('/api/trainers/by-slug/marina-sokolova');
      expect(detail.status).toBe(200);
      expect(detail.body.data.trainer.id).toBe(1);
    });
  });

  // Номер владельца в публичную выдачу не уходит — ни гостю, ни вошедшему.
  //
  // ⚠️ Шаг 35.20a. `managedByUserId` — это связь лица услуг с человеком, и до
  // этого шага она приезжала в каждой карточке каталога. Одним запросом
  // к `GET /api/clubs` скачивалась готовая карта «эти лица принадлежат одному
  // человеку»: посторонний связывал зал, карточку тренера и второй зал одного
  // владельца, ничего не подбирая. Постороннему этот номер не нужен ни для
  // чего — аффилиация показывается ПОДТВЕРЖДЁННОЙ связью тренер↔клуб.
  //
  // Проверки идут парами «гость + вошедший» намеренно: поле убрано ДЛЯ ВСЕХ,
  // а не спрятано от гостя. Условная выдача одного маршрута разным людям — это
  // именно то, на чём ошибаются незаметно: тест на гостя остался бы зелёным,
  // даже если бы владельцу и постороннему поле продолжало уезжать.
  describe('номер владельца не уходит в публичную выдачу', () => {
    it('каталог клубов не отдаёт номер владельца гостю', async () => {
      const response = await request(server()).get('/api/clubs');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
      for (const item of response.body.data as Record<string, unknown>[]) {
        expect(item).not.toHaveProperty('managedByUserId');
      }
    });

    it('каталог тренеров не отдаёт номер владельца гостю', async () => {
      const response = await request(server()).get('/api/trainers');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      for (const item of response.body.data as Record<string, unknown>[]) {
        expect(item).not.toHaveProperty('managedByUserId');
      }
    });

    it('карточка клуба не отдаёт номер владельца — ни свой, ни у своих тренеров', async () => {
      const response = await request(server()).get('/api/clubs/1');

      expect(response.status).toBe(200);
      expect(response.body.data.club).not.toHaveProperty('managedByUserId');
      expect(JSON.stringify(response.body.data)).not.toContain('managedByUserId');
    });

    it('карточка тренера не отдаёт номер владельца — ни свой, ни у клуба-площадки', async () => {
      const response = await request(server()).get('/api/trainers/1');

      expect(response.status).toBe(200);
      expect(response.body.data.trainer).not.toHaveProperty('managedByUserId');
      expect(JSON.stringify(response.body.data)).not.toContain('managedByUserId');
    });

    it('выдача по адресу-ссылке ведёт себя так же', async () => {
      const club = await request(server()).get('/api/clubs/by-slug/club-1');
      const trainer = await request(server()).get('/api/trainers/by-slug/marina-sokolova');

      expect(JSON.stringify(club.body.data)).not.toContain('managedByUserId');
      expect(JSON.stringify(trainer.body.data)).not.toContain('managedByUserId');
    });

    it('поле убрано и для владельца, и для администратора — выдача одна на всех', async () => {
      for (const userId of [OWNER_ID, ADMIN_ID]) {
        const cookie = await harness.as(userId);
        const clubs = await request(server())
          .get('/api/clubs?includeHidden=true')
          .set('Cookie', cookie);
        const trainers = await request(server())
          .get('/api/trainers?includeHidden=true')
          .set('Cookie', cookie);

        expect(clubs.status, `клубы, пользователь ${userId}`).toBe(200);
        expect(JSON.stringify(clubs.body.data), `клубы, пользователь ${userId}`).not.toContain(
          'managedByUserId',
        );
        expect(trainers.status, `тренеры, пользователь ${userId}`).toBe(200);
        expect(JSON.stringify(trainers.body.data), `тренеры, пользователь ${userId}`).not.toContain(
          'managedByUserId',
        );
      }
    });

    it('свои лица человек берёт из ответа «кто я», а не из каталога', async () => {
      // Контрольная группа: поле ушло, но узнать свои публикации по-прежнему
      // можно — иначе кабинет остался бы без данных, и «утечка закрыта»
      // означало бы «функциональность потеряна».
      const cookie = await harness.as(OWNER_ID);
      const me = await request(server()).get('/api/auth/me').set('Cookie', cookie);

      expect(me.status).toBe(200);
      // ⚠️ У лица есть ещё и `status` (шаг 35.44a): архивированное лицо остаётся
      // в списке, но обязано отличаться от живого. Сверяются вид, номер и имя —
      // то, из чего кабинет строит адрес и подпись.
      expect(
        (me.body.data.faces as { kind: string; id: number; name: string }[]).map(
          ({ kind, id, name }) => ({ kind, id, name }),
        ),
      ).toEqual([
        { kind: 'club', id: 1, name: 'Клуб 1' },
        { kind: 'club', id: 2, name: 'Клуб 2' },
      ]);
      // Живые лица архивными не помечены — иначе кабинет предупреждал бы зря.
      expect(
        (me.body.data.faces as { status?: string }[]).every((face) => face.status !== 'hidden'),
      ).toBe(true);
    });
  });

  // Надёжности в выдаче каталога НЕТ (фаза 38, шаг 38.23).
  //
  // ⚠️ Прежде здесь стоял блок «надёжность приходит вместе с карточкой» — восемь
  // чисел на каждую публикацию, посчитанных запросом-агрегатом по записям. Решение
  // заказчика 15.09.2026: механизм вырезан целиком. Проверяется не «поле пустое»,
  // а «ключа нет вовсе»: пустой объект или `null` под тем же именем означали бы,
  // что расчёт остался, просто перестал считать.
  describe('надёжности в выдаче каталога нет', () => {
    beforeEach(async () => {
      // Записи разных статусов — те самые, из которых надёжность складывалась.
      // Без них проверка была бы зелена и у живого расчёта: нулевые счётчики
      // тоже отдавались полем.
      await harness.write('bookings', [
        booking(11, { status: 'completed' }),
        booking(13, { status: 'no_show' }),
        booking(17, { status: 'rejected_by_provider' }),
      ]);
    });

    it('список и карточка клуба не несут поля reliability', async () => {
      const list = await request(server()).get('/api/clubs');
      const detail = await request(server()).get('/api/clubs/1');
      const bySlug = await request(server()).get('/api/clubs/by-slug/club-1');

      expect(list.status).toBe(200);
      expect(list.body.data.every((item: object) => !('reliability' in item))).toBe(true);
      expect('reliability' in detail.body.data.club).toBe(false);
      expect('reliability' in bySlug.body.data.club).toBe(false);
    });

    it('список и карточка тренера не несут поля reliability', async () => {
      const list = await request(server()).get('/api/trainers');
      const detail = await request(server()).get('/api/trainers/1');

      expect(list.status).toBe(200);
      expect(list.body.data.every((item: object) => !('reliability' in item))).toBe(true);
      expect('reliability' in detail.body.data.trainer).toBe(false);
    });
  });

  describe('публикация и правка', () => {
    // Правка существующего клуба шлёт слот с номером: без него слот 1 считался бы
    // выброшенным из расписания, и проверка владения потянула бы за собой отмену
    // записи — лишний шум там, где проверяется право, а не расписание.
    const editForm = {
      ...CLUB_FORM,
      name: 'Клуб 1 после правки',
      scheduleSlots: [{ ...CLUB_FORM.scheduleSlots[0], id: 1 }],
    };

    it('гость не публикует клуб — 401', async () => {
      // Заменил прежнюю проверку «публикация от несуществующего пользователя».
      // Тот сценарий больше недостижим: номер публикующего приходит не из тела,
      // а из сессии, и у несуществующего пользователя сессии быть не может.
      // Достижим ровно один случай «личности нет» — её нет вовсе.
      const response = await request(server()).post('/api/clubs').send(CLUB_FORM);

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: 'Требуется вход' });
    });

    it('гость не правит клуб — 401', async () => {
      const response = await request(server()).patch('/api/clubs/1').send(editForm);

      expect(response.status).toBe(401);
    });

    it('гость не удаляет клуб — 401', async () => {
      const response = await request(server()).delete('/api/clubs/1');

      expect(response.status).toBe(401);
      // Клуб на месте: отказ обязан быть отказом, а не «401 уже после удаления».
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
    });

    it('гость не публикует тренера — 401', async () => {
      const response = await request(server()).post('/api/trainers').send({});

      expect(response.status).toBe(401);
    });

    it('неполные данные отклоняются с перечнем полей', async () => {
      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(OWNER_ID))
        .send({ name: 'Только имя' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректные данные клуба');
      expect(response.body.details).toBeDefined();
    });

    it('новое лицо в каталоге уходит В ОЧЕРЕДЬ НАДЗОРА', async () => {
      // ⚠️ Шаг 37.33. Премодерации в продукте НЕТ: публикация встаёт в каталог
      // сразу `published`. Без этой строки надзор узнаёт о новой карточке, только
      // когда придёт жалоба, — а механизма жалоб в продукте тоже не существует.
      const created = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(CLUB_FORM);

      expect(created.status).toBe(201);

      const rows = await harness.read<
        {
          addresseeKind: string;
          userId?: number;
          type: string;
          payload: Record<string, unknown>;
        }[]
      >('notifications');
      const oversight = rows.filter((row) => row.type === 'oversight_publication_created');

      expect(oversight).toHaveLength(1);
      expect(oversight[0].addresseeKind).toBe('supervision');
      expect(oversight[0].userId).toBeUndefined();
      expect(oversight[0].payload.subjectType).toBe('club');
    });

    it('новое лицо при ТРЁХ администраторах даёт ОДНУ строку', async () => {
      await withThreeAdmins();

      await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(CLUB_FORM)
        .expect(201);

      const rows = await harness.read<{ addresseeKind: string; type: string }[]>('notifications');
      const oversight = rows.filter((row) => row.type === 'oversight_publication_created');

      expect(oversight, 'строка размножилась по администраторам').toHaveLength(1);
      expect(oversight[0].addresseeKind).toBe('supervision');
    });

    it('стирание при ТРЁХ администраторах даёт ОДНУ строку', async () => {
      await withThreeAdmins();

      await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(ADMIN_ID))
        .expect(200);

      const rows = await harness.read<{ addresseeKind: string; type: string }[]>('notifications');
      const deleted = rows.filter((row) => row.type === 'oversight_publication_deleted');

      expect(deleted, 'строка размножилась по администраторам').toHaveLength(1);
      expect(deleted[0].addresseeKind).toBe('supervision');
    });

    it('АРХИВ владельца надзорной строки не порождает', async () => {
      // ⚠️ Шаг 37.32. Различие не косметическое: архив обратим и делается владельцем
      // со своей вещью, стирание необратимо и уносит каскадом услуги, расписание,
      // чужие записи и отзывы.
      //
      // ⚠️ Название исправлено ревизией (37.73). Прежде оно обещало «а стирание —
      // порождает», а тело проверяло ТОЛЬКО ветку архива. Тест, утверждающий
      // в названии больше, чем делает, хуже отсутствующего: он читается как
      // покрытие, которого нет. Вторая половина вынесена отдельной проверкой ниже.
      await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID));

      const afterArchive = await harness.read<{ type: string }[]>('notifications');

      expect(
        afterArchive.filter((row) => row.type === 'oversight_publication_deleted'),
      ).toHaveLength(0);
    });

    it('СТИРАНИЕ модератором кладёт строку в очередь и называет публикацию', async () => {
      // Та самая вторая половина: раньше она жила только в названии соседнего теста.
      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(ADMIN_ID));

      expect(response.status).toBe(200);

      const rows = await harness.read<
        {
          addresseeKind: string;
          userId?: number;
          type: string;
          payload: Record<string, unknown>;
        }[]
      >('notifications');
      const deleted = rows.filter((row) => row.type === 'oversight_publication_deleted');

      expect(deleted).toHaveLength(1);
      expect(deleted[0].addresseeKind).toBe('supervision');
      expect(deleted[0].userId).toBeUndefined();
      expect(deleted[0].payload.subjectType).toBe('club');
      expect(deleted[0].payload.subjectId).toBe(1);
      // ⚠️ Имя приходит СНИМКОМ: публикации больше нет, и сходить за ним некуда.
      expect(deleted[0].payload.publicationName).toBe('Клуб 1');
    });

    it('строка про стёртую публикацию ПЕРЕЖИВАЕТ саму публикацию', async () => {
      // ⚠️ Это не побочный эффект, а свойство события: «публикация стёрта» без
      // публикации — единственная его форма. Отдельная проверка нужна потому, что
      // на этом свойстве держится и уборка (37.56): найти такую строку по живым
      // номерам нельзя, номеров больше не существует.
      await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(ADMIN_ID));

      // Сверяется отсутствие ИМЕННО стёртой публикации, а не длина списка:
      // соседние проверки этого набора заводят свои клубы, и счёт по длине
      // зеленел бы или краснел от порядка выполнения, а не от сути.
      expect((await harness.read<{ id: number }[]>('clubs')).some((item) => item.id === 1)).toBe(
        false,
      );
      expect(
        (await harness.read<{ type: string }[]>('notifications')).filter(
          (row) => row.type === 'oversight_publication_deleted',
        ),
      ).toHaveLength(1);
    });

    it('владелец правит свою публикацию', async () => {
      // Контрольная группа к отказам ниже: без неё 403 у чужого был бы зелен
      // и в том случае, если правка сломана для всех.
      const response = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(editForm);

      expect(response.status).toBe(200);
      expect(response.body.data.club.name).toBe('Клуб 1 после правки');
    });

    // --- Правка без расписания (шаг 36.6, решение заказчика 1) ---------------

    it('правка без расписания проходит и расписание не трогает', async () => {
      const { scheduleSlots: _absent, ...withoutSlots } = editForm;

      const response = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send({ ...withoutSlots, phone: '+7 (846) 111-11-11' });

      expect(response.status).toBe(200);
      // Ответ по-прежнему несёт расписание: клиент рисует карточку по нему же.
      expect(response.body.data.schedules.length).toBeGreaterThan(0);
    });

    it('создание без расписания по-прежнему отклоняется', async () => {
      // ⚠️ Граница между схемами. Послабление коснулось ПРАВКИ; создать
      // публикацию без расписания нельзя — она вышла бы в каталог нерабочей.
      const { scheduleSlots: _absent, ...withoutSlots } = CLUB_FORM;

      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(withoutSlots);

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректные данные клуба');
    });

    it('правка с пустым расписанием отклоняется, а не сносит слоты', async () => {
      const response = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send({ ...editForm, scheduleSlots: [] });

      expect(response.status).toBe(400);
    });

    it('правка без расписания не роняет сверку направлений', async () => {
      // ⚠️ Ловушка 2 фазы 36: `refine` разыменовывал расписание без проверки.
      // Исключение из `refine` `safeParse` не ловит — наружу ушёл бы 500.
      const { scheduleSlots: _absent, ...withoutSlots } = editForm;

      const response = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(withoutSlots);

      expect(response.status).not.toBe(500);
    });

    it('правка чужой публикации запрещена', async () => {
      // Чужесть теперь определяется сессией: тело у чужого ровно то же, что
      // у владельца, — отличается только тот, кто вошёл.
      const response = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(STRANGER_ID))
        .send(editForm);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для редактирования клуба с id 1');
    });

    it('userId в теле не открывает чужую публикацию', async () => {
      // Прямая попытка вернуть прежнее поведение: в теле — номер владельца,
      // в сессии — чужой. До фазы 34 этого хватало, чтобы править чужой клуб.
      const response = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(STRANGER_ID))
        .send({ ...editForm, userId: OWNER_ID });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для редактирования клуба с id 1');
    });

    it('userId в теле не назначает владельца новой публикации', async () => {
      // Обратная сторона того же: публикует чужой, а в теле просит записать клуб
      // на владельца. Владельцем обязан стать вошедший.
      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(STRANGER_ID))
        .send({ ...CLUB_FORM, userId: OWNER_ID });

      expect(response.status).toBe(201);

      // Поле владельца читается из хранилища: наружу выдача каталога его не отдаёт.
      const clubs = await harness.read<{ name: string; managedByUserId?: number }[]>('clubs');
      const created = clubs.find((item) => item.name === 'Новый клуб');

      expect(created?.managedByUserId).toBe(STRANGER_ID);
    });

    it('правка несуществующего клуба отвечает общим «Клуб не найден»', async () => {
      // ⚠️ Подмена текста: изнутри приходит «Клуб с id N не найден»,
      // наружу уходит общее сообщение. Поведение сохранено с прежнего бэкенда.
      const response = await request(server())
        .patch('/api/clubs/999')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(CLUB_FORM);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Клуб не найден');
    });

    it('нечисловой идентификатор отклоняется — и правкой, и удалением', async () => {
      // ⚠️ Шаг 35.19 развёл эти два маршрута, и разница видна только здесь.
      //
      // Удаление помечено правом модерации и `@OrOwnerOf`: guard спрашивает
      // сначала право, потом владение — а владельца у «abc» нет и быть не может,
      // поэтому отказ приходит по правам, и до разбора номера дело не доходит.
      // Прежде владелец проходил guard по праву `manage_own_clubs` и получал
      // разбор номера, то есть 400. Права больше нет — код стал 403.
      //
      // Правка требований роли не имеет вовсе, её guard пропускает сразу, и
      // номер разбирает контроллер: там по-прежнему 400.
      //
      // Проверяются ОБА маршрута: повод один, ответы разные — если однажды они
      // сойдутся (в любую сторону), это будет видно здесь, а не на клиенте.
      const removed = await request(server())
        .delete('/api/clubs/abc')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(removed.status).toBe(403);
      expect(removed.body.error).toBe('Недостаточно прав');

      const patched = await request(server())
        .patch('/api/clubs/abc')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(editForm);

      expect(patched.status).toBe(400);
      expect(patched.body.error).toBe('Некорректный идентификатор клуба');

      // Ни один из двух отказов ничего не тронул по дороге.
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
    });
  });

  // Раздел целиком новый: до фазы 34 проверять было нечего — маршрут удаления
  // не читал ни тела, ни сессии, и любой запрос сносил публикацию вместе с
  // услугами, слотами, отзывами и записями людей на занятия.
  describe('удаление публикации', () => {
    it('чужую публикацию удалить нельзя, записи целы', async () => {
      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(STRANGER_ID));

      expect(response.status).toBe(403);
      // ⚠️ Текст сменился на шаге 35.19, и смена — не косметика. Прежде
      // посторонний проходил guard по праву `manage_own_clubs` и упирался
      // в проверку владения ВНУТРИ сервиса — оттуда и приходило имя вещи.
      // Права больше нет, владение спрашивает guard, и до сервиса запрос
      // не доходит. Останавливает по-прежнему владение — сменилось место.
      expect(response.body.error).toBe('Недостаточно прав');

      // Главное здесь — не код ответа, а последствия: именно этим запросом
      // раньше исчезала чужая публикация и вместе с ней чужая запись на занятие.
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
      expect(await harness.read<{ id: number }[]>('bookings')).toHaveLength(1);
    });

    it('чужого тренера удалить нельзя', async () => {
      // Отказ по ВЛАДЕНИЮ, и спрашивает его guard: карточка чужая. Пара
      // к следующей проверке — там посторонний с другой ролью, и ответ обязан
      // быть тем же, иначе роль всё ещё решает.
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(OTHER_TRAINER_ID));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(1);
    });

    it('представителя услуг тренерская карточка не касается вовсе', async () => {
      // Тот же посторонний отказ, что и выше, но человек с другой ролью — и это
      // единственное, что здесь проверяется. До шага 35.19 его останавливало
      // ПРАВО (тренерские карточки роли не положены), а соседа — владение, и
      // тексты отказа у них были разные. Теперь причина одна на обоих: чужая
      // вещь. Утверждения теста от этого не изменились ни на символ — он был
      // верен про постороннего и остался верен.
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(STRANGER_ID));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(1);
    });

    it('владелец убирает свою публикацию: она уходит из каталога, история цела', async () => {
      // ⚠️ Шаг 35.24a, решение заказчика 21. Прежде эта проверка ждала, что клуб
      // ИСЧЕЗНЕТ, и вместе с ним молча исчезала запись атлета на занятие: человек
      // узнал бы об отмене, придя к закрытой двери. Теперь «удаление» владельцем
      // прячет лицо, а чужую историю не трогает.
      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(response.status).toBe(200);

      // Лицо на месте и помечено скрытым — тем же механизмом, что у модерации.
      const clubs =
        await harness.read<{ id: number; status?: string; hiddenAt?: string }[]>('clubs');
      expect(clubs).toHaveLength(2);
      expect(clubs.find((item) => item.id === 1)?.status).toBe('hidden');
      expect(clubs.find((item) => item.id === 1)?.hiddenAt).toBeDefined();

      // Чужая история цела: запись атлета и его отзыв на месте.
      expect(await harness.read<{ id: number }[]>('bookings')).toHaveLength(1);
      expect(await harness.read<{ id: number }[]>('reviews')).toHaveLength(1);

      // ⚠️ И главное следствие, ради которого затевался архив: из каталога лицо
      // ушло. Диверсия d-29 («помечает, но из каталога не убирает») краснит
      // именно эту строку — пометка без ухода из выдачи ничего не значит.
      const catalog = await request(server()).get('/api/clubs');
      expect(catalog.body.data.map((item: { id: number }) => item.id)).toEqual([2]);
    });

    it('убрать лицо с живой записью на будущее нельзя, и ничего не меняется', async () => {
      // Запрет из решения 21: пока люди записаны, лицо не убирается — сначала
      // отмени записи, тогда они получат уведомления и поймут, что произошло.
      await harness.writeMany({
        bookings: [
          {
            ...CLUB_BOOKING,
            id: 2,
            // Занятие в БУДУЩЕМ считается от часов, а не вписано числом: дата,
            // вписанная числом, однажды становится прошлым, и проверка запрета
            // молча перестаёт проверять запрет.
            date: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10),
            status: 'confirmed',
          },
        ],
      });

      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(response.status).toBe(409);
      // Отказ ОБЪЯСНЯЕТ причину и называет следующий шаг.
      expect(response.body.error).toMatch(/отмен/i);

      // Вторая половина проверки: состояние базы не тронуто.
      const clubs = await harness.read<{ id: number; status?: string }[]>('clubs');
      expect(clubs.find((item) => item.id === 1)?.status).not.toBe('hidden');
      expect(await harness.read<{ id: number }[]>('bookings')).toHaveLength(1);
    });

    it('администратор удаляет чужую публикацию', async () => {
      // Владелец администратору не нужен: право модерации на то и заведено.
      // Требовать от него ещё и владения значило бы запретить модерацию вовсе.
      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(ADMIN_ID));

      expect(response.status).toBe(200);
      expect((await harness.read<{ id: number }[]>('clubs')).map((item) => item.id)).toEqual([2]);
    });

    it('атлету чужая публикация тоже не поддаётся', async () => {
      // Вход есть, публикаций нет: правило владения одно для всех, кроме модератора.
      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(ATHLETE_ID));

      expect(response.status).toBe(403);
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
    });
  });
  // Шаг 35.19 и решения заказчика 1, 3, 10: лицо услуг заводит любой вошедший.
  //
  // Этап Э8a фазы 34 развёл `club_owner` и `trainer` по правам: клуб публиковал
  // один, карточку тренера — другой. Раздел проверял именно это разделение,
  // и потому его пришлось переписать целиком: разделять больше нечего. Ролей
  // нет, «тренер» и «владелец клуба» — производные от владения, а завести лицо
  // может каждый, потому что до создания владельца ещё не существует и спрашивать
  // о владении не у кого (решение 5.1 фазы).
  //
  // ⚠️ Проверяется не только «пускают», но и КОГО записали владельцем: открытое
  // создание с чужим владельцем в теле было бы хуже закрытого.
  //
  // ⚠️ Чего здесь НЕТ: отказа администратору. Решение 13 запрещает ему заводить
  // лица услуг, но в коде сегодня закрыты только записи (`hasHumanAbilities`
  // в `bookings.controller.ts`); публикации и отзывы — нет. Тест на это красил бы
  // набор в красный за чужой невыполненный шаг, поэтому пробел вынесен в отчёт,
  // а не спрятан здесь зелёной проверкой.
  describe('лицо услуг заводит любой вошедший', () => {
    // Клуб тренера отличается от общей формы только названием, адресом и датой
    // слота — остальное та же форма публикации, и повторять её целиком незачем.
    const clubForm = {
      ...CLUB_FORM,
      name: 'Клуб тренера',
      address: 'Ленина 3',
      scheduleSlots: [{ ...CLUB_FORM.scheduleSlots[0], date: '2026-09-02' }],
    };

    it('владелец карточки тренера заводит себе клуб', async () => {
      // Утверждение перевёрнуто шагом 35.19. Раньше здесь стоял отказ: право
      // `manage_own_clubs` было только у роли `club_owner`, и человек с карточкой
      // тренера свой зал завести не мог — приходилось заводить второй аккаунт.
      // Решение заказчика 3 говорит обратное: тренер с залом — норма, и это
      // просто человек с двумя лицами.
      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send(clubForm);

      expect(response.status).toBe(201);

      // Клуб действительно появился, и владельцем записан тот, кто вошёл.
      const clubs = await harness.read<{ name: string; managedByUserId?: number }[]>('clubs');
      expect(clubs).toHaveLength(3);
      expect(clubs.find((item) => item.name === 'Клуб тренера')?.managedByUserId).toBe(TRAINER_ID);
    });

    it('своё лицо чужого не открывает: клуб 1 ему не поддаётся', async () => {
      // Обратная сторона открытого создания и главная проверка раздела:
      // завести СВОЁ лицо может каждый, но чужое от этого доступнее не стало.
      // Заводить публикации — не привилегия, а вот трогать чужие — по-прежнему
      // вопрос владения.
      const patched = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send({ ...clubForm, scheduleSlots: [{ ...clubForm.scheduleSlots[0], id: 1 }] });

      expect(patched.status).toBe(403);
      // Правка права не требует, guard её пропускает — владение сверяет сервис,
      // и отказ называет вещь поимённо.
      expect(patched.body.error).toBe('Недостаточно прав для редактирования клуба с id 1');

      const removed = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(TRAINER_ID));

      expect(removed.status).toBe(403);
      // А удаление помечено правом модерации, и владение спрашивает guard —
      // отсюда общий текст. Разные тексты у одного и того же нарушения.
      expect(removed.body.error).toBe('Недостаточно прав');

      // Ни правка, ни удаление не тронули ни клуб, ни его название.
      const clubs = await harness.read<{ id: number; name: string }[]>('clubs');
      expect(clubs).toHaveLength(2);
      expect(clubs.find((item) => item.id === 1)?.name).toBe('Клуб 1');
    });

    it('владелец клубов заводит ещё один — числу лиц предела нет', async () => {
      // Решение заказчика 10: лиц услуг у человека сколько угодно. Ограничение
      // придёт с платой за публикацию, а не инвариантом схемы.
      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(clubForm);

      expect(response.status).toBe(201);
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(3);
    });

    it('владелец клубов заводит себе и карточку тренера', async () => {
      // Второе перевёрнутое утверждение. Именно этот отказ и был дефектом 4.6 № 1:
      // владелец зала, ведущий персоналки, — обычный случай (решение 3), а права
      // роли требовали от него второго аккаунта.
      const response = await request(server())
        .post('/api/trainers')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(TRAINER_FORM);

      expect(response.status).toBe(201);

      const trainers = await harness.read<{ name: string; managedByUserId?: number }[]>('trainers');
      expect(trainers).toHaveLength(2);
      expect(trainers.find((item) => item.name === 'Павел Тренеров')?.managedByUserId).toBe(
        OWNER_ID,
      );
    });

    it('своё лицо чужого не открывает: карточка 1 ему не поддаётся', async () => {
      // Зеркало к клубу 1: владеть можно чем угодно, но чужой карточкой — нет.
      const response = await request(server())
        .patch('/api/trainers/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(TRAINER_FORM);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для редактирования тренера с id 1');

      // Карточка на месте и с прежним именем: отказ обязан быть отказом.
      const trainers = await harness.read<{ id: number; name: string }[]>('trainers');
      expect(trainers).toHaveLength(1);
      expect(trainers[0].name).toBe('Марина Соколова');
    });

    it('владелец карточки заводит вторую — своё лицо не мешает новому', async () => {
      const response = await request(server())
        .post('/api/trainers')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send(TRAINER_FORM);

      expect(response.status).toBe(201);

      const trainers = await harness.read<{ name: string; managedByUserId?: number }[]>('trainers');
      const created = trainers.find((item) => item.name === 'Павел Тренеров');

      expect(created?.managedByUserId).toBe(TRAINER_ID);
    });

    it('владелец правит свою карточку и убирает её из каталога', async () => {
      const patched = await request(server())
        .patch('/api/trainers/1')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send(TRAINER_FORM);

      expect(patched.status).toBe(200);

      const removed = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(TRAINER_ID));

      expect(removed.status).toBe(200);
      // Шаг 35.24a: карточка прячется, а не стирается — правило одно с клубом.
      const trainers = await harness.read<{ id: number; status?: string }[]>('trainers');
      expect(trainers).toHaveLength(1);
      expect(trainers[0].status).toBe('hidden');
    });

    it('администратор удаляет чужую карточку тренера правом модерации', async () => {
      // Единственная причина пройти, не будучи владельцем, и она пережила
      // сокращение словаря: `moderate_publications` осталось админским правом.
      // Перечисление в требовании маршрута существует ровно ради этого случая.
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(ADMIN_ID));

      expect(response.status).toBe(200);
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(0);
    });
  });

  // Шаги 35.17 и 35.19: владение решает, а не роль.
  //
  // Этап Э8a развёл права по ролям — и запер владельцев у их собственных вещей:
  // карточка тренера, заведённая представителем услуг, перестала слушаться
  // хозяина (в живой базе так заперты 4 карточки из 11). Роль говорила одно,
  // владение — другое, и права слушали роль.
  //
  // Шаг 35.17 добавил владению вторую дорогу (`@OrOwnerOf`), шаг 35.19 убрал
  // первую: владельческих прав в словаре не осталось вовсе. С этого момента
  // роль в срезе — просто колонка, и раздел проверяет ровно это.
  //
  // Срез здесь ЗЕРКАЛЬНЫЙ общему: клубом владеет человек с ролью тренера,
  // карточкой тренера — представитель услуг. Обе стороны проверяются вместе,
  // потому что дефект у них общий и чинится одним движением: обратная пара
  // (роль тренера + свой клуб) сегодня в живых данных не встречается, но
  // запрещена тем же самым способом, а значит и вскроется тем же.
  describe('владение решает, а не роль', () => {
    beforeEach(async () => {
      await harness.writeMany({
        ...fixtureDictionaryCollections,
        users: USERS,
        clubs: [club(1, { managedByUserId: TRAINER_ID })],
        trainers: [trainerCard({ managedByUserId: OWNER_ID })],
        offerings: [CLUB_OFFERING, TRAINER_OFFERING],
        // Ни слотов, ни записей: удаление здесь проверяет право, а не каскад —
        // каскад закрыт своим набором.
        schedule: [],
        bookings: [],
        reviews: [],
        logs: [],
      });
    });

    it('владелец правит свою карточку тренера, хотя роль у него другая', async () => {
      // Тот самый живой отказ: `marina@studio.local` с ролью `club_owner`
      // получала 403 на собственной карточке.
      const response = await request(server())
        .patch('/api/trainers/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send({ ...TRAINER_FORM, firstName: 'Марина', lastName: 'Соколова' });

      expect(response.status).toBe(200);
      expect(response.body.data.trainer.name).toBe('Марина Соколова');
    });

    it('владелец убирает свою карточку тренера из каталога', async () => {
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(response.status).toBe(200);
      const trainers = await harness.read<{ id: number; status?: string }[]>('trainers');
      expect(trainers[0].status).toBe('hidden');
    });

    it('посторонний чужую карточку не правит и не удаляет — она на месте', async () => {
      // Двое посторонних с РАЗНЫМИ ролями, и это главное утверждение раздела:
      // до шага 35.19 их останавливали разные проверки (одного — владение внутри
      // сервиса, второго — право в guard) и отвечали разными текстами. Теперь
      // причина одна на обоих — чужая вещь, — и ответы обязаны совпасть до буквы.
      //
      // ⚠️ Сверка стала ТОЧНОЙ. Прежняя проверяла общую часть текста, потому что
      // источник отказа был временным и правильный шаг покрасил бы её в красный.
      // Шаг сделан, источник устоялся — и общая часть больше не годится: она
      // зелена и тогда, когда роль вернулась в решение, ведь оба текста
      // начинаются одинаково. Текст теперь зависит только от МАРШРУТА:
      // правка — от сервиса, поимённо; удаление — от guard, общим отказом.
      for (const strangerId of [OTHER_TRAINER_ID, STRANGER_ID]) {
        const patched = await request(server())
          .patch('/api/trainers/1')
          .set('Cookie', await harness.as(strangerId))
          .send(TRAINER_FORM);

        expect(patched.status).toBe(403);
        expect(patched.body.error).toBe('Недостаточно прав для редактирования тренера с id 1');

        const removed = await request(server())
          .delete('/api/trainers/1')
          .set('Cookie', await harness.as(strangerId));

        expect(removed.status).toBe(403);
        expect(removed.body.error).toBe('Недостаточно прав');
      }

      // Карточка на месте и с прежним именем: четыре отказа ничего не сделали.
      const trainers = await harness.read<{ id: number; name: string }[]>('trainers');
      expect(trainers).toHaveLength(1);
      expect(trainers[0].name).toBe('Марина Соколова');
    });

    it('владелец правит и удаляет свой клуб, хотя роль у него тренерская', async () => {
      // Обратная сторона того же дефекта: право `manage_own_clubs` было только
      // у представителя услуг, а клубом владеет человек с тренерской ролью.
      // Права больше нет вовсе — остаётся владение, и оно у него есть.
      const patched = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send({ ...CLUB_FORM, name: 'Клуб 1 после правки' });

      expect(patched.status).toBe(200);
      expect(patched.body.data.club.name).toBe('Клуб 1 после правки');

      const removed = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(TRAINER_ID));

      expect(removed.status).toBe(200);
      const clubs = await harness.read<{ id: number; status?: string }[]>('clubs');
      expect(clubs[0].status).toBe('hidden');
    });

    it('посторонний чужой клуб не правит и не удаляет — он на месте', async () => {
      // Зеркало к карточке, и сверка такая же точная: роль ни у одного из двоих
      // на ответ больше не влияет, а текст решает маршрут — правка отвечает
      // от сервиса поимённо, удаление от guard общим отказом.
      for (const strangerId of [STRANGER_ID, OTHER_TRAINER_ID]) {
        const patched = await request(server())
          .patch('/api/clubs/1')
          .set('Cookie', await harness.as(strangerId))
          .send(CLUB_FORM);

        expect(patched.status).toBe(403);
        expect(patched.body.error).toBe('Недостаточно прав для редактирования клуба с id 1');

        const removed = await request(server())
          .delete('/api/clubs/1')
          .set('Cookie', await harness.as(strangerId));

        expect(removed.status).toBe(403);
        expect(removed.body.error).toBe('Недостаточно прав');
      }

      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(1);
    });
  });
});

describe('Уборка лица называет ИСХОД, а не отвечает «успех»', () => {
  // ⚠️ Найдено прогоном чек-листа безопасности 10.09.2026. Исходов два, и они
  // разные по необратимости: владелец лицо АРХИВИРУЕТ — публикация уходит
  // из каталога, а записи, отзывы и связи целы и её можно вернуть; модератор
  // СТИРАЕТ — поднимать нечего. Ответ `{ success: true }` называл оба одним
  // словом, и клиент не мог ни показать верное сообщение, ни предложить возврат:
  // чтобы узнать, что произошло, надо было идти в базу или в журнал.
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('publication-removal-outcome');
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    await harness.writeMany({ ...fixtureCollections, bookings: [] });
  });

  it('владельцу отвечает «архивировано»', async () => {
    const clubs = await harness.read<{ id: number; managedByUserId?: number }[]>('clubs');
    const own = clubs.find((row) => row.managedByUserId === 2);

    const response = await request(harness.app.getHttpServer())
      .delete(`/api/clubs/${own?.id}`)
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(200);
    expect(
      (response.body as { data?: { outcome?: string } }).data?.outcome,
      'ответ не называет исход — архив от стирания не отличить',
    ).toBe('archived');
  });

  it('модератору отвечает «стёрто» — исход другой и назван другим словом', async () => {
    // Контрольная группа: без неё «называет исход» неотличимо от «всегда пишет archived».
    const clubs = await harness.read<{ id: number; managedByUserId?: number }[]>('clubs');
    const foreign = clubs.find((row) => row.managedByUserId === 2);

    const response = await request(harness.app.getHttpServer())
      .delete(`/api/clubs/${foreign?.id}`)
      .set('Cookie', await harness.as(3));

    expect(response.status).toBe(200);
    expect(
      (response.body as { data?: { outcome?: string } }).data?.outcome,
      'модератору отвечено как владельцу',
    ).toBe('deleted');
  });

  it('карточка тренера называет исход тем же полем', async () => {
    const trainers = await harness.read<{ id: number; managedByUserId?: number }[]>('trainers');
    const own = trainers.find((row) => row.managedByUserId === 2);

    const response = await request(harness.app.getHttpServer())
      .delete(`/api/trainers/${own?.id}`)
      .set('Cookie', await harness.as(2));

    expect(response.status).toBe(200);
    expect((response.body as { data?: { outcome?: string } }).data?.outcome).toBe('archived');
  });
});
