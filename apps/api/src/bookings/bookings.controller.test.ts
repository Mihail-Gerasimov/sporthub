// Тесты маршрутов записей.
//
// Два маршрута здесь до сих пор не проверялись ничем: административное чтение
// записи и отметка исхода занятия. Второй — самый разветвлённый в проекте:
// у него два разных отказа по времени, и оба легко сломать незаметно.
//
// Время не подменяется. Слоты строятся относительно текущего момента: слот,
// закончившийся час назад, идущий прямо сейчас и закончившийся трое суток назад.
// Так тест проверяет ту же арифметику, что и рабочий сервер, и не зависит от
// подмены часов.

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { createTestHarness, type TestHarness } from '../test/harness';

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
  password: 'demo123',
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
  statusHistory: [],
  ...over,
});

describe('Маршруты записей', () => {
  let harness: TestHarness;

  beforeAll(async () => {
    harness = await createTestHarness('bookings-http');
  });

  beforeEach(async () => {
    await harness.write('users', [
      user(1, 'athlete'),
      user(2, 'club_owner'),
      user(3, 'admin'),
      user(4, 'athlete'),
    ]);
    await harness.write('trainers', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Марина',
        slug: 'marina',
        managedByUserId: 2,
        sportIds: [3],
        specialtyIds: [],
        workFormatIds: [],
        rating: 5,
        reviewCount: 0,
        status: 'published',
      },
    ]);
    await harness.write('offerings', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'trainer',
        ownerId: 1,
        sportId: 3,
        title: 'Персональная',
        price: 1000,
        cancellationPolicy: 'free_until_24h',
      },
    ]);
    await harness.write('clubs', []);
    await harness.write('bookings', []);
    await harness.write('notifications', []);
    await harness.write('logs', []);
  });

  afterAll(async () => {
    await harness.close();
  });

  const server = () => harness.app.getHttpServer();

  describe('GET /api/bookings/:id — административное чтение', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(24))]);
      await harness.write('bookings', [booking(7)]);
    });

    it('администратор получает запись целиком', async () => {
      const response = await request(server()).get('/api/bookings/7?userId=3');

      expect(response.status).toBe(200);
      expect(response.body.data.id).toBe(7);
    });

    it('обычному пользователю отказано', async () => {
      const response = await request(server()).get('/api/bookings/7?userId=1');

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав');
    });

    it('без идентификатора запрашивающего — отказ по данным', async () => {
      const response = await request(server()).get('/api/bookings/7');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректный userId');
    });

    it('нечисловой идентификатор записи — отказ по данным', async () => {
      const response = await request(server()).get('/api/bookings/abc?userId=3');

      expect(response.status).toBe(400);
    });

    it('несуществующая запись — не найдено', async () => {
      const response = await request(server()).get('/api/bookings/999?userId=3');

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Запись не найдена');
    });
  });

  describe('POST /api/bookings/:id/check-in — отметка исхода', () => {
    it('после окончания занятия провайдер отмечает проведение', async () => {
      // Занятие закончилось час назад — отметка внутри окна.
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 2, outcome: 'completed' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('completed');
    });

    it('неявка отмечается тем же маршрутом', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 2, outcome: 'no_show' });

      expect(response.status).toBe(200);
      expect(response.body.data.status).toBe('no_show');
    });

    it('до окончания занятия отметка запрещена', async () => {
      // Занятие идёт прямо сейчас: началось полчаса назад, кончится через полчаса.
      await harness.write('schedule', [slot(1, slotAt(-0.5), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 2, outcome: 'completed' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('после окончания слота');
    });

    it('через 48 часов окно закрывается', async () => {
      // Занятие закончилось трое суток назад — окно давно закрыто.
      await harness.write('schedule', [slot(1, slotAt(-72), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 2, outcome: 'completed' });

      expect(response.status).toBe(409);
      expect(response.body.error).toContain('48 часов');
    });

    it('чужой провайдер отметить не может', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 4, outcome: 'completed' });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Недостаточно прав для check-in');
    });

    it('неизвестный исход отклоняется', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2), { bookedCount: 1 })]);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 2, outcome: 'пришёл' });

      expect(response.status).toBe(400);
    });

    it('несуществующая запись — не найдено', async () => {
      await harness.write('schedule', [slot(1, slotAt(-2))]);

      const response = await request(server())
        .post('/api/bookings/999/check-in')
        .send({ userId: 2, outcome: 'completed' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Запись не найдена');
    });

    it('исчезнувший слот — не найдено', async () => {
      await harness.write('schedule', []);
      await harness.write('bookings', [booking(7)]);

      const response = await request(server())
        .post('/api/bookings/7/check-in')
        .send({ userId: 2, outcome: 'completed' });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Слот расписания не найден');
    });
  });

  describe('POST /api/bookings — отказы до создания', () => {
    beforeEach(async () => {
      await harness.write('schedule', [slot(1, slotAt(48))]);
    });

    it('несуществующий пользователь — не найдено', async () => {
      const response = await request(server())
        .post('/api/bookings')
        .send({ scheduleId: 1, userId: 99 });

      expect(response.status).toBe(404);
      expect(response.body.error).toBe('Пользователь не найден');
    });

    it('провайдер записаться не может', async () => {
      const response = await request(server())
        .post('/api/bookings')
        .send({ scheduleId: 1, userId: 2 });

      expect(response.status).toBe(403);
      expect(response.body).toEqual({ success: false, error: 'Запись доступна только спортсмену' });
    });

    it('три неявки подряд закрывают запись карантином', async () => {
      // Карантин срабатывает после трёх неявок подряд за последние 30 дней
      // и длится неделю с момента последней.
      const daysAgo = (days: number) =>
        new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

      await harness.write('bookings', [
        booking(101, { status: 'no_show', createdAt: daysAgo(5), date: daysAgo(5).slice(0, 10) }),
        booking(102, { status: 'no_show', createdAt: daysAgo(4), date: daysAgo(4).slice(0, 10) }),
        booking(103, { status: 'no_show', createdAt: daysAgo(3), date: daysAgo(3).slice(0, 10) }),
      ]);

      const response = await request(server())
        .post('/api/bookings')
        .send({ scheduleId: 1, userId: 1 });

      expect(response.status).toBe(403);
      // ⚠️ Единственный маршрут, где вместо текста ошибки уходит машинный код
      // и срок окончания. Форма сохранена ради прежнего фронта.
      expect(response.body.error).toBe('quarantine');
      expect(typeof response.body.until).toBe('string');
    });

    it('скрытая публикация закрывает запись', async () => {
      await harness.write('trainers', [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Марина',
          slug: 'marina',
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
        .send({ scheduleId: 1, userId: 1 });

      expect(response.status).toBe(403);
      expect(response.body.error).toBe('Публикация скрыта, запись невозможна');
    });

    it('мест не осталось — запись невозможна', async () => {
      await harness.write('schedule', [slot(1, slotAt(48), { capacity: 1, bookedCount: 1 })]);

      const response = await request(server())
        .post('/api/bookings')
        .send({ scheduleId: 1, userId: 1 });

      expect(response.status).toBe(409);
      expect(response.body).toEqual({ success: false, error: 'Свободных мест нет' });
    });

    it('без userId выдача записей не отдаётся', async () => {
      const response = await request(server()).get('/api/bookings');

      expect(response.status).toBe(400);
      expect(response.body.error).toBe('Некорректные параметры запроса');
    });

    it('scope=all отдаёт полный срез без указания пользователя', async () => {
      await harness.write('bookings', [booking(7), booking(8, { userId: 4 })]);

      const response = await request(server()).get('/api/bookings?scope=all');

      expect(response.status).toBe(200);
      expect(response.body.data).toHaveLength(2);
    });

    // Сужение выдачи (шаг 33.27a). До него 14 страниц фронта тянули полный срез
    // записей платформы, чтобы показать записи одного человека или одного клуба.
    // Все параметры ниже — необязательные: без них маршрут отвечает как прежде.
    describe('сужение выдачи', () => {
      beforeEach(async () => {
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

      it('полный срез сужается по клубу', async () => {
        const response = await request(server()).get('/api/bookings?scope=all&clubId=2');

        expect(response.status).toBe(200);
        expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([9]);
      });

      it('полный срез сужается по тренеру', async () => {
        const response = await request(server()).get('/api/bookings?scope=all&trainerId=1');

        expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([7, 8]);
      });

      it('полный срез сужается по периоду дня занятия', async () => {
        const response = await request(server()).get(
          '/api/bookings?scope=all&dateFrom=2026-03-20&dateTo=2026-03-30',
        );

        expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([8, 9]);
      });

      it('полный срез сужается по набору статусов через запятую', async () => {
        const response = await request(server()).get(
          '/api/bookings?scope=all&status=pending,confirmed',
        );

        expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([7, 8]);
      });

      it('постраничность режет полный срез', async () => {
        const response = await request(server()).get('/api/bookings?scope=all&offset=1&limit=1');

        expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([8]);
      });

      it('выдумка в наборе статусов — 400 с прежним текстом', async () => {
        const response = await request(server()).get('/api/bookings?scope=all&status=выдумка');

        expect(response.status).toBe(400);
        expect(response.body.error).toBe('Некорректные параметры запроса');
      });

      it('неизвестный параметр по-прежнему игнорируется, а не отвергается', async () => {
        // Прежний маршрут лишние параметры молча пропускал; превращать их в отказ
        // значило бы сломать уже работающие ссылки.
        const response = await request(server()).get('/api/bookings?scope=all&неведомое=1');

        expect(response.status).toBe(200);
        expect(response.body.data).toHaveLength(3);
      });

      it('записи атлета сужаются теми же параметрами', async () => {
        const response = await request(server()).get('/api/bookings?userId=1&dateFrom=2026-03-30');

        expect(response.body.data.map((item: { id: number }) => item.id)).toEqual([9]);
      });
    });
  });
});
