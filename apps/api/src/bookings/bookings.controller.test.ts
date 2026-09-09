// Тесты маршрутов записей.
//
// Набор переписан вместе с переводом маршрутов на сессию (шаг 34.21). Главное,
// что здесь проверяется теперь и не могло проверяться раньше:
//
// - анонимный вызов любого из восьми маршрутов даёт 401;
// - действовать от чужого имени нечем — `userId` в теле и в строке запроса
//   не влияет ни на что, запись создаётся на владельца сессии;
// - чужую запись нельзя ни отменить, ни подтвердить, ни отметить;
// - полный срез платформы (`?scope=all`) закрыт правом администратора;
// - под имперсонизацией в журнале остаётся тот, кто ВОШЁЛ, а сама запись
//   принадлежит тому, от чьего лица работали.
//
// Слоты строятся относительно текущего момента: слот, закончившийся час назад,
// идущий прямо сейчас и закончившийся трое суток назад. Так тест проверяет ту же
// арифметику, что и рабочий сервер.
//
// ⚠️ Час прогона зафиксирован на полудне, и это не украшение. У слота ОДНА дата,
// а время начала и конца — отдельные поля; база сверяет их ограничением
// `schedule_time_order`. Прогон около полуночи давал слот, пересекающий сутки:
// дата оставалась вчерашней, а время конца выходило «раньше» начала (23:57
// против 00:57), и вставка отбивалась — 22 теста краснели ровно между 23:00
// и 01:00, а в остальное время набор был зелёным. Сдвинуть сам слот нельзя:
// тест «занятие идёт прямо сейчас» обязан пересекать текущий момент, и около
// полуночи такого слота в одних сутках не существует. Поэтому фиксируется момент
// отсчёта, а не слот.
//
// Подделываются ТОЛЬКО часы (`toFake: ['Date']`): таймеры соединений с базой
// и ожидания запросов остаются настоящими, иначе прогон повис бы.
//
// ⚠️ Cookie берётся ПОСЛЕ последней записи данных: каждая запись пересобирает базу
// целиком, а сессии — обычная таблица той же схемы. Выданная раньше cookie умрёт
// вместе с засевом, и тест получит 401 без единого намёка на причину.
//
// ⚠️ Фаза 35 сняла роли, и часть набора переписана под это. Кто может записаться,
// решает вид учётной записи (человек или администратор), кто может разбирать
// заявки и видеть срезы кабинета — ВЛАДЕНИЕ публикацией. Там, где отказ раньше
// приходил от декоратора `@Requires` общим текстом «Недостаточно прав», он теперь
// приходит от проверки владения — со своим текстом и из другого места.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { SESSION_COOKIE_NAME } from '../auth/session-cookie';
import { SessionService } from '../auth/session.service';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';

/** Дата и время слота, сдвинутые относительно текущего момента. */
function slotAt(offsetHoursFromNow: number, durationMinutes = 60) {
  const start = new Date(Date.now() + offsetHoursFromNow * 60 * 60 * 1000);
  const end = new Date(start.getTime() + durationMinutes * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');

  return {
    date: `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())}`,
    startTime: `${pad(start.getHours())}:${pad(start.getMinutes())}`,
    endTime: `${pad(end.getHours())}:${pad(end.getMinutes())}`,
  };
}

const user = (id: number, role: string, over: Record<string, unknown> = {}) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@test.local`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
  ...over,
});

/** Слот тренера 1, которым управляет пользователь 2. */
const slot = (
  id: number,
  timing: ReturnType<typeof slotAt>,
  over: Record<string, unknown> = {},
) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'trainer',
  ownerId: 1,
  trainerId: 1,
  offeringId: 1,
  sportId: 3,
  title: 'Занятие',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 5,
  bookedCount: 0,
  price: 1000,
  ...timing,
  ...over,
});

const booking = (id: number, over: Record<string, unknown> = {}) => ({
  id,
  createdAt: '2026-02-01T00:00:00.000Z',
  userId: 1,
  scheduleId: 1,
  trainerId: 1,
  ownerType: 'trainer',
  ownerId: 1,
  sportId: 3,
  status: 'confirmed',
  date: '2026-03-18',
  totalPrice: 1000,
  statusHistory: [],
  ...over,
});

/** Номера записей из ответа — по ним читаются все проверки выдачи. */
const ids = (body: { data: { id: number }[] }) => body.data.map((item) => item.id);

/**
 * Строка среза по номеру — для тестов, которые дописывают фикстуры поверх засева.
 *
 * Берётся именно строка ИЗ БАЗЫ, а не сочиняется рядом: запись коллекции переносит
 * срез целиком, и у дописанной строки обязаны быть все колонки соседей. Отсутствие
 * строки — ошибка набора, и она обязана падать здесь, а не внешним ключом в переносе.
 */
function rowById(rows: Record<string, unknown>[], id: number): Record<string, unknown> {
  const row = rows.find((item) => item.id === id);

  if (row === undefined) {
    throw new Error(`В срезе нет строки ${id} — набор засеял не то, что проверяет`);
  }

  return row;
}

describe('Маршруты записей', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    // Полдень текущих суток: любой слот из `slotAt` укладывается в одни сутки.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(noon);

    harness = await createTestHarness('bookings-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: слот ссылается на услугу и тренера, тренер —
    // на справочник видов спорта и управляющего пользователя.
    //
    // Пользователь 5 — представитель услуг, который не управляет НИЧЕМ. Он нужен
    // именно как «чужой провайдер»: до перевода на сессию эту роль играл атлет,
    // и проверка «чужой не может» проходила бы даже без единой проверки владения.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
        user(1, 'athlete'),
        user(2, 'club_owner'),
        user(3, 'admin'),
        user(4, 'athlete'),
        user(5, 'club_owner'),
        // ⚠️ Фаза 35: роль в этой строке не решает уже ничего — она осталась
        // только потому, что колонка жива до шага 35.24. Что положено пользователю 6,
        // определяет ВЛАДЕНИЕ: ниже он выступает и человеком без единого лица услуг,
        // и тренером своего занятия — в зависимости от того, что засеял набор.
        user(6, 'trainer'),
      ],
      trainers: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина',
          slug: 'marina',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          priceFrom: 1000,
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
      ],
      offerings: [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'trainer',
          ownerId: 1,
          sportId: 3,
          title: 'Персональная',
          description: 'Описание',
          format: 'personal',
          price: 1000,
          durationMinutes: 60,
          capacity: 5,
          address: 'ул. Ленина, 1',
          coordinates: { lat: 53.2, lng: 50.1 },
          cancellationPolicy: 'free_until_24h',
        },
      ],
      clubs: [
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Волна',
          slug: 'volna',
          description: 'Описание',
          shortDescription: 'Кратко',
          city: 'Самара',
          address: 'ул. Ленина, 1',
          phone: '+7 900 000-00-00',
          coordinates: { lat: 53.2, lng: 50.1 },
          sportIds: [3],
          tagIds: [],
          amenityIds: [],
          imageUrls: [],
          rating: 4,
          reviewCount: 0,
          priceFrom: 500,
          distanceKm: 1,
          managedByUserId: 2,
          status: 'published',
        },
      ],
      // ⚠️ Расписание чистится ВМЕСТЕ с остальным срезом, а не остаётся от
      // предыдущего теста. Пока его тут не было, слоты доживали до следующего
      // засева и ссылались на услуги и тренеров, которых он уже не заводит, —
      // перенос падал на внешнем ключе, причём в чужом тесте и без связи с ним.
      schedule: [],
      bookings: [],
      notifications: [],
      logs: [],
    });
  });

  afterAll(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer();

  /** От чьего лица идёт запрос. Способ переноса личности знает обвязка. */
  const as = (userId: number) => harness.as(userId);

  /**
   * Cookie администратора, работающего ОТ ЛИЦА другого пользователя.
   *
   * Обвязка такого не умеет намеренно: имперсонизация — не «войти за кого-то»,
   * а две личности в одной сессии, и нужна она ровно одному набору проверок —
   * тому, что след в журнале остаётся за настоящим исполнителем.
   */
  const asImpersonating = async (adminId: number, targetUserId: number): Promise<string> => {
    const users = harness.app.get<UsersRepository>(USERS_REPOSITORY);
    const admin = await users.findById(adminId);

    if (admin === null) {
      throw new Error(`Обвязка не может войти за администратора ${adminId}: его нет в базе`);
    }

    const { token } = await harness.app.get(SessionService).issue({
      user: admin,
      now: new Date(),
      impersonatedUserId: targetUserId,
    });

    return `${SESSION_COOKIE_NAME}=${encodeURIComponent(token)}`;
  };

  describe('GET /api/bookings — выдача', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(24), { bookedCount: 3 })]);
      await harness.write('bookings', [
        booking(7, { date: '2026-03-10', status: 'pending' }),
        booking(8, { userId: 4, date: '2026-03-20', status: 'confirmed' }),
        booking(9, {
          date: '2026-03-30',
          status: 'completed',
          ownerType: 'club',
          ownerId: 2,
          clubId: 2,
          trainerId: undefined,
        }),
      ]);
    });

    it('гостю выдача не отдаётся', async () => {
      const response = await request(server()).get('/api/bookings');

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: 'Требуется вход' });
    });

    it('атлет получает только свои записи', async () => {
      const response = await request(server())
        .get('/api/bookings')
        .set('Cookie', await as(1));

      expect(response.status).toBe(200);
      // Порядок «моих записей» — по дню занятия.
      expect(ids(response.body)).toEqual([7, 9]);
    });

    it('чужой userId в строке запроса не меняет ничего', async () => {
      // Раньше этот параметр И БЫЛ ответом на вопрос «чьи записи отдать»:
      // подставил чужой номер — получил чужие записи. Теперь он игнорируется,
      // как любой неизвестный параметр.
      const response = await request(server())
        .get('/api/bookings?userId=4')
        .set('Cookie', await as(1));

      expect(response.status).toBe(200);
      expect(ids(response.body)).toEqual([7, 9]);
    });

    it('полный срез платформы обычному пользователю закрыт', async () => {
      const response = await request(server())
        .get('/api/bookings?scope=all')
        .set('Cookie', await as(1));

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ success: false, error: 'Недостаточно прав' });
    });

    it('полный срез платформы закрыт и провайдеру', async () => {
      const response = await request(server())
        .get('/api/bookings?scope=all')
        .set('Cookie', await as(2));

      expect(response.status).toBe(403);
    });

    it('полный срез платформы гостю закрыт', async () => {
      const response = await request(server()).get('/api/bookings?scope=all');

      expect(response.status).toBe(401);
    });

    it('администратор получает полный срез', async () => {
      const response = await request(server())
        .get('/api/bookings?scope=all')
        .set('Cookie', await as(3));

      expect(response.status).toBe(200);
      // Полный срез сохраняет порядок появления — на нём стоит эталон контрактов.
      expect(ids(response.body)).toEqual([7, 8, 9]);
    });

    // Сужение выдачи (шаг 33.27a). До него 14 страниц фронта тянули полный срез
    // записей платформы, чтобы показать записи одного человека или одного клуба.
    // Все параметры ниже — необязательные: без них маршрут отвечает как прежде.
    describe('сужение выдачи', () => {
      it('полный срез сужается по клубу', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=all&clubId=2')
          .set('Cookie', await as(3));

        expect(response.status).toBe(200);
        expect(ids(response.body)).toEqual([9]);
      });

      it('полный срез сужается по тренеру', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=all&trainerId=1')
          .set('Cookie', await as(3));

        expect(ids(response.body)).toEqual([7, 8]);
      });

      it('полный срез сужается по периоду дня занятия', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=all&dateFrom=2026-03-20&dateTo=2026-03-30')
          .set('Cookie', await as(3));

        expect(ids(response.body)).toEqual([8, 9]);
      });

      it('полный срез сужается по набору статусов через запятую', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=all&status=pending,confirmed')
          .set('Cookie', await as(3));

        expect(ids(response.body)).toEqual([7, 8]);
      });

      it('постраничность режет полный срез', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=all&offset=1&limit=1')
          .set('Cookie', await as(3));

        expect(ids(response.body)).toEqual([8]);
      });

      it('выдумка в наборе статусов — 400 с прежним текстом', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=all&status=выдумка')
          .set('Cookie', await as(3));

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Некорректные параметры запроса');
      });

      it('неизвестный параметр по-прежнему игнорируется, а не отвергается', async () => {
        // Прежний маршрут лишние параметры молча пропускал; превращать их в отказ
        // значило бы сломать уже работающие ссылки.
        const response = await request(server())
          .get('/api/bookings?scope=all&неведомое=1')
          .set('Cookie', await as(3));

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(3);
      });

      it('свои записи сужаются теми же параметрами', async () => {
        const response = await request(server())
          .get('/api/bookings?dateFrom=2026-03-30')
          .set('Cookie', await as(1));

        expect(ids(response.body)).toEqual([9]);
      });

      it('сужение по клубу не показывает чужие записи', async () => {
        // Отбор сужает СВОИ записи, а не открывает доступ к чужим: у пользователя 4
        // в клубе 2 записей нет, и параметр клуба ничего ему не добавляет.
        const response = await request(server())
          .get('/api/bookings?clubId=2')
          .set('Cookie', await as(4));

        expect(response.status).toBe(200);
        expect(ids(response.body)).toEqual([]);
      });
    });
  });

  // Срезы кабинета провайдера (шаг 34.58).
  //
  // Кабинету нужны два разных набора записей, и ни одного из них не существовало:
  // обе страницы добывали их из `?scope=all`, то есть забирали площадку целиком
  // и отбирали своё уже у себя. После того как полный срез ушёл под право
  // администратора, кабинет перестал открываться вовсе — 403 на каждой странице.
  //
  // - `?scope=owner` — записи ПУБЛИКАЦИЙ провайдера. Раньше страница спрашивала их
  //   веером: по запросу на каждый свой клуб и каждого тренера, и в каждом стоял
  //   `scope=all`.
  // - `?scope=clients` — история ЛЮДЕЙ, которые к этим публикациям записывались.
  //   Она нужна бейджу надёжности: он считается по всей истории атлета, а не по
  //   той её части, что пришлась на этого провайдера. Отобрать её по одному
  //   человеку за запрос нельзя — клиентов бывают сотни.
  //
  // В обоих режимах личность берётся из сессии, публикации — по индексу владельца,
  // а сужение уходит условием в запрос.
  describe('GET /api/bookings — срезы кабинета провайдера', () => {
    beforeEach(async () => {
      // Второй провайдер обязателен: без него «не отдаёт чужих клиентов» проверялось
      // бы на пустом месте — чужих клиентов в срезе просто не существовало бы.
      await harness.writeMany({
        clubs: [
          {
            id: 3,
            createdAt: '2026-01-01T00:00:00.000Z',
            name: 'Чужой клуб',
            slug: 'chuzhoy',
            description: 'Описание',
            shortDescription: 'Кратко',
            city: 'Самара',
            address: 'ул. Мира, 2',
            phone: '+7 900 000-00-01',
            coordinates: { lat: 53.3, lng: 50.2 },
            sportIds: [3],
            tagIds: [],
            amenityIds: [],
            imageUrls: [],
            rating: 4,
            reviewCount: 0,
            priceFrom: 500,
            distanceKm: 1,
            managedByUserId: 5,
            status: 'published',
          },
        ],
        schedule: [
          slot(1, slotAt(24), { bookedCount: 1 }),
          slot(2, slotAt(48), {
            bookedCount: 2,
            ownerType: 'club',
            ownerId: 3,
            trainerId: undefined,
          }),
        ],
        bookings: [
          // Атлет 1 записывался к тренеру провайдера 2 — он его клиент.
          booking(7, { userId: 1, scheduleId: 1, status: 'completed' }),
          // Атлет 4 ходил ТОЛЬКО в чужой клуб 3 — контрольная группа.
          booking(8, {
            userId: 4,
            scheduleId: 2,
            status: 'completed',
            ownerType: 'club',
            ownerId: 3,
            clubId: 3,
            trainerId: undefined,
          }),
          // История атлета 1 у чужого провайдера: она и есть то, ради чего режим
          // заведён, — бейдж надёжности обязан её видеть.
          booking(9, {
            userId: 1,
            scheduleId: 2,
            status: 'no_show',
            ownerType: 'club',
            ownerId: 3,
            clubId: 3,
            trainerId: undefined,
          }),
        ],
      });
    });

    /**
     * Выдать пользователю 6 лицо услуг: клуб, занятие и запись на него.
     *
     * Нужен обоим срезам и живёт одним объявлением: пока роли решали доступ,
     * человек без публикаций был отдельным СОРТОМ пользователя; теперь это тот же
     * человек до и после появления лица, и оба среза обязаны понимать переход
     * одинаково. Строки дописываются поверх засева — клуб-образец и слот-образец
     * берутся из базы, чтобы у новых строк были все колонки соседей.
     *
     * Клиентом нового клуба становится атлет 4: у него уже есть запись у соседа,
     * и на нём видно, что история клиента шире одного провайдера.
     */
    const giveSixthAClub = async () => {
      const [clubs, schedule, bookings] = await Promise.all([
        harness.read<Record<string, unknown>[]>('clubs'),
        harness.read<Record<string, unknown>[]>('schedule'),
        harness.read<Record<string, unknown>[]>('bookings'),
      ]);

      await harness.writeMany({
        clubs: [
          ...clubs,
          {
            ...rowById(clubs, 3),
            id: 4,
            name: 'Клуб шестого',
            slug: 'shestoy',
            managedByUserId: 6,
          },
        ],
        schedule: [...schedule, { ...rowById(schedule, 2), id: 3, ownerId: 4, bookedCount: 1 }],
        bookings: [
          ...bookings,
          booking(10, {
            userId: 4,
            scheduleId: 3,
            status: 'completed',
            ownerType: 'club',
            ownerId: 4,
            clubId: 4,
            trainerId: undefined,
            date: '2026-03-25',
          }),
        ],
      });
    };

    describe('?scope=owner — записи публикаций провайдера', () => {
      it('провайдер получает записи своих публикаций и ни одной чужой', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=owner')
          .set('Cookie', await as(2));

        expect(response.status).toBe(200);
        // Запись 7 — на занятие тренера 1, которым управляет провайдер 2.
        // Записи 8 и 9 — на чужой клуб 3, и в срез они не попадают.
        expect(ids(response.body)).toEqual([7]);
      });

      it('у каждого провайдера свои публикации', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=owner')
          .set('Cookie', await as(5));

        expect(ids(response.body)).toEqual([8, 9]);
      });

      it('человек без лиц услуг получает отказ, а не срез площадки', async () => {
        // ⚠️ Шаг 35.19b поменял ответ, но не смысл проверки. Раньше срез спрашивало
        // право роли, и человек без публикаций получал пустой список. Теперь
        // спрашивают владение, и отказ обязан остаться отказом: пустой ответ
        // читался бы как «записей пока нет» и прятал бы то, что спрашивать было
        // нечего, — ровно тот вид тихой поломки, ради которого заведены диверсии.
        //
        // Тело сверяется целиком: в отказе не должно приехать ни одной записи.
        const response = await request(server())
          .get('/api/bookings?scope=owner')
          .set('Cookie', await as(6));

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ success: false, error: 'Недостаточно прав' });
      });

      it('появилось лицо — появился и срез, и в нём только его записи', async () => {
        // ⚠️ Здесь живёт то, ради чего был написан прежний тест: сужение по владениям
        // не должно теряться. На отказе это больше не проверить, поэтому проверяется
        // на том, кому срез положен: у пользователя 6 появился клуб с одной записью,
        // и в срезе обязана оказаться ровно она — потеряй сужение, приедут все четыре.
        //
        // Заодно видно, что решает ВЛАДЕНИЕ, а не прежняя роль: тот же пользователь 6,
        // которому строкой выше отказали, получает 200 ровно с того момента, как
        // у него появилось лицо услуг.
        await giveSixthAClub();

        const response = await request(server())
          .get('/api/bookings?scope=owner')
          .set('Cookie', await as(6));

        expect(response.status).toBe(200);
        expect(ids(response.body)).toEqual([10]);
      });

      it('срез сужается набором статусов', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=owner&status=no_show')
          .set('Cookie', await as(5));

        expect(ids(response.body)).toEqual([9]);
      });

      it('гостю срез публикаций не отдаётся', async () => {
        const response = await request(server()).get('/api/bookings?scope=owner');

        expect(response.status).toBe(401);
      });

      it('спортсмену срез публикаций закрыт', async () => {
        // Разбор заявок — работа владельца публикации, а у пользователя 1
        // публикаций нет: спрашивать записи его лиц нечем.
        const response = await request(server())
          .get('/api/bookings?scope=owner')
          .set('Cookie', await as(1));

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ success: false, error: 'Недостаточно прав' });
      });
    });

    describe('?scope=clients — история клиентов провайдера', () => {
      it('провайдер получает всю историю своих клиентов', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(2));

        expect(response.status).toBe(200);
        // 7 — запись к самому провайдеру, 9 — та же голова у чужого провайдера.
        expect(ids(response.body)).toEqual([7, 9]);
      });

      it('чужие клиенты в срез не попадают', async () => {
        // ⚠️ Контрольная группа и одновременно диверсия: снять сужение по клиентам —
        // и здесь окажется запись 8, то есть история человека, который к провайдеру
        // не приходил ни разу.
        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(2));

        expect(ids(response.body)).not.toContain(8);
      });

      it('у каждого провайдера свои клиенты', async () => {
        // Клуб 3 ведёт провайдер 5, и его клиенты — оба атлета: у одного запись 8,
        // у другого 9. Значит срез считается от публикаций СПРАШИВАЮЩЕГО, а не отдаёт
        // всем одно и то же.
        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(5));

        expect(response.status).toBe(200);
        expect(ids(response.body)).toEqual([7, 8, 9]);
      });

      it('человек без лиц услуг получает отказ, а не историю чужих клиентов', async () => {
        // Шаг 35.19b, тот же довод, что и у среза публикаций: клиенты — это
        // владение, а не право роли. Прежняя роль тренера у пользователя 6
        // не значит ничего: публикаций нет — клиентов нет, и маршрут говорит
        // об этом отказом, а не пустым списком.
        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(6));

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ success: false, error: 'Недостаточно прав' });
      });

      it('появилось лицо — появился и срез, и чужие клиенты в него не попали', async () => {
        // Половина прежней проверки, которую отказ закрыть не может: сужение
        // по клиентам не должно теряться. В клуб пользователя 6 приходил атлет 4,
        // и его история — обе записи, включая занятие у соседа (ради этого режим
        // и заведён). Атлет 1 к нему не приходил ни разу, и ни одной его записи
        // в срезе быть не должно.
        await giveSixthAClub();

        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(6));

        expect(response.status).toBe(200);
        expect(ids(response.body)).toEqual([8, 10]);
        expect(ids(response.body), 'в срез попала история чужого клиента').not.toContain(7);
      });

      it('срез сужается набором статусов', async () => {
        const response = await request(server())
          .get('/api/bookings?scope=clients&status=completed')
          .set('Cookie', await as(2));

        expect(ids(response.body)).toEqual([7]);
      });

      it('гостю срез клиентов не отдаётся', async () => {
        const response = await request(server()).get('/api/bookings?scope=clients');

        expect(response.status).toBe(401);
      });

      it('спортсмену срез клиентов закрыт', async () => {
        // У человека без публикаций клиентов не бывает — и маршрут говорит об этом
        // прямо, вместо того чтобы отдать пустой список и сделать вид, что всё в порядке.
        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(1));

        expect(response.status).toBe(403);
        expect(response.body).toEqual({ success: false, error: 'Недостаточно прав' });
      });

      it('администратору срез клиентов закрыт — у него свой полный', async () => {
        // Решение заказчика 13: администратор — не человек площадки, лиц услуг
        // он не заводит, и своих клиентов у него нет. Разбирать площадку он ходит
        // через `?scope=all` — единственный срез, который ему положен.
        const response = await request(server())
          .get('/api/bookings?scope=clients')
          .set('Cookie', await as(3));

        expect(response.status).toBe(403);
      });
    });
  });

  describe('GET /api/bookings/:id — административное чтение', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(24), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);
    });

    it('администратор получает запись целиком', async () => {
      const response = await request(server())
        .get('/api/bookings/7')
        .set('Cookie', await as(3));

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(7);
    });

    it('владельцу записи отказано: маршрут служебный', async () => {
      const response = await request(server())
        .get('/api/bookings/7')
        .set('Cookie', await as(1));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
    });

    it('провайдеру отказано', async () => {
      const response = await request(server())
        .get('/api/bookings/7')
        .set('Cookie', await as(2));

      expect(response.status).toBe(403);
    });

    it('гостю отказано до всякого разбора', async () => {
      const response = await request(server()).get('/api/bookings/7');

      expect(response.status).toBe(401);
    });

    it('подстановка номера администратора в строку запроса не помогает', async () => {
      // Прежний маршрут спрашивал «а этот номер принадлежит админу?» у номера,
      // присланного самим клиентом. Теперь номер оттуда не читается вовсе.
      const response = await request(server())
        .get('/api/bookings/7?userId=3')
        .set('Cookie', await as(1));

      expect(response.status).toBe(403);
    });

    it('нечисловой идентификатор записи — отказ по данным', async () => {
      const response = await request(server())
        .get('/api/bookings/abc')
        .set('Cookie', await as(3));

      expect(response.status).toBe(400);
    });

    it('несуществующая запись — не найдено', async () => {
      const response = await request(server())
        .get('/api/bookings/999')
        .set('Cookie', await as(3));

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Запись не найдена');
    });
  });

  describe('POST /api/bookings — создание', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(48))]);
    });

    it('гость записаться не может', async () => {
      const response = await request(server()).post('/api/bookings').send({ scheduleId: 1 });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: 'Требуется вход' });
    });

    it('запись создаётся на владельца сессии', async () => {
      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(1))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(1);
    });

    it('чужой userId в теле не влияет ни на что', async () => {
      // Ключевая проверка шага: раньше именно это поле и решало, на кого записывать.
      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(1))
        .send({ scheduleId: 1, userId: 4 });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(1);
    });

    it('владелец записывается на СВОЁ занятие — решение заказчика 16', async () => {
      // ⚠️ Прежде тест закреплял обратное: «провайдер записаться не может». Запрет
      // держался ролью — право `book_sessions` было только у атлета, — а не смыслом:
      // владелец зала ходит в свой зал, и фаза 35 это прямо разрешила. Слот 1 ведёт
      // тренер 1, которым управляет пользователь 2, то есть занятие своё.
      //
      // ⚠️ Разрешение записаться не открывает решений по этой записи: подтвердить
      // и отметить себе посещение владелец не может — это правило «сам себе»,
      // и живёт оно в проверке владения записью, а не здесь.
      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(2))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(2);

      const stored = await harness.read<{ userId: number }[]>('bookings');
      expect(stored.map((item) => item.userId)).toEqual([2]);
    });

    it('представитель услуг записывается к чужому — прежняя роль не мешает', async () => {
      // Вторая половина той же отмены: пользователь 5 не управляет ни одной
      // публикацией этого среза, и для слота 1 он такой же посетитель, как любой.
      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(5))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(5);
    });

    it('администратор записаться не может: он не человек площадки', async () => {
      // Решение заказчика 13. Запрет остался, но держится не правом роли, а видом
      // учётной записи: базовый набор человека администратору не выдан вовсе.
      // Понадобилось тренироваться — заводит себе обычную учётную запись.
      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(3))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: 'Запись доступна только пользователям площадки',
      });

      // Отказ обязан быть отказом и в базе: записи администратора не появилось.
      const stored = await harness.read<{ userId: number }[]>('bookings');
      expect(stored).toEqual([]);
    });

    it('под имперсонизацией запись достаётся цели, а в журнале остаётся администратор', async () => {
      const cookie = await asImpersonating(3, 1);

      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', cookie)
        .send({ scheduleId: 1 });

      expect(response.status).toBe(201);
      // Действуют от лица атлета — запись его.
      expect(response.body.data.userId).toBe(1);

      const logs = await harness.read<{ action: string; actorId: number }[]>('logs');
      const created = logs.filter((entry) => entry.action === 'booking_create');

      expect(created).toHaveLength(1);
      // А след действия — за тем, кто на самом деле вошёл.
      expect(created[0]?.actorId).toBe(3);
    });

    it('три неявки подряд записи не мешают: санкций за неявки нет', async () => {
      // Фаза 35, этап Э0a: механизм санкций за неявки вырезан целиком. Неявки
      // по-прежнему считаются и видны в надёжности, но записаться больше
      // не запрещают — бейдж информирует, а не наказывает.
      const daysAgo = (days: number) =>
        new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      await harness.write('bookings', [
        booking(101, { status: 'no_show', createdAt: daysAgo(5), date: daysAgo(5).slice(0, 10) }),
        booking(102, { status: 'no_show', createdAt: daysAgo(4), date: daysAgo(4).slice(0, 10) }),
        booking(103, { status: 'no_show', createdAt: daysAgo(3), date: daysAgo(3).slice(0, 10) }),
      ]);

      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(1))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(1);
    });

    it('скрытая публикация закрывает запись', async () => {
      await harness.write('trainers', [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина',
          slug: 'marina',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          priceFrom: 1000,
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'hidden',
        },
      ]);

      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(1))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Публикация скрыта, запись невозможна');
    });

    it('мест не осталось — запись невозможна', async () => {
      await harness.write('schedule', [slot(1, slotAt(48), { capacity: 1, bookedCount: 1 })]);

      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(1))
        .send({ scheduleId: 1 });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ success: false, error: 'Свободных мест нет' });
    });

    it('без слота — отказ по данным', async () => {
      const response = await request(server())
        .post('/api/bookings')
        .set('Cookie', await as(1))
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректные данные записи');
    });
  });

  describe('DELETE /api/bookings/:id — отмена атлетом', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(48), { bookedCount: 2 })]);
      await harness.write('bookings', [booking(7), booking(8, { userId: 4 })]);
    });

    it('гость отменить не может', async () => {
      const response = await request(server()).delete('/api/bookings/7');

      expect(response.status).toBe(401);
    });

    it('владелец отменяет свою запись', async () => {
      const response = await request(server())
        .delete('/api/bookings/7')
        .set('Cookie', await as(1));

      expect(response.status).toBe(200);

      const stored = await harness.read<{ id: number; status: string }[]>('bookings');

      expect(stored.find((item) => item.id === 7)?.status).toBe('cancelled_by_athlete');
    });

    it('чужую запись отменить нельзя', async () => {
      const response = await request(server())
        .delete('/api/bookings/7')
        .set('Cookie', await as(4));

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для отмены записи');
    });

    it('подстановка чужого userId в тело не отменяет чужую запись', async () => {
      const response = await request(server())
        .delete('/api/bookings/7')
        .set('Cookie', await as(4))
        .send({ userId: 1 });

      expect(response.status).toBe(403);

      const stored = await harness.read<{ id: number; status: string }[]>('bookings');

      expect(stored.find((item) => item.id === 7)?.status).toBe('confirmed');
    });
  });

  describe('POST /api/bookings/:id/cancel — универсальная отмена', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(48), { bookedCount: 2 })]);
      await harness.write('bookings', [booking(7), booking(8, { userId: 4 })]);
    });

    it('гость отменить не может', async () => {
      const response = await request(server()).post('/api/bookings/7/cancel').send({});

      expect(response.status).toBe(401);
    });

    it('атлет отменяет свою запись', async () => {
      const response = await request(server())
        .post('/api/bookings/7/cancel')
        .set('Cookie', await as(1))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled_by_athlete');
    });

    it('провайдер занятия отменяет запись со своей стороны', async () => {
      const response = await request(server())
        .post('/api/bookings/7/cancel')
        .set('Cookie', await as(2))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('cancelled_by_provider');
    });

    it('чужой атлет отменить не может', async () => {
      const response = await request(server())
        .post('/api/bookings/7/cancel')
        .set('Cookie', await as(4))
        .send({ userId: 1 });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для отмены записи');
    });

    it('посторонний провайдер отменить не может', async () => {
      const response = await request(server())
        .post('/api/bookings/7/cancel')
        .set('Cookie', await as(5))
        .send({ userId: 2 });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для отмены записи');
    });
  });

  describe('POST /api/bookings/:id/confirm — подтверждение', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(24), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7, { status: 'pending' })]);
    });

    it('гость подтвердить не может', async () => {
      const response = await request(server()).post('/api/bookings/7/confirm').send({});

      expect(response.status).toBe(401);
    });

    it('провайдер занятия подтверждает заявку', async () => {
      const response = await request(server())
        .post('/api/bookings/7/confirm')
        .set('Cookie', await as(2))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('confirmed');
    });

    it('посторонний провайдер подтвердить не может', async () => {
      const response = await request(server())
        .post('/api/bookings/7/confirm')
        .set('Cookie', await as(5))
        .send({ userId: 2 });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для подтверждения записи');
    });

    it('сам атлет свою заявку подтвердить не может', async () => {
      // ⚠️ Фаза 35 сняла с маршрута декоратор `@Requires('manage_own_bookings')`,
      // и место отказа переехало во второй раз: сначала его давал guard по роли,
      // теперь — проверка ВЛАДЕНИЯ занятием, и текст ответа принадлежит ей.
      // Кому можно, не изменилось: своя заявка автору не подтверждается.
      const response = await request(server())
        .post('/api/bookings/7/confirm')
        .set('Cookie', await as(1))
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для подтверждения записи');

      // Кода ответа мало: заявка обязана остаться в прежнем состоянии.
      const stored = await harness.read<{ id: number; status: string }[]>('bookings');
      expect(stored.find((item) => item.id === 7)?.status).toBe('pending');
    });

    it('несуществующая запись — не найдено', async () => {
      const response = await request(server())
        .post('/api/bookings/999/confirm')
        .set('Cookie', await as(2))
        .send({});

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Запись не найдена');
    });

    it('под имперсонизацией в журнале стоит роль администратора, а не владельца клуба', async () => {
      // Номер исполнителя писался правильно, а роль — константой `club_owner`.
      // В журнале действие администратора выглядело действием провайдера: пара
      // «номер + роль» указывала на разных людей, и запись переставала быть следом.
      const cookie = await asImpersonating(3, 2);

      const response = await request(server())
        .post('/api/bookings/7/confirm')
        .set('Cookie', cookie)
        .send({});

      expect(response.status).toBe(200);

      const logs =
        await harness.read<{ action: string; actorId: number; actorRole: string }[]>('logs');
      const confirmed = logs.filter((entry) => entry.action === 'booking_confirm');

      expect(confirmed).toHaveLength(1);
      expect(confirmed[0]).toMatchObject({ actorId: 3, actorRole: 'admin' });
    });
  });

  describe('POST /api/bookings/:id/reject — отказ', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(24), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7, { status: 'pending' })]);
    });

    it('гость отказать не может', async () => {
      const response = await request(server())
        .post('/api/bookings/7/reject')
        .send({ reason: 'Нет мест' });

      expect(response.status).toBe(401);
    });

    it('провайдер занятия отклоняет заявку с причиной', async () => {
      const response = await request(server())
        .post('/api/bookings/7/reject')
        .set('Cookie', await as(2))
        .send({ reason: 'Нет мест' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('rejected_by_provider');
    });

    it('причина необязательна', async () => {
      const response = await request(server())
        .post('/api/bookings/7/reject')
        .set('Cookie', await as(2))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('rejected_by_provider');
    });

    it('посторонний провайдер отклонить не может', async () => {
      const response = await request(server())
        .post('/api/bookings/7/reject')
        .set('Cookie', await as(5))
        .send({ userId: 2, reason: 'Чужая заявка' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для отклонения записи');
    });
  });

  describe('POST /api/bookings/:id/check-in — отметка исхода', () => {
    it('гость отметить не может', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ outcome: 'completed' });

      expect(response.status).toBe(401);
    });

    it('после окончания занятия провайдер отмечает проведение', async () => {
      // Занятие закончилось час назад — отметка внутри окна.
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(2))
        .send({ outcome: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('completed');
    });

    it('неявка отмечается тем же маршрутом', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(2))
        .send({ outcome: 'no_show' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('no_show');
    });

    it('до окончания занятия отметка запрещена', async () => {
      // Занятие идёт прямо сейчас: началось полчаса назад, кончится через полчаса.
      await harness.write('schedule', [slot(1, slotAt(-0.5), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(2))
        .send({ outcome: 'completed' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('после окончания слота');
    });

    it('через 48 часов окно закрывается', async () => {
      // Занятие закончилось трое суток назад — окно давно закрыто.
      await harness.write('schedule', [slot(1, slotAt(-72), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(2))
        .send({ outcome: 'completed' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('48 часов');
    });

    it('чужой провайдер отметить не может', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(5))
        .send({ userId: 2, outcome: 'completed' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для check-in');
    });

    it('сам атлет отметить себе проведение не может', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      // То же, что и у подтверждения: роли больше нет, отказ даёт проверка владения
      // занятием. Отметка посещения — начало цепочки накрутки рейтинга (посещение
      // даёт право на отзыв), поэтому здесь сверяется и состояние записи.
      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(1))
        .send({ outcome: 'completed' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для check-in');

      const stored = await harness.read<{ id: number; status: string }[]>('bookings');
      expect(stored.find((item) => item.id === 7)?.status).toBe('confirmed');
    });

    it('неизвестный исход отклоняется', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .set('Cookie', await as(2))
        .send({ outcome: 'пришёл' });

      expect(response.status).toBe(400);
    });

    it('несуществующая запись — не найдено', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2))]);

      const response = await request(server())
        .post('/api/bookings/999/check-in')
        .set('Cookie', await as(2))
        .send({ outcome: 'completed' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Запись не найдена');
    });

    it('исчезнувший слот — не найдено; в базе такое состояние запрещено', async () => {
      // ⚠️ Единственное место набора, где хранилища расходятся не в мелочи.
      // Состояние «запись есть, а слота нет» файлы допускают, а база — нет: у записи
      // внешний ключ на слот, а удаление слота с записями запрещено (Restrict).
      // Поэтому проверяются оба обещания, и каждое там, где оно вообще существует:
      // где состояние создаётся — ветка обязана ответить 404;
      // где не создаётся — хранилище обязано ОТКАЗАТЬ, а не принять молча.
      await expect(harness.writeMany({ schedule: [], bookings: [booking(7)] })).rejects.toThrow();
    });
  });
  // Этап Э8a: право на разбор заявок общее у обеих ролей провайдера, а вот
  // «свои занятия» у них разные. Поэтому проверяется не право (оно одно), а то,
  // что владение считается по своей стороне: тренер разбирает заявки на свои
  // занятия и не разбирает заявки клуба.
  describe('разбор заявок тренером', () => {
    beforeEach(async () => {
      await harness.writeMany({
        trainers: [
          {
            id: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            name: 'Марина',
            slug: 'marina',
            bio: 'Биография',
            avatarUrl: '',
            experienceYears: 5,
            priceFrom: 1000,
            managedByUserId: 2,
            sportIds: [3],
            specialtyIds: [],
            workFormatIds: [],
            rating: 5,
            reviewCount: 0,
            status: 'published',
          },
          {
            id: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            name: 'Павел',
            slug: 'pavel',
            bio: 'Биография',
            avatarUrl: '',
            experienceYears: 3,
            priceFrom: 1200,
            managedByUserId: 6,
            sportIds: [3],
            specialtyIds: [],
            workFormatIds: [],
            rating: 5,
            reviewCount: 0,
            status: 'published',
          },
        ],
        offerings: [
          {
            id: 1,
            createdAt: '2026-01-01T00:00:00.000Z',
            ownerType: 'trainer',
            ownerId: 1,
            sportId: 3,
            title: 'Персональная',
            description: 'Описание',
            format: 'personal',
            price: 1000,
            durationMinutes: 60,
            capacity: 5,
            address: 'ул. Ленина, 1',
            coordinates: { lat: 53.2, lng: 50.1 },
            cancellationPolicy: 'free_until_24h',
          },
          {
            id: 2,
            createdAt: '2026-01-01T00:00:00.000Z',
            ownerType: 'trainer',
            ownerId: 2,
            sportId: 3,
            title: 'Персональная Павла',
            description: 'Описание',
            format: 'personal',
            price: 1200,
            durationMinutes: 60,
            capacity: 5,
            address: 'ул. Ленина, 2',
            coordinates: { lat: 53.2, lng: 50.1 },
            cancellationPolicy: 'free_until_24h',
          },
          {
            id: 3,
            createdAt: '2026-01-01T00:00:00.000Z',
            ownerType: 'club',
            ownerId: 2,
            sportId: 3,
            title: 'Групповая клуба',
            description: 'Описание',
            format: 'group',
            price: 500,
            durationMinutes: 60,
            capacity: 10,
            address: 'ул. Ленина, 1',
            coordinates: { lat: 53.2, lng: 50.1 },
            cancellationPolicy: 'free_until_24h',
          },
        ],
        schedule: [
          slot(1, slotAt(24), { bookedCount: 1 }),
          slot(2, slotAt(24), { ownerId: 2, trainerId: 2, offeringId: 2, bookedCount: 1 }),
          slot(3, slotAt(24), {
            ownerType: 'club',
            ownerId: 2,
            clubId: 2,
            trainerId: undefined,
            offeringId: 3,
            bookedCount: 1,
          }),
        ],
        bookings: [
          booking(7, { status: 'pending' }),
          booking(8, {
            scheduleId: 2,
            offeringId: 2,
            ownerId: 2,
            trainerId: 2,
            status: 'pending',
          }),
          booking(9, {
            scheduleId: 3,
            offeringId: 3,
            ownerType: 'club',
            ownerId: 2,
            clubId: 2,
            trainerId: undefined,
            status: 'pending',
          }),
        ],
      });
    });

    it('тренер подтверждает заявку на своё занятие', async () => {
      const response = await request(server())
        .post('/api/bookings/8/confirm')
        .set('Cookie', await as(6))
        .send({});

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('confirmed');
    });

    it('в журнале у тренера записана его роль, а не роль владельца клуба', async () => {
      // Роль исполнителя писалась константой `club_owner` — то есть врала про то,
      // ради чего роли и разделяли: заявку на своё занятие разбирает тренер.
      await request(server())
        .post('/api/bookings/8/confirm')
        .set('Cookie', await as(6))
        .send({});

      const logs =
        await harness.read<{ action: string; actorId: number; actorRole: string }[]>('logs');
      const confirmed = logs.filter((entry) => entry.action === 'booking_confirm');

      expect(confirmed).toHaveLength(1);
      expect(confirmed[0]).toMatchObject({ actorId: 6, actorRole: 'trainer' });
    });

    it('тренер не подтверждает заявку на занятие чужого клуба', async () => {
      const response = await request(server())
        .post('/api/bookings/9/confirm')
        .set('Cookie', await as(6))
        .send({});

      // Право у тренера есть — останавливает владение, и текст об этом говорит.
      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для подтверждения записи');
    });

    it('тренер не подтверждает заявку к чужому тренеру', async () => {
      const response = await request(server())
        .post('/api/bookings/7/confirm')
        .set('Cookie', await as(6))
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для подтверждения записи');
    });

    it('представитель услуг не подтверждает заявку тренера', async () => {
      // Обратная сторона: у клуба своя сторона, и заявка тренера ему не принадлежит.
      const response = await request(server())
        .post('/api/bookings/8/confirm')
        .set('Cookie', await as(5))
        .send({});

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для подтверждения записи');
    });
  });
});
