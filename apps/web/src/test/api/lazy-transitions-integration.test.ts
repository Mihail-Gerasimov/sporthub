// Phase 24 Step 24.4: integration-тест — GET /api/bookings триггерит
// runLazyBookingTransitions до чтения. Идемпотентно.
import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { GET as getBookingsRoute } from '@/app/api/bookings/route';
import { createBookingAtomic, getBookings } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('Lazy transitions integration via GET /api/bookings', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    // Очищаем seed booking'и — тесты создают свои.
    await writeFile(path.join(dataDirectory, 'bookings.json'), '[]\n', 'utf8');
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    vi.useRealTimers();
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('GET /api/bookings: pending за <1h до слота авто-отменяется в cancelled_by_provider', async () => {
    vi.useRealTimers();
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    // "сейчас" = 07:45 (за 30 минут до слота 08:15). runLazyBookingTransitions
    // должна перевести pending в cancelled_by_provider.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T07:45:00'));

    const response = await getBookingsRoute(
      new NextRequest('http://localhost:3000/api/bookings?userId=1'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // Проверяем сам JSON (а не ответ route, где возможна фильтрация).
    vi.useRealTimers();
    const bookings = await getBookings();
    const updated = bookings.find((b) => b.id === booking.id);
    expect(updated?.status).toBe('cancelled_by_provider');
    expect(updated?.cancelledBy).toBe('system');
  });

  it('GET /api/bookings с далёким pending не меняет статус', async () => {
    vi.useRealTimers();
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    // "сейчас" = 05:00 (за 3 часа до слота) — ещё не пора авто-отменять.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-03-20T05:00:00'));

    await getBookingsRoute(new NextRequest('http://localhost:3000/api/bookings?userId=1'));

    vi.useRealTimers();
    const bookings = await getBookings();
    const unchanged = bookings.find((b) => b.id === booking.id);
    expect(unchanged?.status).toBe('pending');
  });
});
