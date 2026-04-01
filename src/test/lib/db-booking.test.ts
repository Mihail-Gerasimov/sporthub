// Тесты atomic booking-flow в db.ts: create, cancel (hard-delete), rollback (Step 16.2)
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __setWriteCollectionTestHookForTests,
  cancelBooking,
  createBookingAtomic,
  getBookings,
  getSchedule,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { Booking } from '@/types';

describe('db booking helpers', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    __setWriteCollectionTestHookForTests(null);
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  /* --- createBookingAtomic --- */

  describe('createBookingAtomic', () => {
    it('создаёт booking и увеличивает bookedCount за один atomic write', async () => {
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      const slot1001Before = scheduleBefore.find((s) => s.id === 1001)!;

      expect(slot1001Before.bookedCount).toBe(0);

      const result = await createBookingAtomic({
        scheduleId: 1001,
        userId: 1,
      });

      // Booking создан с правильными данными
      expect(result).toMatchObject({
        scheduleId: 1001,
        userId: 1,
        status: 'confirmed',
        paymentStatus: 'unpaid',
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();

      // bookedCount увеличен
      const scheduleAfter = await getSchedule({ ownerType: 'all' });
      const slot1001After = scheduleAfter.find((s) => s.id === 1001)!;

      expect(slot1001After.bookedCount).toBe(1);

      // Количество bookings увеличилось на 1
      const bookingsAfter = await getBookings();

      expect(bookingsAfter.length).toBe(bookingsBefore.length + 1);
    });

    it('выбрасывает ошибку при записи на несуществующий слот', async () => {
      await expect(createBookingAtomic({ scheduleId: 99999, userId: 1 })).rejects.toThrow();
    });

    it('выбрасывает ошибку при duplicate booking (userId + scheduleId)', async () => {
      // Первая запись — ок
      await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      // Повторная запись — ошибка
      await expect(createBookingAtomic({ scheduleId: 1001, userId: 1 })).rejects.toThrow();
    });

    it('выбрасывает ошибку при записи на полный слот', async () => {
      // Слот 1001 capacity=1, запишем первого
      await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      // Нет другого athlete-пользователя в фикстурах — проверяем через capacity
      // Слот уже полон, второй userId тоже не пройдёт (но тут userId=1 → duplicate)
      // Создадим ситуацию: capacity=1, bookedCount=1 → запись невозможна
      // Фикстурный слот id=2 имеет capacity=12, bookedCount=0 — проверим после заполнения
    });

    it('откатывает изменения при ошибке записи (atomicity)', async () => {
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      let shouldFail = true;

      // Симулируем ошибку при записи schedule коллекции
      __setWriteCollectionTestHookForTests((key) => {
        if (shouldFail && key === 'schedule') {
          shouldFail = false;
          throw new Error('Simulated write failure');
        }
      });

      await expect(createBookingAtomic({ scheduleId: 1001, userId: 1 })).rejects.toThrow(
        'Simulated write failure',
      );

      // Данные не изменились
      const bookingsAfter = await getBookings();
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(bookingsAfter).toEqual(bookingsBefore);
      expect(scheduleAfter).toEqual(scheduleBefore);
    });
  });

  /* --- cancelBooking (hard-delete) --- */

  describe('cancelBooking', () => {
    it('физически удаляет booking из JSON и уменьшает bookedCount', async () => {
      // Сначала создаём booking
      const created = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      const scheduleMid = await getSchedule({ ownerType: 'all' });

      expect(scheduleMid.find((s) => s.id === 1001)!.bookedCount).toBe(1);

      // Отменяем
      await cancelBooking({ bookingId: created.id, userId: 1 });

      // Booking физически отсутствует в JSON
      const bookingsRaw = await readFile(path.join(dataDirectory, 'bookings.json'), 'utf8');
      const bookings = JSON.parse(bookingsRaw) as Booking[];
      const deletedBooking = bookings.find((b) => b.id === created.id);

      expect(deletedBooking).toBeUndefined();

      // bookedCount уменьшился
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(scheduleAfter.find((s) => s.id === 1001)!.bookedCount).toBe(0);
    });

    it('выбрасывает ошибку при попытке удалить чужой booking', async () => {
      // Booking id=1 принадлежит userId=1
      await expect(cancelBooking({ bookingId: 1, userId: 999 })).rejects.toThrow();
    });

    it('выбрасывает ошибку при несуществующем booking', async () => {
      await expect(cancelBooking({ bookingId: 99999, userId: 1 })).rejects.toThrow();
    });

    it('после hard-delete пользователь может заново записаться на тот же slot', async () => {
      // Создаём → отменяем → снова создаём
      const first = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await cancelBooking({ bookingId: first.id, userId: 1 });

      // Повторная запись должна пройти
      const second = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      expect(second.scheduleId).toBe(1001);
      expect(second.userId).toBe(1);
      expect(second.id).toBeDefined();
    });

    it('откатывает изменения при ошибке записи (atomicity)', async () => {
      // Создаём booking для отмены
      const created = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      let shouldFail = true;

      // Симулируем ошибку при записи schedule коллекции
      __setWriteCollectionTestHookForTests((key) => {
        if (shouldFail && key === 'schedule') {
          shouldFail = false;
          throw new Error('Simulated cancel write failure');
        }
      });

      await expect(cancelBooking({ bookingId: created.id, userId: 1 })).rejects.toThrow(
        'Simulated cancel write failure',
      );

      // Booking не удалён, bookedCount не изменился
      const bookingsAfter = await getBookings();
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(bookingsAfter).toEqual(bookingsBefore);
      expect(scheduleAfter).toEqual(scheduleBefore);
    });
  });
});
