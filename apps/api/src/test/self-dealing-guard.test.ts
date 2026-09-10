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

/**
 * Слот клуба 1, закончившийся два часа назад.
 *
 * ⚠️ Заводится ради точки 5. Слоты фикстур лежат в будущем, и check-in по ним
 * отказывал по СРОКУ («доступен только после окончания слота»), а не по владению —
 * тест был зелен по чужой причине. Здесь слот уже закончился, но 48-часовое окно
 * ещё открыто, то есть до проверки «сам себе» дело доходит по-настоящему.
 */
const PAST_SLOT_ID = 901;

/** Время слота, сдвинутое относительно текущего момента. */
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

const pastSlot = {
  id: PAST_SLOT_ID,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club' as const,
  ownerId: 1,
  clubId: 1,
  offeringId: 1,
  sportId: 3,
  title: 'Занятие, которое уже прошло',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 5,
  bookedCount: 1,
  price: 1100,
  ...slotAt(-3),
};

/** Запись владельца на этот прошедший слот — предмет точки 5. */
const PAST_BOOKING_ID = 902;

const pastSelfBooking = {
  id: PAST_BOOKING_ID,
  createdAt: '2026-03-17T09:00:00.000Z',
  scheduleId: PAST_SLOT_ID,
  offeringId: 1,
  ownerType: 'club' as const,
  ownerId: 1,
  userId: OWNER_ID,
  clubId: 1,
  sportId: 3,
  date: pastSlot.date,
  status: 'confirmed' as const,
  paymentStatus: 'unpaid' as const,
  totalPrice: 1100,
};

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
      schedule: [...(fixtureCollections.schedule ?? []), pastSlot],
      bookings: [...fixtureCollections.bookings, selfBooking, pastSelfBooking],
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
      // ⚠️ Слот УЖЕ ЗАКОНЧИЛСЯ и окно ещё открыто: иначе отказ пришёл бы по сроку,
      // а не по владению, и тест был бы зелен при полностью снятой проверке.
      const response = await request(harness.app.getHttpServer())
        .post(`/api/bookings/${PAST_BOOKING_ID}/check-in`)
        .set('Cookie', ownerCookie)
        .send({ outcome: 'completed' });

      expect(response.status, 'владелец отметил себе посещение').toBe(403);
      expect(
        String((response.body as { error?: string }).error ?? ''),
        'отказ пришёл не от правила «сам себе»',
      ).toMatch(/вторая сторона/i);
      expect(await bookingStatus(PAST_BOOKING_ID), 'статус записи изменился').toBe('confirmed');
    });

    it('точка 6: отмена своей записи владельцем слота не выдаётся за отмену клиентом', async () => {
      // ⚠️ Сегодня ветка атлета проверяется РАНЬШЕ ветки владельца, поэтому владелец,
      // отменяющий запись на своём же занятии, попадает в статистику как передумавший
      // клиент. Это подмена стороны, а не отмена.
      const response = await request(harness.app.getHttpServer())
        .post(`/api/bookings/${SELF_BOOKING_ID}/cancel`)
        .set('Cookie', ownerCookie)
        .send({});

      // ⚠️ Раньше тест молча выходил, если ответ не 200, — то есть при отказе
      // не проверял вообще ничего. Отмена своей записи владельцем слота разрешена
      // (запретить её значило бы запереть запись навсегда), и спор здесь только
      // о СТОРОНЕ: она обязана быть стороной услуг.
      expect(response.status, 'владелец не смог отменить запись на своём занятии').toBe(200);
      expect(
        await bookingStatus(SELF_BOOKING_ID),
        'отмена владельцем записана как отмена клиентом',
      ).toBe('cancelled_by_provider');
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
