// Тесты сервиса записей — оркестрация поверх репозиториев.
//
// Здесь проверяется то, чего нет в тестах чистых правил: что переход реально
// пишется, что места пересчитываются, что уведомления уходят нужным адресатам
// и что автопереходы по времени идемпотентны.
//
// Сервис берётся из поднятого приложения, а не собирается вручную списком
// провайдеров: так тест идёт тем же путём, что и рабочий сервер, а список
// зависимостей не протухает молча при появлении новой.
//
// ⚠️ Срез данных полнее, чем был у файлового прогона, и это не украшение:
// у базы есть внешние ключи. Слот ссылается на услугу и владельца, услуга —
// на вид спорта, тренер — на управляющего пользователя, запись и уведомление —
// на адресата. Поэтому в срезе есть справочники и трое пользователей, без
// которых вставка отбивается ещё до проверки самой логики.

import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import { fixtureDictionaryCollections } from '@sporthub/fixtures';

import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { ScheduleRepository, TrainersRepository } from '../repositories/entities.repository';
import { SCHEDULE_REPOSITORY, TRAINERS_REPOSITORY } from '../repositories/entities.repository';
import { DEMO_PASSWORD_HASH, createTestHarness, type TestHarness } from '../test/harness';
import { BookingService } from './booking.service';

const SLOT_DATE = '2026-03-20';

/**
 * Участники среза: атлеты 1 и 3 записываются, пользователь 2 управляет тренером
 * и потому служит адресатом уведомлений провайдера.
 */
const user = (id: number, accountKind: string) => ({
  id,
  createdAt: '2026-01-01T00:00:00.000Z',
  accountKind,
  status: 'active',
  name: `Пользователь ${id}`,
  email: `u${id}@booking-service.test`,
  phone: '+7 (900) 000-00-00',
  passwordHash: DEMO_PASSWORD_HASH,
  favoriteClubIds: [],
});

describe('BookingService', () => {
  let harness: TestHarness;
  let service: BookingService;
  let bookings: BookingsRepository;
  let schedule: ScheduleRepository;
  let notifications: NotificationsRepository;

  beforeAll(async () => {
    harness = await createTestHarness('booking-service');

    service = harness.app.get(BookingService);
    bookings = harness.app.get(BOOKINGS_REPOSITORY);
    schedule = harness.app.get(SCHEDULE_REPOSITORY);
    notifications = harness.app.get(NOTIFICATIONS_REPOSITORY);
  });

  afterAll(async () => {
    await harness.close();
  });

  beforeEach(async () => {
    // Один перенос на весь срез: разложить его на отдельные записи нельзя —
    // таблицу не записать в отрыве от тех, на которые она ссылается.
    // Записи, уведомления и журнал очищаются явно: схема переживает файл,
    // и без этого следующий тест начинался бы на остатках предыдущего.
    await harness.writeMany({
      ...fixtureDictionaryCollections,
      users: [user(1, 'person'), user(2, 'person'), user(3, 'person')],
      clubs: [],
      trainers: [
        {
          id: 5,
          createdAt: '2026-01-01T00:00:00.000Z',
          name: 'Пётр',
          slug: 'petr',
          bio: 'Биография',
          avatarUrl: '',
          experienceYears: 5,
          rating: 0,
          reviewCount: 0,
          priceFrom: 1500,
          managedByUserId: 2,
          sportIds: [1],
          specialtyIds: [],
          workFormatIds: [],
          status: 'published',
        },
      ],
      offerings: [
        {
          id: 10,
          createdAt: '2026-01-01T00:00:00.000Z',
          ownerType: 'trainer',
          ownerId: 5,
          sportId: 1,
          title: 'Персональная',
          description: 'Описание',
          format: 'personal',
          price: 1500,
          durationMinutes: 60,
          capacity: 2,
          address: 'ул. Ленина, 1',
          coordinates: { lat: 53.2, lng: 50.1 },
          cancellationPolicy: 'free_until_24h',
        },
      ],
      schedule: [
        {
          id: 100,
          createdAt: '2026-01-01T00:00:00.000Z',
          offeringId: 10,
          // Владелец слота у базы — обязательная колонка: без него неизвестно,
          // чьё это занятие, и уведомлять провайдера будет некого.
          ownerType: 'trainer',
          ownerId: 5,
          sportId: 1,
          title: 'Занятие',
          date: SLOT_DATE,
          startTime: '08:00',
          endTime: '09:00',
          durationMinutes: 60,
          level: 'all_levels',
          capacity: 2,
          bookedCount: 0,
          price: 1500,
        },
      ],
      bookings: [],
      notifications: [],
      logs: [],
    });
  });

  describe('создание записи', () => {
    it('создаёт ожидающую запись, занимает место и фиксирует политику отмены', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      expect(booking.status).toBe('pending');
      expect(booking.cancellationPolicySnapshot).toBe('free_until_24h');
      expect(booking.statusHistory).toHaveLength(1);
      expect(booking.statusHistory?.[0]).toMatchObject({
        from: null,
        to: 'pending',
      });
      expect((await schedule.findById(100))?.bookedCount).toBe(1);
    });

    it('на несуществующий слот отвечает «не найдено»', async () => {
      await expect(service.create({ scheduleId: 999, userId: 1 })).rejects.toThrow(
        'Слот расписания не найден',
      );
    });

    it('повторная запись на тот же слот запрещена', async () => {
      await service.create({ scheduleId: 100, userId: 1 });

      await expect(service.create({ scheduleId: 100, userId: 1 })).rejects.toThrow(
        'Пользователь уже записан на это занятие',
      );
    });

    it('после отмены можно записаться снова', async () => {
      const first = await service.create({ scheduleId: 100, userId: 1 });
      await service.cancelByAthlete({ bookingId: first.id, userId: 1 });

      const second = await service.create({ scheduleId: 100, userId: 1 });

      expect(second.status).toBe('pending');
    });

    it('на убранное из каталога лицо записаться нельзя', async () => {
      // ⚠️ Шаг 35.24a. Архив прячет лицо из каталога, но ссылка на слот остаётся
      // рабочей — она есть в закладках и в чужих сообщениях. Без этой проверки
      // человек получил бы подтверждение записи на занятие, которое никто
      // не проведёт: лица на площадке уже нет.
      const trainers = harness.app.get<TrainersRepository>(TRAINERS_REPOSITORY);
      await trainers.update(5, {
        status: 'hidden',
        hideReason: 'Убрано владельцем из каталога',
        hiddenByUserId: 2,
        hiddenAt: new Date().toISOString(),
      });

      await expect(service.create({ scheduleId: 100, userId: 1 })).rejects.toThrow(
        'Публикация убрана из каталога — запись на неё закрыта',
      );

      // Отказ обязан быть отказом: ни записи, ни занятого места.
      expect(await bookings.findAll()).toHaveLength(0);
      expect((await schedule.findById(100))?.bookedCount).toBe(0);
    });

    it('на заполненный слот записаться нельзя', async () => {
      await service.create({ scheduleId: 100, userId: 1 });
      await service.create({ scheduleId: 100, userId: 2 });

      await expect(service.create({ scheduleId: 100, userId: 3 })).rejects.toThrow(
        'Свободных мест нет',
      );
    });
  });

  describe('переходы', () => {
    it('провайдер подтверждает — место остаётся занятым', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      const confirmed = await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });

      expect(confirmed.status).toBe('confirmed');
      expect((await schedule.findById(100))?.bookedCount).toBe(1);
    });

    it('отказ провайдера освобождает место', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await service.transition({
        bookingId: booking.id,
        to: 'rejected_by_provider',
        actor: 'provider',
        reason: 'нет мест',
      });

      expect((await schedule.findById(100))?.bookedCount).toBe(0);
    });

    it('неявка место не освобождает — оно было занято', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });
      await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });

      await service.transition({
        bookingId: booking.id,
        to: 'no_show',
        actor: 'provider',
      });

      expect((await schedule.findById(100))?.bookedCount).toBe(1);
    });

    it('завершение проставляет время', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });
      await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });

      const completed = await service.transition({
        bookingId: booking.id,
        to: 'completed',
        actor: 'provider',
      });

      expect(completed.completedAt).toBeDefined();
    });

    it('недопустимый переход отклоняется с дословным текстом', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await expect(
        service.transition({
          bookingId: booking.id,
          to: 'completed',
          actor: 'provider',
        }),
      ).rejects.toThrow('Недопустимый переход booking: pending → completed');
    });

    it('актор без права получает отказ', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await expect(
        service.transition({
          bookingId: booking.id,
          to: 'confirmed',
          actor: 'athlete',
        }),
      ).rejects.toThrow("Actor 'athlete' не может выполнять переход pending → confirmed");
    });

    it('отмена чужой записи запрещена', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await expect(service.cancelByAthlete({ bookingId: booking.id, userId: 999 })).rejects.toThrow(
        'Недостаточно прав для отмены записи',
      );
    });
  });

  describe('уведомления', () => {
    it('отмена атлетом извещает и его, и провайдера', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await service.cancelByAthlete({ bookingId: booking.id, userId: 1 });

      const forAthlete = await notifications.findMany({ userId: 1 });
      const forProvider = await notifications.findMany({ userId: 2 });

      expect(forAthlete.map((item) => item.type)).toContain('booking_cancelled_by_athlete');
      expect(forProvider.map((item) => item.type)).toContain(
        'booking_cancelled_by_athlete_to_provider',
      );
    });

    it('ручная отмена провайдером ему самому уведомления не шлёт', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await service.transition({
        bookingId: booking.id,
        to: 'cancelled_by_provider',
        actor: 'provider',
      });

      expect(await notifications.findMany({ userId: 2 })).toHaveLength(0);
      const forAthlete = await notifications.findMany({ userId: 1 });
      expect(forAthlete.map((item) => item.type)).toContain('booking_cancelled_by_provider');
    });

    it('автоотмена извещает обе стороны', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await service.transition({
        bookingId: booking.id,
        to: 'cancelled_by_provider',
        actor: 'system',
        reason: 'auto_cancel_pending_expired',
      });

      const forAthlete = await notifications.findMany({ userId: 1 });
      const forProvider = await notifications.findMany({ userId: 2 });

      expect(forAthlete.map((item) => item.type)).toContain('booking_auto_expired');
      expect(forProvider.map((item) => item.type)).toContain('booking_auto_expired_to_provider');
    });

    it('служебный финал атлету не сообщается', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });
      await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });
      const before = (await notifications.findMany({ userId: 1 })).length;

      await service.transition({
        bookingId: booking.id,
        to: 'unmarked',
        actor: 'system',
      });

      expect(await notifications.findMany({ userId: 1 })).toHaveLength(before);
    });
  });

  describe('автопереходы по времени', () => {
    it('ожидающая запись отменяется менее чем за час до начала', async () => {
      await service.create({ scheduleId: 100, userId: 1 });
      // Слот начинается в 08:00 — берём момент за полчаса до.
      const now = new Date(`${SLOT_DATE}T07:30:00`);

      const result = await service.runLazyTransitions(now);

      expect(result.autoCancelledPending).toBe(1);
      expect((await bookings.findAll())[0].status).toBe('cancelled_by_provider');
    });

    it('при запасе больше часа ничего не трогает', async () => {
      await service.create({ scheduleId: 100, userId: 1 });

      const result = await service.runLazyTransitions(new Date(`${SLOT_DATE}T05:00:00`));

      expect(result.autoCancelledPending).toBe(0);
    });

    it('подтверждённая запись через 48 часов после конца помечается служебно', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });
      await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });
      // Слот кончается в 09:00, окно отметки — 48 часов.
      const now = new Date(`${SLOT_DATE}T09:00:00`);
      now.setHours(now.getHours() + 49);

      const result = await service.runLazyTransitions(now);

      expect(result.autoUnmarked).toBe(1);
    });

    it('в пределах окна отметки не трогает', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });
      await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });
      const now = new Date(`${SLOT_DATE}T09:00:00`);
      now.setHours(now.getHours() + 47);

      expect((await service.runLazyTransitions(now)).autoUnmarked).toBe(0);
    });

    it('повторный вызов на тех же данных ничего не меняет', async () => {
      await service.create({ scheduleId: 100, userId: 1 });
      const now = new Date(`${SLOT_DATE}T07:30:00`);
      await service.runLazyTransitions(now);

      const second = await service.runLazyTransitions(now);

      expect(second).toEqual({ autoCancelledPending: 0, autoUnmarked: 0 });
    });
  });

  describe('удаление администратором', () => {
    it('активная запись исчезает и освобождает место', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });

      await service.hardDelete(booking.id);

      expect(await bookings.findAll()).toHaveLength(0);
      expect((await schedule.findById(100))?.bookedCount).toBe(0);
    });

    it('завершённая запись места не освобождает — оно уже учтено', async () => {
      const booking = await service.create({ scheduleId: 100, userId: 1 });
      await service.transition({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });
      await service.transition({
        bookingId: booking.id,
        to: 'completed',
        actor: 'provider',
      });

      await service.hardDelete(booking.id);

      expect((await schedule.findById(100))?.bookedCount).toBe(1);
    });
  });
});
