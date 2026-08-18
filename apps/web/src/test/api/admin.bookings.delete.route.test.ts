// Phase 24 Step 24.4: тесты DELETE /api/admin/bookings/[id] — admin-only hard-delete.
// В отличие от публичного DELETE /api/bookings/[id] (soft-cancel), полностью удаляет
// запись. Guard: admin-роль в users.json.
import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { DELETE as adminDeleteRoute } from '@/app/api/admin/bookings/[id]/route';
import { createBookingAtomic, getSchedule } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

const createDeleteRequest = (id: string, body: Record<string, unknown>) => ({
  request: new Request(`http://localhost:3000/api/admin/bookings/${id}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }),
  params: Promise.resolve({ id }),
});

describe('DELETE /api/admin/bookings/[id]', () => {
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

  it('admin (userId=3) физически удаляет pending booking и откатывает bookedCount', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createDeleteRequest(String(booking.id), { adminUserId: 3 });
    const response = await adminDeleteRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);

    // Запись физически исчезла из JSON.
    const bookingsRaw = await readFile(path.join(dataDirectory, 'bookings.json'), 'utf8');
    const bookings = JSON.parse(bookingsRaw);
    expect(bookings.find((b: { id: number }) => b.id === booking.id)).toBeUndefined();

    // bookedCount декрементирован (booking был в ACTIVE-статусе).
    const schedule = await getSchedule({ ownerType: 'all' });
    expect(schedule.find((s) => s.id === 1001)?.bookedCount).toBe(0);
  });

  it('возвращает 403 для не-admin пользователя (athlete id=1)', async () => {
    const booking = await createBookingAtomic({ scheduleId: 1001, userId: 1 });

    const { request, params } = createDeleteRequest(String(booking.id), { adminUserId: 1 });
    const response = await adminDeleteRoute(request, { params });
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.success).toBe(false);

    // Запись не удалена — guard сработал до hardDeleteBooking.
    const bookingsRaw = await readFile(path.join(dataDirectory, 'bookings.json'), 'utf8');
    const bookings = JSON.parse(bookingsRaw);
    expect(bookings.find((b: { id: number }) => b.id === booking.id)).toBeDefined();
  });

  it('возвращает 404 для несуществующего booking', async () => {
    const { request, params } = createDeleteRequest('99999', { adminUserId: 3 });
    const response = await adminDeleteRoute(request, { params });

    expect(response.status).toBe(404);
  });

  it('возвращает 400 при невалидном payload (без adminUserId)', async () => {
    const { request, params } = createDeleteRequest('1', {});
    const response = await adminDeleteRoute(request, { params });

    expect(response.status).toBe(400);
  });
});
