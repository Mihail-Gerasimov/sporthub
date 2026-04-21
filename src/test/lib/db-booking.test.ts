// Тесты atomic booking-flow в db.ts: create (стартовый pending + snapshot policy),
// cancel (soft-cancel через FSM) и rollback.
// Phase 24 Step 24.3 — переписано под FSM: booking создаётся в pending, cancelBooking
// не удаляет запись, а переводит в cancelled_by_athlete со statusHistory и cancelReason.
import { readFile, writeFile } from 'node:fs/promises';
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
import type { Booking, Schedule } from '@/types';

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

  /* --- createBookingAtomic (Phase 24: стартовый pending + snapshot policy) --- */

  describe('createBookingAtomic', () => {
    it('создаёт booking в статусе pending с snapshot-policy и увеличивает bookedCount', async () => {
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      const slot1001Before = scheduleBefore.find((s) => s.id === 1001)!;

      expect(slot1001Before.bookedCount).toBe(0);

      const result = await createBookingAtomic({
        scheduleId: 1001,
        userId: 1,
      });

      // Phase 24: booking создаётся в pending, ждёт подтверждения провайдера.
      expect(result).toMatchObject({
        scheduleId: 1001,
        userId: 1,
        status: 'pending',
        paymentStatus: 'unpaid',
      });
      expect(result.id).toBeDefined();
      expect(result.createdAt).toBeDefined();

      // Phase 24: snapshot cancellation-policy клонирован с offering (seed = free_until_24h).
      expect(result.cancellationPolicySnapshot).toBe('free_until_24h');

      // Phase 24: первый переход в statusHistory (from=null → to=pending, actor=athlete).
      expect(result.statusHistory).toHaveLength(1);
      expect(result.statusHistory?.[0]).toMatchObject({
        from: null,
        to: 'pending',
        actor: 'athlete',
        actorUserId: 1,
      });

      // bookedCount увеличен — pending физически занимает слот.
      const scheduleAfter = await getSchedule({ ownerType: 'all' });
      const slot1001After = scheduleAfter.find((s) => s.id === 1001)!;

      expect(slot1001After.bookedCount).toBe(1);

      // Количество bookings увеличилось на 1.
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
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      const schedulePath = path.join(dataDirectory, 'schedule.json');
      const scheduleRaw = await readFile(schedulePath, 'utf8');
      const schedule = JSON.parse(scheduleRaw) as Schedule[];
      const updatedSchedule = schedule.map((slot) =>
        slot.id === 1001 ? { ...slot, bookedCount: slot.capacity } : slot,
      );

      // Напрямую заполняем слот до capacity, чтобы проверить именно capacity guard, а не duplicate.
      await writeFile(schedulePath, `${JSON.stringify(updatedSchedule, null, 2)}\n`, 'utf8');

      await expect(createBookingAtomic({ scheduleId: 1001, userId: 1 })).rejects.toThrow(
        'Свободных мест нет',
      );

      // Ошибка capacity не должна менять bookings и расписание.
      const bookingsAfter = await getBookings();
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(bookingsAfter).toEqual(bookingsBefore);
      expect(scheduleAfter).toEqual(
        scheduleBefore.map((slot) =>
          slot.id === 1001 ? { ...slot, bookedCount: slot.capacity } : slot,
        ),
      );
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

  /* --- cancelBooking (Phase 24: soft-cancel через FSM) --- */

  describe('cancelBooking', () => {
    it('переводит booking в cancelled_by_athlete, не удаляя запись, и освобождает слот', async () => {
      // Создаём booking (pending, bookedCount=1)
      const created = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      const scheduleMid = await getSchedule({ ownerType: 'all' });

      expect(scheduleMid.find((s) => s.id === 1001)!.bookedCount).toBe(1);

      // Soft-cancel через FSM
      await cancelBooking({ bookingId: created.id, userId: 1 });

      // Phase 24: booking остаётся в JSON со status='cancelled_by_athlete' + statusHistory.
      const bookingsRaw = await readFile(path.join(dataDirectory, 'bookings.json'), 'utf8');
      const bookings = JSON.parse(bookingsRaw) as Booking[];
      const cancelled = bookings.find((b) => b.id === created.id);

      expect(cancelled).toBeDefined();
      expect(cancelled?.status).toBe('cancelled_by_athlete');
      expect(cancelled?.cancelledBy).toBe('athlete');
      expect(cancelled?.cancelReason).toBeDefined();
      // statusHistory: pending (initial) + cancelled_by_athlete (soft-cancel).
      expect(cancelled?.statusHistory).toHaveLength(2);
      expect(cancelled?.statusHistory?.[1]).toMatchObject({
        from: 'pending',
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        actorUserId: 1,
      });

      // bookedCount уменьшился — слот свободен для другого атлета.
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(scheduleAfter.find((s) => s.id === 1001)!.bookedCount).toBe(0);
    });

    it('выбрасывает ошибку при попытке отменить чужой booking (ownership-guard)', async () => {
      // Booking id=1 (seed) принадлежит userId=1, другой userId не имеет прав.
      await expect(cancelBooking({ bookingId: 1, userId: 999 })).rejects.toThrow();
    });

    it('выбрасывает ошибку при несуществующем booking', async () => {
      await expect(cancelBooking({ bookingId: 99999, userId: 1 })).rejects.toThrow();
    });

    it('после soft-cancel пользователь может заново записаться на тот же слот', async () => {
      // Создаём → soft-cancel → снова создаём. Duplicate guard срабатывает только
      // по ACTIVE (pending/confirmed); cancelled_by_athlete — терминал, не блокирует.
      const first = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await cancelBooking({ bookingId: first.id, userId: 1 });

      const second = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      expect(second.scheduleId).toBe(1001);
      expect(second.userId).toBe(1);
      expect(second.id).toBeDefined();
      expect(second.id).not.toBe(first.id); // новый id
      expect(second.status).toBe('pending');
    });

    it('откатывает изменения при ошибке записи (atomicity)', async () => {
      const created = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      let shouldFail = true;

      __setWriteCollectionTestHookForTests((key) => {
        if (shouldFail && key === 'schedule') {
          shouldFail = false;
          throw new Error('Simulated cancel write failure');
        }
      });

      await expect(cancelBooking({ bookingId: created.id, userId: 1 })).rejects.toThrow(
        'Simulated cancel write failure',
      );

      // Rollback: booking остался в pending, bookedCount не менялся.
      const bookingsAfter = await getBookings();
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(bookingsAfter).toEqual(bookingsBefore);
      expect(scheduleAfter).toEqual(scheduleBefore);
    });
  });
});
