// Тесты FSM-ядра booking'а (Phase 24 Step 24.3): валидация переходов,
// transitionBooking (statusHistory, bookedCount-правила, cancelledBy/cancelReason/completedAt),
// rollback при ошибке записи.
//
// booking-lazy-transitions.test.ts покрывает runLazyBookingTransitions отдельно.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  __setWriteCollectionTestHookForTests,
  createBookingAtomic,
  getBookings,
  getSchedule,
  transitionBooking,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('booking FSM — Phase 24', () => {
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

  describe('validateTransition (через transitionBooking)', () => {
    it('разрешает pending → confirmed для provider', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      const updated = await transitionBooking({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
        actorUserId: 2,
      });

      expect(updated.status).toBe('confirmed');
      expect(updated.statusHistory).toHaveLength(2);
      expect(updated.statusHistory?.[1]).toMatchObject({
        from: 'pending',
        to: 'confirmed',
        actor: 'provider',
        actorUserId: 2,
      });
    });

    it('отклоняет недопустимый переход (pending → completed)', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await expect(
        transitionBooking({ bookingId: booking.id, to: 'completed', actor: 'provider' }),
      ).rejects.toThrow('Недопустимый переход booking');
    });

    it('отклоняет перехода из финального статуса (completed → no_show)', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await transitionBooking({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'provider',
      });
      await transitionBooking({ bookingId: booking.id, to: 'completed', actor: 'provider' });

      // completed — финальный, любой дальнейший переход запрещён
      await expect(
        transitionBooking({ bookingId: booking.id, to: 'no_show', actor: 'provider' }),
      ).rejects.toThrow('Недопустимый переход booking');
    });

    it('отклоняет actor без прав (athlete не может подтвердить)', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await expect(
        transitionBooking({
          bookingId: booking.id,
          to: 'confirmed',
          actor: 'athlete',
          actorUserId: 1,
        }),
      ).rejects.toThrow("Actor 'athlete' не может выполнять переход");
    });

    it('admin может форсить любой валидный FSM-переход', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      // pending → confirmed обычно для provider; admin тоже имеет право.
      const updated = await transitionBooking({
        bookingId: booking.id,
        to: 'confirmed',
        actor: 'admin',
        actorUserId: 3,
        reason: 'admin-force',
      });

      expect(updated.status).toBe('confirmed');
      expect(updated.statusHistory?.[1].actor).toBe('admin');
    });

    it('бросает ошибку для несуществующего booking', async () => {
      await expect(
        transitionBooking({ bookingId: 99999, to: 'confirmed', actor: 'provider' }),
      ).rejects.toThrow('Запись не найдена');
    });
  });

  describe('bookedCount правила', () => {
    it('pending → confirmed: не меняет bookedCount (остаётся 1)', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      const scheduleBefore = await getSchedule({ ownerType: 'all' });
      expect(scheduleBefore.find((s) => s.id === 1001)?.bookedCount).toBe(1);

      await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

      const scheduleAfter = await getSchedule({ ownerType: 'all' });
      expect(scheduleAfter.find((s) => s.id === 1001)?.bookedCount).toBe(1);
    });

    it('pending → rejected_by_provider: декремент bookedCount', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await transitionBooking({
        bookingId: booking.id,
        to: 'rejected_by_provider',
        actor: 'provider',
      });

      const schedule = await getSchedule({ ownerType: 'all' });
      expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(0);
    });

    it('pending → cancelled_by_athlete: декремент bookedCount', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      await transitionBooking({
        bookingId: booking.id,
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        actorUserId: 1,
      });

      const schedule = await getSchedule({ ownerType: 'all' });
      expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(0);
    });

    it('confirmed → completed: bookedCount не меняется', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

      await transitionBooking({ bookingId: booking.id, to: 'completed', actor: 'provider' });

      const schedule = await getSchedule({ ownerType: 'all' });
      expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(1);
    });

    it('confirmed → no_show: bookedCount не декрементируется (место было занято)', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

      await transitionBooking({ bookingId: booking.id, to: 'no_show', actor: 'provider' });

      const schedule = await getSchedule({ ownerType: 'all' });
      expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(1);
    });

    it('confirmed → cancelled_by_provider: декремент bookedCount', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

      await transitionBooking({
        bookingId: booking.id,
        to: 'cancelled_by_provider',
        actor: 'provider',
      });

      const schedule = await getSchedule({ ownerType: 'all' });
      expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(0);
    });
  });

  describe('specific-статус поля', () => {
    it('cancelled_by_athlete: вычисляет cancelReason по snapshot-policy (late за 2h до слота при 24h policy)', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      // seed slot 1001: date=2026-03-20, startTime=08:15. "сейчас" — за 2 часа до слота.
      const now = new Date('2026-03-20T06:15:00');

      const updated = await transitionBooking({
        bookingId: booking.id,
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        actorUserId: 1,
        now,
      });

      expect(updated.cancelledBy).toBe('athlete');
      // Snapshot = 'free_until_24h', но до слота 2 часа < 24 → late.
      expect(updated.cancelReason).toBe('late');
    });

    it('cancelled_by_athlete: on_time при 25h до слота при 24h policy', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      // "сейчас" — за 25 часов до слота.
      const now = new Date('2026-03-19T07:15:00');

      const updated = await transitionBooking({
        bookingId: booking.id,
        to: 'cancelled_by_athlete',
        actor: 'athlete',
        actorUserId: 1,
        now,
      });

      expect(updated.cancelReason).toBe('on_time');
    });

    it('completed: заполняет completedAt временем перехода', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

      const now = new Date('2026-03-20T10:00:00');
      const updated = await transitionBooking({
        bookingId: booking.id,
        to: 'completed',
        actor: 'provider',
        now,
      });

      expect(updated.completedAt).toBe(now.toISOString());
    });

    it('rejected_by_provider: cancelledBy=provider, причина сохраняется в statusHistory', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

      const updated = await transitionBooking({
        bookingId: booking.id,
        to: 'rejected_by_provider',
        actor: 'provider',
        actorUserId: 2,
        reason: 'Тренер занят',
      });

      expect(updated.cancelledBy).toBe('provider');
      expect(updated.statusHistory?.[1].reason).toBe('Тренер занят');
    });
  });

  describe('rollback при ошибке записи', () => {
    it('если запись schedule упала — откатывает bookings к исходному состоянию', async () => {
      const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
      const bookingsBefore = await getBookings();
      const scheduleBefore = await getSchedule({ ownerType: 'all' });

      let shouldFail = true;
      __setWriteCollectionTestHookForTests((key) => {
        if (shouldFail && key === 'schedule') {
          shouldFail = false;
          throw new Error('Simulated schedule write failure');
        }
      });

      await expect(
        transitionBooking({
          bookingId: booking.id,
          to: 'cancelled_by_athlete',
          actor: 'athlete',
          actorUserId: 1,
        }),
      ).rejects.toThrow('Simulated schedule write failure');

      const bookingsAfter = await getBookings();
      const scheduleAfter = await getSchedule({ ownerType: 'all' });

      expect(bookingsAfter).toEqual(bookingsBefore);
      expect(scheduleAfter).toEqual(scheduleBefore);
    });
  });
});
