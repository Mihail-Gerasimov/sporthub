// Тесты API записей: POST /api/bookings, DELETE /api/bookings/[id].
// Phase 24 (Step 24.4): GET /api/bookings триггерит runLazyBookingTransitions,
// поэтому тесты с seed-слотом 1001 (2026-03-20) фиксируют "сейчас" на день до
// слота, чтобы не словить auto-cancel pending при текущей системной дате.
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { DELETE } from '@/app/api/bookings/[id]/route';
import { GET, POST } from '@/app/api/bookings/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { Schedule } from '@/types';

describe('Bookings API', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    // Фиксируем "сейчас" до даты seed-слотов, чтобы runLazyBookingTransitions не
    // триггерила auto-cancel на старых seed-pending при выполнении GET /api/bookings.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-19T06:00:00'));
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('возвращает записи пользователя по userId', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/bookings?userId=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThanOrEqual(3);
  });

  it('создаёт запись, сохраняет её в JSON и резервирует место в расписании', async () => {
    const postResponse = await POST(
      new Request('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId: 1001,
          userId: 1,
        }),
      }),
    );
    const postBody = await postResponse.json();

    expect(postResponse.status).toBe(201);
    expect(postBody.success).toBe(true);
    // Phase 24: POST создаёт booking в pending, ждёт подтверждения провайдером.
    expect(postBody.data).toMatchObject({
      scheduleId: 1001,
      offeringId: 101,
      ownerType: 'trainer',
      ownerId: 1,
      affiliatedClubId: 1,
      userId: 1,
      trainerId: 1,
      sportId: 3,
      date: '2026-03-20',
      status: 'pending',
      paymentStatus: 'unpaid',
      totalPrice: 1400,
      cancellationPolicySnapshot: 'free_until_24h',
    });
    expect(postBody.data.clubId).toBeUndefined();
    expect(postBody.data.statusHistory).toHaveLength(1);
    expect(postBody.data.statusHistory[0]).toMatchObject({
      from: null,
      to: 'pending',
      actor: 'athlete',
    });

    const getResponse = await GET(new NextRequest('http://localhost:3000/api/bookings?userId=1'));
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.success).toBe(true);
    expect(getBody.data.length).toBeGreaterThanOrEqual(4);
    const createdBooking = getBody.data.find((b: { scheduleId: number }) => b.scheduleId === 1001);

    expect(createdBooking).toMatchObject({
      scheduleId: 1001,
      userId: 1,
    });

    const schedulePath = path.join(dataDirectory, 'schedule.json');
    const scheduleRaw = await readFile(schedulePath, 'utf8');
    const schedule = JSON.parse(scheduleRaw) as Schedule[];
    const reservedSlot = schedule.find((slot) => slot.id === 1001);

    expect(reservedSlot?.bookedCount).toBe(1);
  });

  it('создаёт club booking и сохраняет owner metadata клубной услуги', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId: 1,
          userId: 1,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      scheduleId: 1,
      offeringId: 1,
      ownerType: 'club',
      ownerId: 1,
      affiliatedClubId: 1,
      clubId: 1,
      trainerId: 1,
      sportId: 3,
      date: '2026-03-18',
      totalPrice: 1100,
    });
  });

  it('не создаёт запись для пользователя без роли athlete', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId: 1001,
          userId: 2,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body).toEqual({
      success: false,
      error: 'Запись доступна только спортсмену',
    });
  });

  it('не создаёт запись, если свободных мест больше нет', async () => {
    const schedulePath = path.join(dataDirectory, 'schedule.json');
    const scheduleRaw = await readFile(schedulePath, 'utf8');
    const schedule = JSON.parse(scheduleRaw) as Schedule[];
    const updatedSchedule = schedule.map((slot) =>
      slot.id === 1001 ? { ...slot, bookedCount: slot.capacity } : slot,
    );

    await writeFile(schedulePath, `${JSON.stringify(updatedSchedule, null, 2)}\n`, 'utf8');

    const response = await POST(
      new Request('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          scheduleId: 1001,
          userId: 1,
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body).toEqual({
      success: false,
      error: 'Свободных мест нет',
    });
  });

  // Phase 24 Step 24.14: guard карантина — 403 при isAthleteInQuarantine.
  it('возвращает 403 с error=quarantine, если атлет в карантине', async () => {
    // Засеиваем 3 no_show подряд для userId=1, дата — недавний no_show.
    const bookingsPath = path.join(dataDirectory, 'bookings.json');
    const quarantineBookings = [
      {
        id: 900,
        createdAt: '2026-03-10T00:00:00.000Z',
        scheduleId: 999,
        userId: 1,
        sportId: 3,
        date: '2026-03-15',
        status: 'no_show',
        paymentStatus: 'paid',
        totalPrice: 1000,
      },
      {
        id: 901,
        createdAt: '2026-03-12T00:00:00.000Z',
        scheduleId: 999,
        userId: 1,
        sportId: 3,
        date: '2026-03-17',
        status: 'no_show',
        paymentStatus: 'paid',
        totalPrice: 1000,
      },
      {
        id: 902,
        createdAt: '2026-03-14T00:00:00.000Z',
        scheduleId: 999,
        userId: 1,
        sportId: 3,
        date: '2026-03-18',
        status: 'no_show',
        paymentStatus: 'paid',
        totalPrice: 1000,
      },
    ];
    await writeFile(bookingsPath, JSON.stringify(quarantineBookings, null, 2), 'utf8');

    const response = await POST(
      new Request('http://localhost:3000/api/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scheduleId: 1001, userId: 1 }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);
    expect(body.error).toBe('quarantine');
    expect(typeof body.until).toBe('string');
  });

  /* --- DELETE /api/bookings/[id] --- */

  describe('DELETE /api/bookings/[id]', () => {
    /** Хелпер для создания DELETE-запроса с параметрами маршрута */
    function createDeleteRequest(bookingId: string, body: Record<string, unknown>) {
      return {
        request: new Request(`http://localhost:3000/api/bookings/${bookingId}`, {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        }),
        params: Promise.resolve({ id: bookingId }),
      };
    }

    it('удаляет запись и уменьшает bookedCount в расписании', async () => {
      // Сначала создаём booking
      const postResponse = await POST(
        new Request('http://localhost:3000/api/bookings', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ scheduleId: 1001, userId: 1 }),
        }),
      );
      const postBody = await postResponse.json();
      const bookingId = postBody.data.id;

      // Удаляем
      const { request, params } = createDeleteRequest(String(bookingId), { userId: 1 });
      const deleteResponse = await DELETE(request, { params });
      const deleteBody = await deleteResponse.json();

      expect(deleteResponse.status).toBe(200);
      expect(deleteBody.success).toBe(true);

      // Phase 24: soft-cancel — booking остаётся в JSON со status='cancelled_by_athlete'.
      const bookingsPath = path.join(dataDirectory, 'bookings.json');
      const bookingsRaw = await readFile(bookingsPath, 'utf8');
      const bookings = JSON.parse(bookingsRaw);
      const cancelled = bookings.find((b: { id: number }) => b.id === bookingId);

      expect(cancelled).toBeDefined();
      expect(cancelled.status).toBe('cancelled_by_athlete');
      expect(cancelled.cancelledBy).toBe('athlete');
      expect(cancelled.cancelReason).toBeDefined();

      // bookedCount всё равно освободился — слот доступен для следующего атлета.
      const schedulePath = path.join(dataDirectory, 'schedule.json');
      const scheduleRaw = await readFile(schedulePath, 'utf8');
      const schedule = JSON.parse(scheduleRaw) as Schedule[];

      expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(0);
    });

    it('не удаляет чужой booking (ownership guard)', async () => {
      // Booking id=1 принадлежит userId=1
      const { request, params } = createDeleteRequest('1', { userId: 999 });
      const response = await DELETE(request, { params });
      const body = await response.json();

      expect(response.status).toBe(403);
      expect(body.success).toBe(false);
    });

    it('возвращает 404 для несуществующего booking', async () => {
      const { request, params } = createDeleteRequest('99999', { userId: 1 });
      const response = await DELETE(request, { params });
      const body = await response.json();

      expect(response.status).toBe(404);
      expect(body.success).toBe(false);
    });

    it('возвращает 400 при невалидном userId', async () => {
      const { request, params } = createDeleteRequest('1', {});
      const response = await DELETE(request, { params });
      const body = await response.json();

      expect(response.status).toBe(400);
      expect(body.success).toBe(false);
    });
  });
});
