// Тесты маршрутов клубов и тренеров.
//
// Сверка с эталоном проверяет успешные ответы, но не ветки отказов: там
// подобраны только осмысленные запросы. Здесь закрыты именно отказы — разбор
// параметров выдачи, чужая публикация, несуществующие идентификаторы.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

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
  managedByUserId: 2,
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

describe('Маршруты клубов и тренеров', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('clubs-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      {
        id: 2,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'club_owner',
        name: 'Марина',
        email: 'm@test.local',
        phone: '+7 (900) 000-00-02',
        password: 'demo123',
        favoriteClubIds: [],
      },
    ]);
    await harness.write('clubs', [club(1), club(2, { rating: 2, sportIds: [5] })]);
    await harness.write('trainers', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Марина Соколова',
        slug: 'marina-sokolova',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('offerings', []);
    await harness.write('schedule', []);
    await harness.write('bookings', []);
    await harness.write('reviews', []);
    await harness.write('logs', []);
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
      userId: 2,
    };

    it('публикация от несуществующего пользователя — не найдено', async () => {
      const response = await request(server())
        .post('/api/clubs')
        .send({ ...form, userId: 99 });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Пользователь не найден');
    });

    it('неполные данные отклоняются с перечнем полей', async () => {
      const response = await request(server()).post('/api/clubs').send({ name: 'Только имя' });

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректные данные клуба');
      expect(response.body.details).toBeDefined();
    });

    it('правка чужой публикации запрещена', async () => {
      await harness.write('users', [
        {
          id: 2,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'club_owner',
          name: 'Марина',
          email: 'm@test.local',
          phone: '+7 (900) 000-00-02',
          password: 'demo123',
          favoriteClubIds: [],
        },
        {
          id: 9,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'club_owner',
          name: 'Чужой',
          email: 'x@test.local',
          phone: '+7 (900) 000-00-09',
          password: 'demo123',
          favoriteClubIds: [],
        },
      ]);
      await harness.write('offerings', [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'club',
          ownerId: 1,
          sportId: 3,
          title: 'Занятия',
          price: 500,
        },
      ]);

      const response = await request(server())
        .patch('/api/clubs/1')
        .send({ ...form, userId: 9, scheduleSlots: form.scheduleSlots });

      expect(response.status).toBe(403);
      expect(response.body.error).toMatch(/Недостаточно прав/i);
    });

    it('правка несуществующего клуба отвечает общим «Клуб не найден»', async () => {
      // ⚠️ Подмена текста: изнутри приходит «Клуб с id N не найден»,
      // наружу уходит общее сообщение. Поведение сохранено с прежнего бэкенда.
      const response = await request(server()).patch('/api/clubs/999').send(form);

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Клуб не найден');
    });

    it('удаление по нечисловому идентификатору отклоняется', async () => {
      const response = await request(server()).delete('/api/clubs/abc');

      expect(response.status).toBe(400);
    });
  });
});
