// Тесты runLazyBookingTransitions (Phase 24 Step 24.3): ленивые автопереходы FSM
// без cron. pending → cancelled_by_provider за 1 час до слота (actor='system').
// confirmed → unmarked через 48 часов после endAt (actor='system'). Идемпотентность
// повторного вызова на тех же данных.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  createBookingAtomic,
  getBookings,
  getNotifications,
  getSchedule,
  runLazyBookingTransitions,
  transitionBooking,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('runLazyBookingTransitions — Phase 24', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    // Очищаем seed booking'и — тесты создают собственные контролируемые записи
    // и фиксируют "сейчас" относительно конкретных слотов.
    await writeFile(path.join(dataDirectory, 'bookings.json'), '[]\n', 'utf8');
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  // seed slot 1001: date=2026-03-20, startTime=08:15, endTime=09:15

  it('переводит pending → cancelled_by_provider (actor=system) за менее 1 часа до слота', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    // Слот через 30 минут → порог 1h пройден → авто-отмена
    const now = new Date('2026-03-20T07:45:00');

    const result = await runLazyBookingTransitions(now);

    expect(result.autoCancelledPending).toBe(1);
    expect(result.autoUnmarked).toBe(0);

    const bookings = await getBookings();
    const updated = bookings.find((b) => b.id === booking.id);

    expect(updated?.status).toBe('cancelled_by_provider');
    expect(updated?.cancelledBy).toBe('system');
    expect(updated?.statusHistory?.[1]).toMatchObject({
      from: 'pending',
      to: 'cancelled_by_provider',
      actor: 'system',
      reason: 'auto_cancel_pending_expired',
    });

    // bookedCount декрементирован
    const schedule = await getSchedule({ ownerType: 'all' });
    expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(0);
  });

  it('не трогает pending при запасе >1 часа до слота', async () => {
    await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    // Слот через 3 часа — окно auto-cancel ещё не наступило.
    const now = new Date('2026-03-20T05:00:00');

    const result = await runLazyBookingTransitions(now);

    expect(result.autoCancelledPending).toBe(0);
    expect(result.autoUnmarked).toBe(0);

    const bookings = await getBookings();
    expect(bookings.find((b) => b.scheduleId === 1001)?.status).toBe('pending');
  });

  it('переводит confirmed → unmarked (actor=system) через 48 часов после endAt', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    await transitionBooking({
      bookingId: booking.id,
      to: 'confirmed',
      actor: 'provider',
      actorUserId: 2,
    });

    // endAt = 2026-03-20T09:15:00. 48+ часов спустя.
    const now = new Date('2026-03-22T10:00:00');

    const result = await runLazyBookingTransitions(now);

    expect(result.autoUnmarked).toBe(1);
    expect(result.autoCancelledPending).toBe(0);

    const bookings = await getBookings();
    const updated = bookings.find((b) => b.id === booking.id);

    expect(updated?.status).toBe('unmarked');
    expect(updated?.statusHistory?.[2]).toMatchObject({
      from: 'confirmed',
      to: 'unmarked',
      actor: 'system',
    });

    // bookedCount НЕ декрементируется: слот физически прошёл.
    const schedule = await getSchedule({ ownerType: 'all' });
    expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(1);
  });

  it('не трогает confirmed в пределах окна check-in (<48 часов после endAt)', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

    // endAt + 47 часов — окно check-in ещё не истекло.
    const now = new Date('2026-03-22T08:00:00');

    const result = await runLazyBookingTransitions(now);

    expect(result.autoUnmarked).toBe(0);

    const bookings = await getBookings();
    expect(bookings.find((b) => b.id === booking.id)?.status).toBe('confirmed');
  });

  it('идемпотентна: повторный вызов на тех же данных ничего не меняет', async () => {
    await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    const now = new Date('2026-03-20T07:45:00');

    const firstRun = await runLazyBookingTransitions(now);
    expect(firstRun.autoCancelledPending).toBe(1);

    const secondRun = await runLazyBookingTransitions(now);
    expect(secondRun.autoCancelledPending).toBe(0);
    expect(secondRun.autoUnmarked).toBe(0);
  });

  it('не трогает финальные статусы (completed/no_show/cancelled_by_athlete)', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });
    // Провайдер сделал check-in как completed до истечения окна.
    await transitionBooking({
      bookingId: booking.id,
      to: 'completed',
      actor: 'provider',
      now: new Date('2026-03-20T10:00:00'),
    });

    // Даже спустя 100 часов — completed не превращается в unmarked.
    const now = new Date('2026-03-24T12:00:00');
    const result = await runLazyBookingTransitions(now);

    expect(result.autoUnmarked).toBe(0);
    expect(result.autoCancelledPending).toBe(0);

    const bookings = await getBookings();
    expect(bookings.find((b) => b.id === booking.id)?.status).toBe('completed');
  });

  // Phase 26 hotfix: auto-expire уведомляет и атлета, и провайдера (а не только атлета).
  it('авто-expire pending создаёт уведомления и атлету, и провайдеру', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    const now = new Date('2026-03-20T07:45:00');

    await runLazyBookingTransitions(now);

    const athleteNotes = await getNotifications({ userId: 1 });
    const providerNotes = await getNotifications({ userId: 2 });

    expect(athleteNotes.some((n) => n.type === 'booking_auto_expired')).toBe(true);
    expect(providerNotes.some((n) => n.type === 'booking_auto_expired_to_provider')).toBe(true);
    const providerNote = providerNotes.find((n) => n.type === 'booking_auto_expired_to_provider');
    expect(providerNote?.payload).toMatchObject({
      bookingId: booking.id,
      athleteUserId: 1,
    });
  });

  it('обрабатывает смешанный набор: pending к авто-cancel + confirmed к unmark за один проход', async () => {
    // 1-й booking: pending на 1001 (авто-cancel в 08:00, т.к. 1h-окно)
    const pendingBooking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    // 2-й booking на другом слоте — confirmed, endAt которого прошёл >48 часов.
    // Используем seed fixtureClubSlot1: date=2026-03-18, endTime=09:00.
    const confirmedBooking = await createBookingAtomic({ scheduleId: 1, userId: 1 });
    await transitionBooking({
      bookingId: confirmedBooking.id,
      to: 'confirmed',
      actor: 'provider',
    });

    // "сейчас" = 2026-03-20 08:00 — pending 1001 начнётся в 08:15 (через 15 мин) → auto-cancel.
    // Slot 1 закончился 2026-03-18 09:00 — прошло 47h (не unmark) → unmark только >=48h.
    // Подвинем "сейчас" на 2026-03-20 10:00 → pending 1001 уже прошёл startAt (-1h от 08:15 = 07:15)
    // → auto-cancel. Slot 1 endAt = 2026-03-18 09:00, сейчас = 2026-03-20 10:00 — прошло 49h → unmark.
    const now = new Date('2026-03-20T10:00:00');

    const result = await runLazyBookingTransitions(now);

    expect(result.autoCancelledPending).toBe(1);
    expect(result.autoUnmarked).toBe(1);

    const bookings = await getBookings();
    expect(bookings.find((b) => b.id === pendingBooking.id)?.status).toBe('cancelled_by_provider');
    expect(bookings.find((b) => b.id === confirmedBooking.id)?.status).toBe('unmarked');
  });
});
