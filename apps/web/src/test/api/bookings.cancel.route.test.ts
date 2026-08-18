// Phase 24 Step 24.4: тесты POST /api/bookings/[id]/cancel.
// Универсальная отмена: атлет-владелец → cancelled_by_athlete (+ cancelReason),
// провайдер parent-сущности → cancelled_by_provider. Guards: только эти две роли.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as cancelRoute } from '@/app/api/bookings/[id]/cancel/route';
import { createBookingAtomic, transitionBooking } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const createCancelRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/bookings/${id}/cancel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/bookings/[id]/cancel', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('атлет-владелец отменяет свою pending-запись → cancelled_by_athlete', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createCancelRequest(String(booking.id), { userId: 1 });
    const response = await cancelRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('cancelled_by_athlete');
    expect(body.data.cancelledBy).toBe('athlete');
    expect(body.data.cancelReason).toBeDefined();
  });

  it('провайдер parent-сущности отменяет confirmed → cancelled_by_provider', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });

    const { request, params } = createCancelRequest(String(booking.id), { userId: 2 });
    const response = await cancelRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('cancelled_by_provider');
    expect(body.data.cancelledBy).toBe('provider');
  });

  it('возвращает 403 для стороннего пользователя', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createCancelRequest(String(booking.id), { userId: 999 });
    const response = await cancelRoute(request, { params });

    expect(response.status).toBe(403);
  });

  it('возвращает 404 для несуществующего booking', async () => {
    const { request, params } = createCancelRequest('99999', { userId: 1 });
    const response = await cancelRoute(request, { params });

    expect(response.status).toBe(404);
  });
});
