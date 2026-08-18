// Тесты сервиса записей — оркестрация поверх репозиториев.
//
// Здесь проверяется то, чего нет в тестах чистых правил: что переход реально
// пишется, что места пересчитываются, что уведомления уходят нужным адресатам
// и что автопереходы по времени идемпотентны.
//
// Сервис собирается через контейнер внедрения зависимостей — так же, как в бою.
// Это и есть доказательство, что слои разъединены: подменяется только источник
// данных, сам сервис не знает, откуда они берутся.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { ScheduleRepository } from '../repositories/entities.repository';
import { SCHEDULE_REPOSITORY } from '../repositories/entities.repository';
import type { BookingsRepository } from '../repositories/bookings.repository';
import { BOOKINGS_REPOSITORY } from '../repositories/bookings.repository';
import { SlotContextService } from '../schedule/slot-context.service';
import { StorageModule } from '../storage/storage.module';
import { BookingService } from './booking.service';

const SLOT_DATE = '2026-03-20';

describe('BookingService', () => {
  let dataDirectory: string;
  let service: BookingService;
  let bookings: BookingsRepository;
  let schedule: ScheduleRepository;
  let notifications: NotificationsRepository;

  const write = async (file: string, data: unknown) => {
    await writeFile(path.join(dataDirectory, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  };

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-booking-svc-'));
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;

    await write('clubs.json', []);
    await write('trainers.json', [
      {
        id: 5,
        createdAt: '2026-01-01T00:00:00.000Z',
        name: 'Пётр',
        slug: 'petr',
        managedByUserId: 2,
      },
    ]);
    await write('offerings.json', [
      {
        id: 10,
        createdAt: '2026-01-01T00:00:00.000Z',
        ownerType: 'trainer',
        ownerId: 5,
        sportId: 1,
        price: 1500,
        cancellationPolicy: 'free_until_24h',
      },
    ]);
    await write('schedule.json', [
      {
        id: 100,
        createdAt: '2026-01-01T00:00:00.000Z',
        offeringId: 10,
        sportId: 1,
        date: SLOT_DATE,
        startTime: '08:00',
        endTime: '09:00',
        capacity: 2,
        bookedCount: 0,
        price: 1500,
      },
    ]);
    await write('bookings.json', []);
    await write('notifications.json', []);
    await write('logs.json', []);
    await write('users.json', []);
    await write('trainer-club-links.json', []);
    await write('reviews.json', []);
    await write('provider-client-notes.json', []);
    for (const dictionary of ['sports', 'cities', 'tags', 'amenities', 'specialties']) {
      await write(`${dictionary}.json`, []);
    }
    await write('work-formats.json', []);

    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
      providers: [
        BookingService,
        SlotContextService,
        NotificationService,
        LogService,
        AccessService,
      ],
    }).compile();

    service = moduleRef.get(BookingService);
    bookings = moduleRef.get(BOOKINGS_REPOSITORY);
    schedule = moduleRef.get(SCHEDULE_REPOSITORY);
    notifications = moduleRef.get(NOTIFICATIONS_REPOSITORY);
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await rm(dataDirectory, { force: true, recursive: true });
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
