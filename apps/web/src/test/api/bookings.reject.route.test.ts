// Phase 24 Step 24.4: тесты POST /api/bookings/[id]/reject.
// Провайдер отклоняет pending-заявку, reason сохраняется в statusHistory.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { POST as rejectRoute } from '@/app/api/bookings/[id]/reject/route';
import { createBookingAtomic } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const createRejectRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/bookings/${id}/reject`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('POST /api/bookings/[id]/reject', () => {
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

  it('provider отклоняет pending-заявку с причиной', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createRejectRequest(String(booking.id), {
      userId: 2,
      reason: 'Нет свободных тренеров',
    });
    const response = await rejectRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('rejected_by_provider');
    expect(body.data.cancelledBy).toBe('provider');
    expect(body.data.statusHistory[1].reason).toBe('Нет свободных тренеров');
  });

  it('отклонение без reason тоже работает (reason опционален)', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createRejectRequest(String(booking.id), { userId: 2 });
    const response = await rejectRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.data.status).toBe('rejected_by_provider');
  });

  it('возвращает 403, если userId не владеет parent-сущностью', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createRejectRequest(String(booking.id), { userId: 1 });
    const response = await rejectRoute(request, { params });

    expect(response.status).toBe(403);
  });
});
