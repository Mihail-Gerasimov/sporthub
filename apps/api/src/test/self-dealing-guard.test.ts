/**
 * Сторож «сам себе» (шаги 35.5, 35.16, 35.19a).
 *
 * Двенадцать точек, где человек может оказаться обеими сторонами сделки. Десять
 * запрещены, две разрешены решениями заказчика 16 и 22. Полный список с вердиктами —
 * раздел 5.5 файла `project-phases/phase-35.md`.
 *
 * ⚠️ Почему сторож РАНТАЙМОВЫЙ. Урок фазы 34: из 46 диверсий шесть не покраснели,
 * и пять из шести оказались одного вида — тест проверял ЛОГИКУ в отрыве от её
 * ПОДКЛЮЧЕНИЯ. Поиск по коду «зовут ли `AccessService`» зелен и тогда, когда его
 * позвали и ответ выбросили. Здесь выполняется настоящий запрос, и у каждого отказа
 * проверяются ДВЕ вещи: код ответа и неизменность строки в базе.
 *
 * ⚠️ Ожидаемый цвет на старте фазы — НЕ «все красные». Семь точек сегодня закрыты
 * ролями случайно: владелец клуба не может ни записаться, ни писать отзывы, потому
 * что `book_sessions` и `write_reviews` есть только у роли атлета. Эти закрытия
 * исчезнут вместе с ролями в этапе Э3, и тогда настоящую силу наберёт шаг 35.19a —
 * повторный прогон этого же набора. Тесты, помеченные `ЗАКРЫТО РОЛЬЮ`, до Э3 зелены
 * по чужой причине, и это записано здесь, чтобы после Э3 было видно разницу.
 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureCollections } from '@sporthub/fixtures';

import { createTestHarness, type TestHarness } from './harness';

/** Владелец клуба 1 и карточек тренера — он же будет «обеими сторонами». */
const OWNER_ID = 2;
/** Посторонний атлет: контрольная группа, чтобы отказ не оказался общим для всех. */
const ATHLETE_ID = 1;
/** Администратор: для точки «работа от лица самого себя». */
const ADMIN_ID = 3;

/**
 * Запись владельца на СВОЁ занятие.
 *
 * Засеивается напрямую, а не создаётся через API, потому что сегодня владелец
 * записаться не может — мешает роль. Без этой строки точки 3–6 нечем проверять
 * до этапа Э3, а проверять их надо уже сейчас: именно они открыты по-настоящему.
 */
const SELF_BOOKING_ID = 900;

const selfBooking = {
  id: SELF_BOOKING_ID,
  createdAt: '2026-03-17T09:00:00.000Z',
  scheduleId: 2,
  offeringId: 1,
  ownerType: 'club' as const,
  ownerId: 1,
  userId: OWNER_ID,
  clubId: 1,
  trainerId: 1,
  sportId: 3,
  date: '2026-03-18',
  status: 'pending' as const,
  paymentStatus: 'unpaid' as const,
  totalPrice: 1100,
};

describe('Сторож «сам себе»', () => {
  let harness: TestHarness;
  let ownerCookie: string;
  let athleteCookie: string;
  let adminCookie: string;

  beforeAll(async () => {
    harness = await createTestHarness('self-dealing-guard');
  });

  beforeEach(async () => {
    // ⚠️ Одним вызовом: каждая запись пересобирает базу целиком и гасит выданные
    // сессии, поэтому cookie берутся строго после засева.
    await harness.writeMany({
      ...fixtureCollections,
      bookings: [...fixtureCollections.bookings, selfBooking],
    });

    ownerCookie = await harness.as(OWNER_ID);
    athleteCookie = await harness.as(ATHLETE_ID);
    adminCookie = await harness.as(ADMIN_ID);
  });

  afterAll(async () => {
    await harness.close();
  });

  /** Статус записи прямо из базы: ответ маршрута тут не свидетель. */
  async function bookingStatus(id: number): Promise<string | undefined> {
    const rows = await harness.read<{ id: number; status: string }[]>('bookings');

    return rows.find((row) => row.id === id)?.status;
  }

  // ───────── Разрешено решениями заказчика ─────────

  describe('разрешено', () => {
    it('точка 1: записаться на своё занятие (решение 16)', async () => {
      // ⚠️ ЗАКРЫТО РОЛЬЮ до Э3: у владельца нет права `book_sessions`, поэтому
      // сейчас приходит отказ по роли, а не разрешение. После Э3 обязано пройти.
      const response = await request(harness.app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', ownerCookie)
        .send({ scheduleId: 1001, name: 'Марина Крылова', phone: '+7 (900) 000-00-01' });

      const blockedByRole = response.status === 403;

      expect(
        blockedByRole || response.status === 201 || response.status === 200,
        `запись владельца на своё занятие ответила ${response.status}`,
      ).toBe(true);
    });
  });

  // ───────── Запрещено: решения по своей же записи ─────────

  describe('решения по своей же записи', () => {
    it('точка 3: подтвердить свою запись — отказ, статус не изменился', async () => {
      const response = await request(harness.app.getHttpServer())
        .post(`/api/bookings/${SELF_BOOKING_ID}/confirm`)
        .set('Cookie', ownerCookie)
        .send({});

      expect(response.status, 'владелец подтвердил собственную запись').not.toBe(200);
      expect(await bookingStatus(SELF_BOOKING_ID), 'статус записи изменился').toBe('pending');
    });

    it('точка 4: отклонить свою запись — отказ, статус не изменился', async () => {
      const response = await request(harness.app.getHttpServer())
        .post(`/api/bookings/${SELF_BOOKING_ID}/reject`)
        .set('Cookie', ownerCookie)
        .send({});

      expect(response.status, 'владелец отклонил собственную запись').not.toBe(200);
      expect(await bookingStatus(SELF_BOOKING_ID), 'статус записи изменился').toBe('pending');
    });

    it('точка 5: отметить себе посещение — отказ, статус не изменился', async () => {
      // ⚠️ Здесь рвётся цепочка накрутки рейтинга: без отметки посещения
      // не будет и права на отзыв.
      const response = await request(harness.app.getHttpServer())
        .post(`/api/bookings/${SELF_BOOKING_ID}/check-in`)
        .set('Cookie', ownerCookie)
        .send({ outcome: 'completed' });

      // ⚠️ Сегодня отказ приходит по СРОКУ («check-in доступен только после окончания
      // слота»), а не по владению: слот в фикстурах ещё не начался. Значит тест зелен
      // по чужой причине. Настоящую силу он наберёт вместе с проверкой «сам себе» —
      // тогда отказ придёт раньше проверки срока, и текст станет другим.
      expect(response.status, 'владелец отметил себе посещение').not.toBe(200);
      expect(await bookingStatus(SELF_BOOKING_ID), 'статус записи изменился').toBe('pending');
    });

    it('точка 6: отмена своей записи владельцем слота не выдаётся за отмену клиентом', async () => {
      // ⚠️ Сегодня ветка атлета проверяется РАНЬШЕ ветки владельца, поэтому владелец,
      // отменяющий запись на своём же занятии, попадает в статистику как передумавший
      // клиент. Это подмена стороны, а не отмена.
      const response = await request(harness.app.getHttpServer())
        .post(`/api/bookings/${SELF_BOOKING_ID}/cancel`)
        .set('Cookie', ownerCookie)
        .send({});

      if (response.status !== 200) return;

      const status = await bookingStatus(SELF_BOOKING_ID);

      expect(status, 'отмена владельцем записана как отмена клиентом').not.toBe(
        'cancelled_by_athlete',
      );
    });

    it('контрольная группа: чужую запись владелец решает нормально', async () => {
      // Без неё «отказ владельцу» неотличим от «отказ всем». Запись 3 — тоже
      // на занятии клуба 1, но принадлежит другому человеку и ждёт решения.
      const response = await request(harness.app.getHttpServer())
        .post('/api/bookings/3/confirm')
        .set('Cookie', ownerCookie)
        .send({});

      expect(response.status, 'владелец не может решить по ЧУЖОЙ записи на своём занятии').toBe(
        200,
      );
    });
  });

  // ───────── Запрещено: отзыв своему лицу ─────────

  describe('отзыв своему лицу', () => {
    it('точка 7: отзыв своему клубу — отказ, рейтинг не изменился', async () => {
      // ⚠️ ЗАКРЫТО РОЛЬЮ до Э3: у владельца нет `write_reviews`.
      const before =
        await harness.read<{ id: number; rating: number; reviewCount: number }[]>('clubs');
      const beforeClub = before.find((row) => row.id === 1);

      const response = await request(harness.app.getHttpServer())
        .post('/api/reviews')
        .set('Cookie', ownerCookie)
        .send({ clubId: 1, rating: 5, text: 'Отзыв собственному клубу — так быть не должно.' });

      expect(response.status, 'владелец оставил отзыв своему клубу').not.toBe(201);

      const after =
        await harness.read<{ id: number; rating: number; reviewCount: number }[]>('clubs');
      const afterClub = after.find((row) => row.id === 1);

      expect(afterClub?.reviewCount, 'число отзывов клуба изменилось').toBe(
        beforeClub?.reviewCount,
      );
      expect(afterClub?.rating, 'рейтинг клуба изменился').toBe(beforeClub?.rating);
    });
  });

  // ───────── Запрещено: заметки и клиенты ─────────

  describe('заметки и клиенты', () => {
    it('точка 9: заметка о самом себе — отказ ИМЕННО по правилу «сам себе»', async () => {
      // ⚠️ Сверяется текст отказа, а не только код. Диверсия d-15 (правило
      // отвечает «нет» всегда) показала, что проверки кода мало: отказ приходил
      // от следующего условия — «этот человек не ваш клиент», — и тест оставался
      // зелёным при полностью выключенном правиле. Ровно тот вид, ради которого
      // фаза завела «тихие» диверсии.
      const response = await request(harness.app.getHttpServer())
        .post('/api/provider-client-notes')
        .set('Cookie', ownerCookie)
        .send({ clientUserId: OWNER_ID, note: 'Заметка о самом себе.' });

      expect(response.status, 'заметка о самом себе прошла').not.toBe(201);
      expect(
        String((response.body as { error?: string }).error ?? ''),
        'отказ пришёл не от правила «сам себе»',
      ).toMatch(/о самом себе/i);
    });

    it('точка 10: сам не попадает в свой список клиентов', async () => {
      const response = await request(harness.app.getHttpServer())
        .get('/api/users?scope=clients')
        .set('Cookie', ownerCookie);

      if (response.status !== 200) return;

      const rows = (response.body as { data?: { id: number }[] }).data ?? [];

      expect(
        rows.some((row) => row.id === OWNER_ID),
        'владелец увидел себя в собственном списке клиентов',
      ).toBe(false);
    });
  });

  // ───────── Запрещено: работа от лица самого себя ─────────

  describe('работа от чужого лица', () => {
    it('точка 11: нельзя работать от лица самого себя', async () => {
      const response = await request(harness.app.getHttpServer())
        .post(`/api/auth/impersonate/${ADMIN_ID}`)
        .set('Cookie', adminCookie)
        .send({});

      expect(response.status, 'администратор вошёл сам под себя').not.toBe(200);
    });
  });

  // ───────── Точки, живущие в своих шагах ─────────
  //
  // Точка 2 (связь своего со своим) и точка 8 (названа чужая сторона) проверяются
  // шагом 35.10 — там же, где меняется маршрут связи. Точка 12 (уведомление лицу
  // самому себе) — шагом 35.15, вместе с переездом адресата на лицо. Дублировать
  // их здесь значило бы завести два места правды об одном правиле.

  // ───────── Контрольная группа: чужие действия проходят ─────────

  describe('чужие действия не задеты', () => {
    it('атлет записывается на чужое занятие', async () => {
      const response = await request(harness.app.getHttpServer())
        .post('/api/bookings')
        .set('Cookie', athleteCookie)
        .send({ scheduleId: 1001, name: 'Алексей Смирнов', phone: '+7 (900) 000-00-02' });

      expect(
        response.status === 201 || response.status === 200,
        `обычная запись сломалась: ${response.status}`,
      ).toBe(true);
    });
  });
});
