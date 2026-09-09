/**
 * Сторож адресата уведомления (шаг 35.27).
 *
 * Фаза 35 переносит восемь уведомлений с ЧЕЛОВЕКА на ЛИЦО услуг: заявка на занятие
 * клуба приходит клубу, приглашение — карточке тренера, отзыв — тому, о ком написан.
 * До неё владелец трёх клубов получал одну общую кучу, и разобрать, к какому клубу
 * относится заявка, было нечем.
 *
 * ⚠️ Почему сторож РАНТАЙМОВЫЙ, а не поиск по исходникам. Урок фазы 34: из 46
 * диверсий шесть не покраснели, и пять из шести оказались одного вида — тест
 * проверял ЛОГИКУ в отрыве от её ПОДКЛЮЧЕНИЯ. Проверка «в коде написано лицо»
 * зелена и тогда, когда лицо посчитали и не записали. Поэтому здесь выполняется
 * настоящее действие через маршрут, а адресат читается ИЗ БАЗЫ.
 *
 * ⚠️ Владелец у обоих лиц ОДИН человек — и это главное в наборе. Пока лицо и его
 * владелец совпадают по номеру, проверка «пришло правильному человеку» проходит
 * при полностью выключенном адресате: у человека с одним лицом ящик лица и личный
 * ящик неразличимы. Здесь у пользователя 2 есть и клуб, и карточка тренера, и оба
 * ящика обязаны быть РАЗНЫМИ.
 *
 * ⚠️ Восьмое действие — `booking_requested` — до этого шага не было покрыто
 * ни одним тестом вовсе.
 */

import request from 'supertest';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from './harness';

/** Уведомление, как оно лежит в базе: человек-владелец плюс лицо-адресат. */
type StoredNotification = {
  id: number;
  userId: number;
  type: string;
  addresseeType?: 'club' | 'trainer';
  addresseeId?: number;
};

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

const user = (id: number, role: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  role,
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@test.local`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

const club = {
  id: 1,
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
  // Клуб и карточка тренера ниже принадлежат ОДНОМУ человеку — пользователю 2.
  managedByUserId: 2,
  status: 'published',
};

const clubOf = (
  id: number,
  name: string,
  slug: string,
  managedByUserId: number,
): Record<string, unknown> => ({
  ...club,
  id,
  name,
  slug,
  managedByUserId,
});

const trainer = (id: number, name: string, slug: string, managedByUserId: number) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  name,
  slug,
  bio: 'Биография',
  avatarUrl: '',
  experienceYears: 5,
  priceFrom: 1000,
  managedByUserId,
  sportIds: [3],
  specialtyIds: [],
  workFormatIds: [],
  rating: 5,
  reviewCount: 0,
  status: 'published',
});

/** Услуга клуба: слоты под ней принадлежат клубу, а не его владельцу. */
const clubOffering = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club',
  ownerId: 1,
  sportId: 3,
  title: 'Групповая',
  description: 'Описание',
  format: 'group',
  price: 1000,
  durationMinutes: 60,
  capacity: 5,
  address: 'ул. Ленина, 1',
  coordinates: { lat: 53.2, lng: 50.1 },
  cancellationPolicy: 'free_anytime',
};

const slot = (id: number, timing: ReturnType<typeof slotAt>) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  ownerType: 'club',
  ownerId: 1,
  clubId: 1,
  offeringId: 1,
  sportId: 3,
  title: 'Занятие',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 5,
  bookedCount: 0,
  price: 1000,
  ...timing,
});

describe('Сторож адресата уведомления', () => {
  let harness: TestHarness;
  let asAthlete: string; // пользователь 1 — ни клуба, ни карточки
  let asOwner: string; // пользователь 2 — клуб 1 И карточка тренера 1
  let asOtherTrainer: string; // пользователь 5 — карточка тренера 3

  beforeAll(async () => {
    // Полдень: слот из `slotAt` обязан укладываться в одни сутки — у него одна
    // дата и два времени, и база сверяет их порядок ограничением.
    const noon = new Date();
    noon.setHours(12, 0, 0, 0);
    vi.useFakeTimers({ toFake: ['Date'], shouldAdvanceTime: true });
    vi.setSystemTime(noon);

    harness = await createTestHarness('notification-addressee');
  });

  beforeEach(async () => {
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [user(1, 'athlete'), user(2, 'club_owner'), user(5, 'trainer')],
      // Клуб 2 нужен ровно для одного: с его стороны приходит приглашение
      // КАРТОЧКЕ тренера 1 — второму лицу того же пользователя 2.
      clubs: [club, clubOf(2, 'Чужой клуб', 'chuzhoy', 5)],
      trainers: [trainer(1, 'Марина', 'marina', 2), trainer(3, 'Алексей', 'alexey', 5)],
      offerings: [clubOffering],
      schedule: [
        // Будущий слот — на него записываются; прошедший — на нём срабатывает
        // автоотмена просроченной заявки.
        slot(1, slotAt(48)),
        slot(2, slotAt(-2)),
      ],
      bookings: [],
      reviews: [],
      'trainer-club-links': [],
      notifications: [],
      logs: [],
    });

    [asAthlete, asOwner, asOtherTrainer] = await Promise.all([
      harness.as(1),
      harness.as(2),
      harness.as(5),
    ]);
  });

  afterAll(async () => {
    vi.useRealTimers();
    await harness.close();
  });

  const post = (path: string, cookie: string, body: object = {}) =>
    request(harness.app.getHttpServer()).post(`/api${path}`).set('Cookie', cookie).send(body);

  const get = (path: string, cookie: string) =>
    request(harness.app.getHttpServer()).get(`/api${path}`).set('Cookie', cookie);

  /** Уведомление названного типа, прочитанное ИЗ БАЗЫ, а не из ответа маршрута. */
  async function stored(type: string): Promise<StoredNotification> {
    const rows = await harness.read<StoredNotification[]>('notifications');
    const found = rows.filter((row) => row.type === type);

    expect(found, `уведомление ${type} не создано вовсе`).toHaveLength(1);

    return found[0];
  }

  describe('Записи', () => {
    it('заявка на занятие приходит КЛУБУ, а не в общую кучу его владельца', async () => {
      // ⚠️ До шага 35.27 этот тип не был покрыт ни одним тестом вовсе.
      const response = await post('/bookings', asAthlete, { scheduleId: 1 });
      expect(response.status).toBe(201);

      const notification = await stored('booking_requested');

      expect(notification.addresseeType).toBe('club');
      expect(notification.addresseeId).toBe(1);
      // Владелец-человек тоже на месте: по нему читается объединённый ящик
      // и по нему же уходит каскад при удалении человека.
      expect(notification.userId).toBe(2);
    });

    it('отмена атлетом приходит клубу, а самому атлету — в личный ящик', async () => {
      const created = await post('/bookings', asAthlete, { scheduleId: 1 });
      const bookingId = created.body.data.id;

      const response = await post(`/bookings/${bookingId}/cancel`, asAthlete);
      expect(response.status).toBe(200);

      const toProvider = await stored('booking_cancelled_by_athlete_to_provider');
      expect(toProvider.addresseeType).toBe('club');
      expect(toProvider.addresseeId).toBe(1);
      expect(toProvider.userId).toBe(2);

      // Обратная сторона: уведомление САМОМУ атлету лица не получает — иначе
      // «свои» уведомления уехали бы в ящик, которого у человека нет.
      const toAthlete = await stored('booking_cancelled_by_athlete');
      expect(toAthlete.addresseeType).toBeUndefined();
      expect(toAthlete.addresseeId).toBeUndefined();
      expect(toAthlete.userId).toBe(1);
    });

    it('автоотмена просроченной заявки приходит клубу', async () => {
      // Заявка на слот, который уже начался: чтение записей прогоняет автопереходы.
      await harness.writeMany({
        bookings: [
          {
            id: 500,
            createdAt: '2026-01-01T00:00:00.000Z',
            userId: 1,
            scheduleId: 2,
            clubId: 1,
            ownerType: 'club',
            ownerId: 1,
            sportId: 3,
            status: 'pending',
            date: slotAt(-2).date,
            totalPrice: 1000,
            statusHistory: [],
          },
        ],
      });

      const response = await get('/bookings', await harness.as(1));
      expect(response.status).toBe(200);

      const notification = await stored('booking_auto_expired_to_provider');
      expect(notification.addresseeType).toBe('club');
      expect(notification.addresseeId).toBe(1);
      expect(notification.userId).toBe(2);
    });
  });

  describe('Связи тренер↔клуб', () => {
    it('заявка на связь приходит ЛИЦУ противоположной стороны', async () => {
      const response = await post('/trainer-club-links', asOtherTrainer, {
        trainerId: 3,
        clubId: 1,
      });
      expect(response.status).toBe(201);

      const notification = await stored('link_requested');
      expect(notification.addresseeType).toBe('club');
      expect(notification.addresseeId).toBe(1);
      expect(notification.userId).toBe(2);
    });

    it('подтверждение приходит в ящик КАРТОЧКИ тренера-инициатора', async () => {
      const created = await post('/trainer-club-links', asOtherTrainer, {
        trainerId: 3,
        clubId: 1,
      });
      const linkId = created.body.data.id;

      const response = await post(`/trainer-club-links/${linkId}/approve`, asOwner);
      expect(response.status).toBe(200);

      const notification = await stored('link_approved');
      expect(notification.addresseeType).toBe('trainer');
      expect(notification.addresseeId).toBe(3);
      expect(notification.userId).toBe(5);
    });

    it('отказ приходит в ящик карточки тренера-инициатора', async () => {
      const created = await post('/trainer-club-links', asOtherTrainer, {
        trainerId: 3,
        clubId: 1,
      });
      const linkId = created.body.data.id;

      const response = await post(`/trainer-club-links/${linkId}/reject`, asOwner, {
        reason: 'Не в этом сезоне',
      });
      expect(response.status).toBe(200);

      const notification = await stored('link_rejected');
      expect(notification.addresseeType).toBe('trainer');
      expect(notification.addresseeId).toBe(3);
      expect(notification.userId).toBe(5);
    });

    it('разрыв связи приходит в ящик лица оставшейся стороны', async () => {
      const created = await post('/trainer-club-links', asOtherTrainer, {
        trainerId: 3,
        clubId: 1,
      });
      const linkId = created.body.data.id;
      await post(`/trainer-club-links/${linkId}/approve`, asOwner);

      const response = await post(`/trainer-club-links/${linkId}/revoke`, asOwner);
      expect(response.status).toBe(200);

      const notification = await stored('link_revoked');
      expect(notification.addresseeType).toBe('trainer');
      expect(notification.addresseeId).toBe(3);
      expect(notification.userId).toBe(5);
    });
  });

  describe('Отзывы', () => {
    it('отзыв приходит ЛИЦУ, о котором написан, а автору — в личный ящик', async () => {
      // Отзыв возможен только после посещения: засеваем завершённую запись.
      await harness.writeMany({
        bookings: [
          {
            id: 600,
            createdAt: '2026-01-01T00:00:00.000Z',
            userId: 1,
            scheduleId: 2,
            clubId: 1,
            ownerType: 'club',
            ownerId: 1,
            sportId: 3,
            status: 'completed',
            date: slotAt(-2).date,
            totalPrice: 1000,
            statusHistory: [],
          },
        ],
      });

      const response = await post('/reviews', await harness.as(1), {
        clubId: 1,
        rating: 5,
        text: 'Отличный клуб, всё понравилось',
      });
      expect(response.status).toBe(201);

      const toProvider = await stored('review_received_by_provider');
      expect(toProvider.addresseeType).toBe('club');
      expect(toProvider.addresseeId).toBe(1);
      expect(toProvider.userId).toBe(2);

      const toAthlete = await stored('review_published_for_athlete');
      expect(toAthlete.addresseeType).toBeUndefined();
      expect(toAthlete.userId).toBe(1);
    });
  });

  describe('Ящики одного человека не сливаются', () => {
    it('уведомления клубу и карточке тренера лежат в РАЗНЫХ ящиках одного человека', async () => {
      // Главная проверка набора. У пользователя 2 два лица; пока уведомление
      // адресуется человеку, оба ящика — это одна куча, и различить их нечем.
      //
      // Заявка на занятие уходит КЛУБУ 1, приглашение от чужого клуба 2 —
      // КАРТОЧКЕ тренера 1. Оба лица принадлежат пользователю 2.
      await post('/bookings', asAthlete, { scheduleId: 1 });
      await post('/trainer-club-links', asOtherTrainer, { trainerId: 1, clubId: 2 });

      const rows = await harness.read<StoredNotification[]>('notifications');
      const mine = rows.filter((row) => row.userId === 2);

      // Два уведомления одному человеку — и это ДВА РАЗНЫХ ящика.
      expect(
        mine.map((row) => `${row.type} → ${row.addresseeType}:${row.addresseeId}`).sort(),
      ).toEqual(['booking_requested → club:1', 'link_requested → trainer:1']);
    });
  });
});
