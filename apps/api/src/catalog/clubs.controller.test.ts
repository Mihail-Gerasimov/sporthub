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

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Владелец обеих публикаций набора: клубов 1 и 2 и тренера 1. */
const OWNER_ID = 2;
/** Провайдер без единой публикации — им проверяется «чужое». */
const STRANGER_ID = 9;
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
      users: [
        user(ATHLETE_ID, 'athlete', 'Алексей'),
        user(OWNER_ID, 'club_owner', 'Марина'),
        user(ADMIN_ID, 'admin', 'Администратор'),
        user(STRANGER_ID, 'club_owner', 'Чужой'),
      ],
      clubs: [club(1), club(2, { rating: 2, sportIds: [5] })],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина Соколова',
          slug: 'marina-sokolova',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          priceFrom: 900,
          managedByUserId: OWNER_ID,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
      ],
      offerings: [CLUB_OFFERING],
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

  describe('публикация и правка', () => {
    const form = {
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

    // Правка существующего клуба шлёт слот с номером: без него слот 1 считался бы
    // выброшенным из расписания, и проверка владения потянула бы за собой отмену
    // записи — лишний шум там, где проверяется право, а не расписание.
    const editForm = {
      ...form,
      name: 'Клуб 1 после правки',
      scheduleSlots: [{ ...form.scheduleSlots[0], id: 1 }],
    };

    it('гость не публикует клуб — 401', async () => {
      // Заменил прежнюю проверку «публикация от несуществующего пользователя».
      // Тот сценарий больше недостижим: номер публикующего приходит не из тела,
      // а из сессии, и у несуществующего пользователя сессии быть не может.
      // Достижим ровно один случай «личности нет» — её нет вовсе.
      const response = await request(server()).post('/api/clubs').send(form);

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
        .send({ ...form, userId: OWNER_ID });

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
        .send(form);

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
      const response = await request(server())
        .delete('/api/trainers/1')
        .set('Cookie', await harness.as(STRANGER_ID));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для редактирования тренера с id 1');
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
});
