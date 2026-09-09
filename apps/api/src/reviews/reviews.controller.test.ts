// Тесты отзывов. Оба текста ошибки про адресата различаются и оба закреплены —
// перепутать их значит сломать проверку формы на фронте.
//
// Фаза 34, шаг 34.39: чтение отзывов открыто гостю, а написание — только тому,
// кто у этого клуба или тренера занимался. Поэтому в наборе появились записи:
// без них ни один отзыв больше не создаётся.

import request from 'supertest';
import { afterAll, beforeEach, beforeAll, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from '../test/harness';

const user = (id: number, role: string, name: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  // Состояние обязательно: сессия неактивного пользователя не разбирается вовсе.
  status: 'active',
  name,
  email: `u${id}@test.local`,
  phone: `+7 (900) 000-00-0${id}`,
  passwordHash: 'demo123',
  favoriteClubIds: [],
});

const club = (id: number, name: string, slug: string, managedByUserId: number) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name,
  slug,
  description: 'Описание',
  shortDescription: 'Кратко',
  city: 'Самара',
  address: 'ул. Ленина, 1',
  phone: '+7 900 000-00-00',
  coordinates: { lat: 53.2, lng: 50.1 },
  priceFrom: 500,
  distanceKm: 1,
  managedByUserId,
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  imageUrls: [],
  rating: 4.5,
  reviewCount: 1,
  status: 'published',
});

/**
 * Запись к клубу или тренеру.
 *
 * Слота у неё нет намеренно (`scheduleId: null`): проверка посещения смотрит
 * на состояние записи и её адресата, и лишние ссылки только утяжелили бы срез.
 * Такое состояние законно — провайдер вправе убрать занятие из расписания,
 * запись при этом остаётся.
 */
const booking = (input: {
  id: number;
  userId: number;
  status: string;
  clubId?: number;
  trainerId?: number;
}) => ({
  id: input.id,
  createdAt: '2026-01-15T09:00:00.000Z',
  scheduleId: null,
  ownerType: input.clubId === undefined ? 'trainer' : 'club',
  ownerId: input.clubId ?? input.trainerId,
  userId: input.userId,
  clubId: input.clubId,
  trainerId: input.trainerId,
  sportId: 3,
  date: '2026-01-20',
  status: input.status,
  paymentStatus: 'paid',
  totalPrice: 1000,
});

describe('Маршрут отзывов', () => {
  let harness: TestHarness;

  // Cookie выдаются в `beforeEach` и только ПОСЛЕ засева: запись коллекции
  // пересобирает базу целиком, а сессии живут в ней же.
  let asAuthor: string; // пользователь 1 — занимался и в клубе 1, и у тренера 1
  let asNewcomer: string; // пользователь 4 — запись есть, но занятие ещё не прошло
  let asOwnerAthlete: string; // пользователь 7 — спортсмен, который сам ведёт клуб 2
  let asProvider: string; // пользователь 2 — роль без права писать отзывы

  beforeAll(async () => {
    harness = await createTestHarness('reviews-http');
  });

  beforeEach(async () => {
    // Один перенос на весь срез: публикация ссылается на справочник видов спорта,
    // отзыв — на пользователя и публикацию, запись — на пользователя и публикацию.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [
        user(1, 'athlete', 'Алексей Смирнов'),
        user(2, 'club_owner', 'Марина Крылова'),
        user(4, 'athlete', 'Новичок Без Посещений'),
        // Спортсмен, который заодно управляет клубом: только так и остаётся
        // достижим отзыв самому себе — провайдерским ролям право писать отзывы
        // не положено вовсе.
        user(7, 'athlete', 'Спортсмен-владелец'),
      ],
      clubs: [club(1, 'Волна', 'volna', 2), club(2, 'Свой клуб', 'svoy', 7)],
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
          managedByUserId: 2,
          sportIds: [3],
          specialtyIds: [],
          workFormatIds: [],
          rating: 5,
          reviewCount: 0,
          status: 'published',
        },
      ],
      bookings: [
        // Занятия, которые уже прошли, — право на отзыв.
        booking({ id: 1, userId: 1, clubId: 1, status: 'completed' }),
        booking({ id: 2, userId: 1, trainerId: 1, status: 'completed' }),
        // Запись есть, но занятие впереди — права на отзыв ещё нет.
        booking({ id: 3, userId: 4, clubId: 1, status: 'confirmed' }),
        booking({ id: 4, userId: 7, clubId: 2, status: 'completed' }),
      ],
      reviews: [
        {
          id: 1,
          createdAt: '2026-02-01T00:00:00.000Z',
          userId: 1,
          clubId: 1,
          rating: 5,
          text: 'Отлично',
        },
        {
          id: 2,
          createdAt: '2026-02-02T00:00:00.000Z',
          userId: 1,
          trainerId: 1,
          rating: 4,
          text: 'Хорошо',
        },
      ],
      notifications: [],
    });

    [asAuthor, asProvider, asNewcomer, asOwnerAthlete] = await Promise.all([
      harness.as(1),
      harness.as(2),
      harness.as(4),
      harness.as(7),
    ]);
  });

  afterAll(async () => {
    await harness.close();
  });

  // Отзыв пишется от чьего-то лица, поэтому у помощника cookie обязательна.
  const post = (cookie: string, body: object) =>
    request(harness.app.getHttpServer()).post('/api/reviews').set('Cookie', cookie).send(body);

  describe('Чтение — открыто гостю', () => {
    it('GET отдаёт отзывы клуба', async () => {
      const response = await request(harness.app.getHttpServer()).get('/api/reviews?clubId=1');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(1);
      expect(response.body.data[0].id).toBe(1);
    });

    it('GET отдаёт отзывы тренера', async () => {
      const response = await request(harness.app.getHttpServer()).get('/api/reviews?trainerId=1');

      expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2]);
    });

    it('GET без фильтров отдаёт всё, свежие сверху', async () => {
      const response = await request(harness.app.getHttpServer()).get('/api/reviews');

      expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([2, 1]);
    });

    it('GET с обоими адресатами — 400 «Нужно указать либо clubId, либо trainerId»', async () => {
      const response = await request(harness.app.getHttpServer()).get(
        '/api/reviews?clubId=1&trainerId=1',
      );

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        error: 'Нужно указать либо clubId, либо trainerId',
      });
    });

    it('нечисловой фильтр отклоняется', async () => {
      const response = await request(harness.app.getHttpServer()).get('/api/reviews?clubId=клуб');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректные параметры запроса');
    });
  });

  describe('Право оставить отзыв', () => {
    it('анонимный отзыв — 401, в хранилище ничего не появляется', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/reviews')
        .send({ userId: 1, clubId: 1, rating: 5, text: 'Аноним' });

      expect(response.status).toBe(401);
      expect(response.body).toEqual({ success: false, error: 'Требуется вход' });

      const stored = await harness.read<{ id: number }[]>('reviews');
      expect(stored.map((item) => item.id)).toEqual([1, 2]);
    });

    it('без записи к этому адресату — 403, рейтинг не трогается', async () => {
      const before = await harness.read<{ id: number; rating: number }[]>('trainers');

      const response = await post(asNewcomer, {
        trainerId: 1,
        rating: 5,
        text: 'Не был, но хвалю',
      });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({
        success: false,
        error: 'Оставить отзыв можно только после посещения занятия',
      });

      const after = await harness.read<{ id: number; rating: number }[]>('trainers');
      expect(after).toEqual(before);
    });

    it('запись есть, но занятие ещё не прошло — 403', async () => {
      // У пользователя 4 запись в клуб 1 подтверждена, но не завершена.
      const response = await post(asNewcomer, {
        clubId: 1,
        rating: 1,
        text: 'Заранее не понравилось',
      });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Оставить отзыв можно только после посещения занятия');

      const stored = await harness.read<{ userId: number }[]>('reviews');
      expect(stored.some((item) => item.userId === 4)).toBe(false);
    });

    it('завершённая запись к клубу даёт право на отзыв', async () => {
      const response = await post(asAuthor, { clubId: 1, rating: 5, text: 'Ходил, понравилось' });

      expect(response.status).toBe(201);
      expect(response.body.data).toMatchObject({ userId: 1, clubId: 1, rating: 5 });
    });

    it('завершённая запись к клубу не открывает отзыв о другом клубе', async () => {
      const response = await post(asAuthor, { clubId: 2, rating: 5, text: 'Про чужой клуб' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Оставить отзыв можно только после посещения занятия');
    });

    it('провайдеру отзывы не положены вовсе — 403', async () => {
      const response = await post(asProvider, { clubId: 1, rating: 5, text: 'От владельца' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
    });

    it('автор берётся из сессии, а не из тела запроса', async () => {
      // Тело выдаёт отзыв за пользователя 4, cookie принадлежит пользователю 1.
      const response = await post(asAuthor, {
        userId: 4,
        trainerId: 1,
        rating: 5,
        text: 'Чужим именем',
      });

      expect(response.status).toBe(201);
      expect(response.body.data.userId).toBe(1);

      const stored = await harness.read<{ userId: number; text: string }[]>('reviews');
      expect(stored.at(-1)).toMatchObject({ userId: 1, text: 'Чужим именем' });
    });
  });

  it('POST создаёт отзыв о тренере и пишет его в хранилище', async () => {
    const response = await post(asAuthor, { trainerId: 1, rating: 5, text: 'Супер' });

    expect(response.status).toBe(201);
    expect(response.body.data).toMatchObject({
      userId: 1,
      trainerId: 1,
      rating: 5,
    });

    const stored = await harness.read<{ id: number; text: string }[]>('reviews');
    expect(stored.at(-1)).toMatchObject({
      userId: 1,
      trainerId: 1,
      text: 'Супер',
    });
  });

  it('POST без адресата — 400 «Нужно указать clubId или trainerId»', async () => {
    const response = await post(asAuthor, { rating: 5, text: 'Без адресата' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Нужно указать clubId или trainerId',
    });
  });

  it('POST сразу на клуб и тренера — 400 с другим текстом', async () => {
    const response = await post(asAuthor, { clubId: 1, trainerId: 1, rating: 5, text: 'Оба' });

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      error: 'Нужно указать либо clubId, либо trainerId',
    });
  });

  it('POST уведомляет провайдера и автора', async () => {
    await post(asAuthor, { clubId: 1, rating: 5, text: 'Отличный клуб' });

    const notifications = await harness.read<{ userId: number; type: string }[]>('notifications');

    expect(notifications.filter((item) => item.type === 'review_received_by_provider')).toEqual([
      expect.objectContaining({ userId: 2 }),
    ]);
    expect(notifications.filter((item) => item.type === 'review_published_for_athlete')).toEqual([
      expect.objectContaining({ userId: 1 }),
    ]);
  });

  it('отзыв самому себе не уведомляет провайдера, но уведомляет автора', async () => {
    const response = await post(asOwnerAthlete, { clubId: 2, rating: 5, text: 'Сам себе' });

    expect(response.status).toBe(201);

    const notifications = await harness.read<{ type: string }[]>('notifications');

    expect(
      notifications.filter((item) => item.type === 'review_received_by_provider'),
    ).toHaveLength(0);
    expect(
      notifications.filter((item) => item.type === 'review_published_for_athlete'),
    ).toHaveLength(1);
  });

  it('POST на несуществующего тренера — 404 «Тренер не найден»', async () => {
    const response = await post(asAuthor, { trainerId: 999, rating: 5, text: 'Нет такого' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Тренер не найден');
  });

  it('отзыв на несуществующий клуб — не найдено', async () => {
    const response = await post(asAuthor, { clubId: 999, rating: 5, text: 'Нет клуба' });

    expect(response.status).toBe(404);
    expect(response.body.error).toBe('Клуб не найден');
  });

  it('оценка вне диапазона отклоняется', async () => {
    const response = await post(asAuthor, { clubId: 1, rating: 9, text: 'Слишком много' });

    expect(response.status).toBe(400);
    expect(response.body.error).toBe('Некорректные данные отзыва');
  });

  describe('Агрегаты отзывов', () => {
    it('после отзыва рейтинг и число отзывов у клуба пересчитываются', async () => {
      // До фазы 33 писателя у этих полей не было вовсе: в данных они стояли нулями
      // при живых отзывах, и карточка показывала «нет оценок» у клуба с двумя.
      await post(asAuthor, { clubId: 1, rating: 4, text: 'Хороший зал' }).expect(201);

      const clubs =
        await harness.read<{ id: number; rating: number; reviewCount: number }[]>('clubs');
      const found = clubs.find((item) => item.id === 1);

      expect(found?.reviewCount).toBeGreaterThan(0);
      expect(found?.rating).toBeGreaterThan(0);
    });

    it('рейтинг равен среднему по фактическим отзывам, а не последнему', async () => {
      await post(asAuthor, { clubId: 1, rating: 5, text: 'Отлично' }).expect(201);
      await post(asAuthor, { clubId: 1, rating: 1, text: 'Плохо' }).expect(201);

      // Ожидание считается по фактическому содержимому, а не по числу из головы:
      // в наборе у клуба могут быть и прежние отзывы, и тогда среднее другое.
      const reviews = await harness.read<{ clubId?: number; rating: number }[]>('reviews');
      const forClub = reviews.filter((item) => item.clubId === 1);
      const expected =
        Math.round((forClub.reduce((sum, item) => sum + item.rating, 0) / forClub.length) * 10) /
        10;

      const clubs =
        await harness.read<{ id: number; rating: number; reviewCount: number }[]>('clubs');
      const found = clubs.find((item) => item.id === 1);

      expect(found?.reviewCount).toBe(forClub.length);
      expect(found?.rating).toBe(expected);
      // Именно среднее, а не оценка последнего отзыва.
      expect(found?.rating).not.toBe(1);
    });
  });
});
