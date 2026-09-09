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

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { computeClubReliability, computeTrainerReliability } from '@sporthub/domain';
import { fixtureDictionaryCollections } from '@sporthub/fixtures';
import type { Booking } from '@sporthub/types';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Владелец клубов 1 и 2. Карточку тренера он после этапа Э8a вести не может. */
const OWNER_ID = 2;
/** Тренер — владелец карточки 1. Клуб он публиковать не может. */
const TRAINER_ID = 4;
/** Провайдер без единой публикации — им проверяется «чужое». */
const STRANGER_ID = 9;
/** Другой тренер, тоже без публикаций: им проверяется чужая КАРТОЧКА, а не чужое право. */
const OTHER_TRAINER_ID = 10;
/** Администратор: право модерации разрешает ему трогать чужие публикации. */
const ADMIN_ID = 3;
/** Атлет: нужен записью на занятие, которую чужое удаление не имеет права унести. */
const ATHLETE_ID = 1;

const user = (id: number, role: string, name: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
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
 * Люди набора: атлет, администратор и по паре на каждую роль провайдера.
 *
 * Пара «свой + чужой» в каждой роли обязательна: без чужого той же роли отказ
 * по владению неотличим от отказа по праву.
 *
 * Список общий для всех срезов набора: каждая запись пересобирает базу целиком,
 * и срез, забывший кого-то из шестерых, отвечал бы его запросам 401 вместо
 * проверяемого отказа или успеха.
 */
const USERS = [
  user(ATHLETE_ID, 'athlete', 'Алексей'),
  user(OWNER_ID, 'club_owner', 'Марина'),
  user(ADMIN_ID, 'admin', 'Администратор'),
  user(STRANGER_ID, 'club_owner', 'Чужой'),
  user(TRAINER_ID, 'trainer', 'Павел'),
  user(OTHER_TRAINER_ID, 'trainer', 'Чужой тренер'),
];

/**
 * Карточка тренера. Владелец задаётся снаружи — именно он здесь и проверяется.
 *
 * Этап Э8a фазы 34 отдал карточку роли тренера, а шаг 35.17 показал обратную
 * сторону того же решения: карточками владеют и представители услуг тоже, и
 * роль запирала их у собственной вещи.
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
      // Этап Э8a: карточка тренера принадлежит пользователю с ролью тренера.
      // До разделения ею владел представитель услуг — то есть роль в данных
      // была, а в правах её не было.
      trainers: [trainerCard()],
      offerings: [CLUB_OFFERING, TRAINER_OFFERING],
      schedule: [CLUB_SLOT],
      bookings: [CLUB_BOOKING],
      reviews: [],
      logs: [],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer();

  describe('разбор параметров выдачи', () => {
    it('неизвестная сортировка отклоняется', async () => {
      const response = await request(server()).get('/api/clubs?sort=price');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ success: false, error: 'Некорректные параметры запроса' });
    });

    it('неизвестное направление сортировки отклоняется', async () => {
      const response = await request(server()).get('/api/clubs?dir=up');

      expect(response.status).toBe(400);
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

      const all = await request(server()).get('/api/clubs?includeHidden=true');
      expect(all.body.data).toHaveLength(2);
    });

    it('неизвестная сортировка тренеров отклоняется', async () => {
      const response = await request(server()).get('/api/trainers?sort=price');

      expect(response.status).toBe(400);
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

  // Надёжность публикации приходит ВМЕСТЕ с карточкой.
  //
  // ⚠️ Это не украшение выдачи, а починка: бейдж надёжности считал фронт и забирал
  // ради него полный срез записей площадки. Фаза 34 закрыла полный срез — и главная
  // вместе с карточками клуба и тренера начали отвечать пятисотой. Поэтому здесь
  // проверяется И присутствие поля, И совпадение чисел с чистой функцией на тех же
  // данных: одно присутствие поля зелено и тогда, когда в нём лежат другие числа.
  describe('надёжность в выдаче каталога', () => {
    /** Записи, из которых складывается надёжность клуба 1 и тренера 1. */
    const RELIABILITY_BOOKINGS = [
      // Клуб 1: два проведённых занятия.
      booking(11, { status: 'completed' }),
      booking(12, { status: 'completed' }),
      // Неявок ДВЕ, отмена провайдером одна, отказ один: все четыре счётчика
      // разной величины. С одинаковыми числами перепутанные местами статусы
      // дали бы тот же результат, и проверка ничего не доказывала бы.
      booking(13, { status: 'no_show' }),
      booking(14, { status: 'no_show' }),
      booking(17, { status: 'rejected_by_provider' }),
      // Отмена атлетом к репутации провайдера не относится — в расчёт не идёт.
      booking(15, { status: 'cancelled_by_athlete' }),
      // Тренерское занятие в зале клуба 1: относится и к тренеру 1, и к клубу.
      booking(16, {
        status: 'cancelled_by_provider',
        ownerType: 'trainer',
        ownerId: 1,
        trainerId: 1,
        clubId: 1,
      }),
    ];

    beforeEach(async () => {
      await harness.write('bookings', RELIABILITY_BOOKINGS);
    });

    it('список клубов отдаёт надёжность, совпадающую с расчётом по записям', async () => {
      const response = await request(server()).get('/api/clubs');

      const first = response.body.data.find((item: { id: number }) => item.id === 1);
      expect(first.reliability).toEqual(
        computeClubReliability(RELIABILITY_BOOKINGS as unknown as Booking[], 1),
      );
      // Клуб без единой записи тоже получает результат, а не пропуск: иначе
      // «записей нет» стало бы неотличимо от «надёжность не посчитали».
      const second = response.body.data.find((item: { id: number }) => item.id === 2);
      expect(second.reliability).toEqual(
        computeClubReliability(RELIABILITY_BOOKINGS as unknown as Booking[], 2),
      );
    });

    it('карточка клуба отдаёт ту же надёжность, что и список', async () => {
      const detail = await request(server()).get('/api/clubs/1');
      const bySlug = await request(server()).get('/api/clubs/by-slug/club-1');

      const expected = computeClubReliability(RELIABILITY_BOOKINGS as unknown as Booking[], 1);
      expect(detail.body.data.club.reliability).toEqual(expected);
      expect(bySlug.body.data.club.reliability).toEqual(expected);
    });

    it('список и карточка тренера отдают надёжность тренера', async () => {
      const list = await request(server()).get('/api/trainers');
      const detail = await request(server()).get('/api/trainers/1');

      const expected = computeTrainerReliability(RELIABILITY_BOOKINGS as unknown as Booking[], 1);
      expect(list.body.data[0].reliability).toEqual(expected);
      expect(detail.body.data.trainer.reliability).toEqual(expected);
    });

    it('надёжность приходит гостю — ради неё вход не требуется', async () => {
      const response = await request(server()).get('/api/clubs');

      expect(response.status).toBe(200);
      // Именно за этим числом публичная страница ходила в закрытый полный срез
      // записей и получала отказ.
      expect(response.body.data[0].reliability).toBeDefined();
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

    it('удаление по нечисловому идентификатору отклоняется', async () => {
      const response = await request(server())
        .delete('/api/clubs/abc')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(response.status).toBe(400);
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
      expect(response.body.error).toBe('Недостаточно прав для редактирования клуба с id 1');

      // Главное здесь — не код ответа, а последствия: именно этим запросом
      // раньше исчезала чужая публикация и вместе с ней чужая запись на занятие.
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
      expect(await harness.read<{ id: number }[]>('bookings')).toHaveLength(1);
    });

    it('чужого тренера удалить нельзя', async () => {
      // Отказ по ВЛАДЕНИЮ: роль та же, карточка чужая. Пара к следующей проверке —
      // без неё непонятно, чем именно остановлен запрос.
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(OTHER_TRAINER_ID));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для редактирования тренера с id 1');
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(1);
    });

    it('представителя услуг тренерская карточка не касается вовсе', async () => {
      // Отказ по ПРАВУ, и он приходит раньше проверки владения: представителю
      // услуг тренерские карточки не положены как вид публикации.
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(STRANGER_ID));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(1);
    });

    it('владелец удаляет свою публикацию', async () => {
      const response = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(response.status).toBe(200);
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(1);
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
  // Этап Э8a: решение заказчика от 08.09.2026. До него `club_owner` и `trainer`
  // были одной ролью по правам — оба публиковали и клуб, и себя как тренера.
  // Здесь проверяется само разделение: каждый отказ стоит в паре с успехом той
  // роли, которой действие положено, иначе зелёный отказ не отличить от маршрута,
  // сломанного для всех.
  describe('разделение прав представителя услуг и тренера', () => {
    // Клуб тренера отличается от общей формы только названием, адресом и датой
    // слота — остальное та же форма публикации, и повторять её целиком незачем.
    const clubForm = {
      ...CLUB_FORM,
      name: 'Клуб тренера',
      address: 'Ленина 3',
      scheduleSlots: [{ ...CLUB_FORM.scheduleSlots[0], date: '2026-09-02' }],
    };

    it('тренер не публикует клуб', async () => {
      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send(clubForm);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
      // Отказ обязан быть отказом: клуб не должен появиться и «заодно».
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
    });

    it('тренер не правит чужой клуб и не удаляет его', async () => {
      const patched = await request(server())
        .patch('/api/clubs/1')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send({ ...clubForm, scheduleSlots: [{ ...clubForm.scheduleSlots[0], id: 1 }] });

      expect(patched.status).toBe(403);
      expect(patched.body.error).toBe('Недостаточно прав');

      const removed = await request(server())
        .delete('/api/clubs/1')
        .set('Cookie', await harness.as(TRAINER_ID));

      expect(removed.status).toBe(403);
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(2);
    });

    it('представитель услуг публикует клуб — контрольная группа к отказу тренера', async () => {
      const response = await request(server())
        .post('/api/clubs')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(clubForm);

      expect(response.status).toBe(201);
    });

    it('представитель услуг не публикуется тренером', async () => {
      const response = await request(server())
        .post('/api/trainers')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(TRAINER_FORM);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(1);
    });

    it('представитель услуг не правит карточку тренера', async () => {
      const response = await request(server())
        .patch('/api/trainers/1')
        .set('Cookie', await harness.as(OWNER_ID))
        .send(TRAINER_FORM);

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
    });

    it('тренер публикует себя — контрольная группа к отказу представителя услуг', async () => {
      const response = await request(server())
        .post('/api/trainers')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send(TRAINER_FORM);

      expect(response.status).toBe(201);

      const trainers = await harness.read<{ name: string; managedByUserId?: number }[]>('trainers');
      const created = trainers.find((item) => item.name === 'Павел Тренеров');

      expect(created?.managedByUserId).toBe(TRAINER_ID);
    });

    it('тренер правит свою карточку и удаляет её', async () => {
      const patched = await request(server())
        .patch('/api/trainers/1')
        .set('Cookie', await harness.as(TRAINER_ID))
        .send(TRAINER_FORM);

      expect(patched.status).toBe(200);

      const removed = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(TRAINER_ID));

      expect(removed.status).toBe(200);
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(0);
    });

    it('администратор удаляет чужую карточку тренера правом модерации', async () => {
      // Модератору владение не нужно — и роль тренера тоже: у него своё право,
      // и перечисление в требовании маршрута существует ровно ради этого случая.
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(ADMIN_ID));

      expect(response.status).toBe(200);
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(0);
    });
  });

  // Шаг 35.17: владение решает, а не роль.
  //
  // Этап Э8a развёл права по ролям — и запер владельцев у их собственных вещей:
  // карточка тренера, заведённая представителем услуг, перестала слушаться
  // хозяина (в живой базе так заперты 4 карточки из 11). Роль говорила одно,
  // владение — другое, и права слушали роль.
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

    it('владелец удаляет свою карточку тренера', async () => {
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(OWNER_ID));

      expect(response.status).toBe(200);
      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(0);
    });

    it('посторонний чужую карточку не правит и не удаляет — она на месте', async () => {
      // Двое посторонних, и отказы у них РАЗНОГО происхождения: у тренера право
      // роли есть, и его останавливает ВЛАДЕНИЕ внутри сервиса; у представителя
      // услуг нет и права — его останавливает guard, ещё до сервиса.
      //
      // Текст сверяется только у первого, и это не небрежность. Отказ по владению
      // называет вещь поимённо, и он обязан звучать именно так: сломай проверку
      // владения — и вместо него придёт общий отказ по праву. А вот текст отказа
      // ПО ПРАВУ пинить нельзя: шаг 35.19 убирает владельческие права из словаря,
      // и тогда обоих остановит одно и то же владение. Общая часть текста живёт
      // в обоих мирах, поимённая — только там, где сработало владение.
      const strangers = [
        { userId: OTHER_TRAINER_ID, error: 'Недостаточно прав для редактирования тренера с id 1' },
        { userId: STRANGER_ID, error: undefined },
      ];

      for (const stranger of strangers) {
        const patched = await request(server())
          .patch('/api/trainers/1')
          .set('Cookie', await harness.as(stranger.userId))
          .send(TRAINER_FORM);

        expect(patched.status).toBe(403);
        expect(patched.body.error).toContain(stranger.error ?? 'Недостаточно прав');

        const removed = await request(server())
          .delete('/api/trainers/1')
          .set('Cookie', await harness.as(stranger.userId));

        expect(removed.status).toBe(403);
        expect(removed.body.error).toContain(stranger.error ?? 'Недостаточно прав');
      }

      expect(await harness.read<{ id: number }[]>('trainers')).toHaveLength(1);
    });

    it('владелец правит и удаляет свой клуб, хотя роль у него тренерская', async () => {
      // Обратная сторона того же дефекта: `manage_own_clubs` есть только
      // у представителя услуг, а клубом владеет тренер.
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
      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(0);
    });

    it('посторонний чужой клуб не правит и не удаляет — он на месте', async () => {
      // Зеркало к карточке: право на клубы есть у представителя услуг, и его
      // останавливает владение; у тренера права нет — его останавливает guard.
      const strangers = [
        { userId: STRANGER_ID, error: 'Недостаточно прав для редактирования клуба с id 1' },
        { userId: OTHER_TRAINER_ID, error: undefined },
      ];

      for (const stranger of strangers) {
        const patched = await request(server())
          .patch('/api/clubs/1')
          .set('Cookie', await harness.as(stranger.userId))
          .send(CLUB_FORM);

        expect(patched.status).toBe(403);
        expect(patched.body.error).toContain(stranger.error ?? 'Недостаточно прав');

        const removed = await request(server())
          .delete('/api/clubs/1')
          .set('Cookie', await harness.as(stranger.userId));

        expect(removed.status).toBe(403);
        expect(removed.body.error).toContain(stranger.error ?? 'Недостаточно прав');
      }

      expect(await harness.read<{ id: number }[]>('clubs')).toHaveLength(1);
    });
  });
});
