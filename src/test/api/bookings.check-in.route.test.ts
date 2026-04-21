// Phase 24 Step 24.4: тесты POST /api/bookings/[id]/check-in.
// Провайдер отмечает исход confirmed-записи: completed или no_show.
// Guards: ownership + окно времени (после endAt, до endAt + 48h).
// Проверяем mock-времени через системное время — используем реальный Date, а endAt
// seed-слота 1001 (2026-03-20T09:15). Подставляем конкретную дату через vi.setSystemTime.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POST as checkInRoute } from '@/app/api/bookings/[id]/check-in/route';
import { createBookingAtomic, transitionBooking } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const createCheckInRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/bookings/${id}/check-in`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/bookings/[id]/check-in', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    vi.useFakeTimers();
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  async function createConfirmedBooking() {
    // Используем реальное время для создания и перехода, чтобы runLazyBookingTransitions
    // не сработала раньше времени (она не вызывается в transitionBooking — только ручной).
    vi.useRealTimers();
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });
    await transitionBooking({ bookingId: booking.id, to: 'confirmed', actor: 'provider' });
    vi.useFakeTimers();
    return booking;
  }

  it('completed: provider отмечает проведение после окончания слота', async () => {
    const booking = await createConfirmedBooking();
    // endAt = 2026-03-20T09:15:00, "сейчас" = 10:00 того же дня.
    vi.setSystemTime(new Date('2026-03-20T10:00:00'));

    const { request, params } = createCheckInRequest(String(booking.id), {
      userId: 2,
      outcome: 'completed',
    });
    const response = await checkInRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('completed');
    expect(body.data.completedAt).toBeDefined();
  });

  it('no_show: provider отмечает неявку', async () => {
    const booking = await createConfirmedBooking();
    vi.setSystemTime(new Date('2026-03-20T10:00:00'));

    const { request, params } = createCheckInRequest(String(booking.id), {
      userId: 2,
      outcome: 'no_show',
    });
    const response = await checkInRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('no_show');
  });

  it('возвращает 409, если check-in до окончания слота', async () => {
    const booking = await createConfirmedBooking();
    // endAt = 09:15, "сейчас" = 09:00 — слот ещё идёт.
    vi.setSystemTime(new Date('2026-03-20T09:00:00'));

    const { request, params } = createCheckInRequest(String(booking.id), {
      userId: 2,
      outcome: 'completed',
    });
    const response = await checkInRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('после окончания слота');
  });

  it('возвращает 409, если окно 48h истекло', async () => {
    const booking = await createConfirmedBooking();
    // endAt + 50 часов.
    vi.setSystemTime(new Date('2026-03-22T11:15:00'));

    const { request, params } = createCheckInRequest(String(booking.id), {
      userId: 2,
      outcome: 'completed',
    });
    const response = await checkInRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(409);
    expect(body.error).toContain('48 часов');
  });

  it('возвращает 403, если userId не владеет parent-сущностью', async () => {
    const booking = await createConfirmedBooking();
    vi.setSystemTime(new Date('2026-03-20T10:00:00'));

    const { request, params } = createCheckInRequest(String(booking.id), {
      userId: 999,
      outcome: 'completed',
    });
    const response = await checkInRoute(request, { params });

    expect(response.status).toBe(403);
  });

  it('возвращает 400 при невалидном outcome', async () => {
    const booking = await createConfirmedBooking();

    const { request, params } = createCheckInRequest(String(booking.id), {
      userId: 2,
      outcome: 'invalid',
    });
    const response = await checkInRoute(request, { params });

    expect(response.status).toBe(400);
  });
});
