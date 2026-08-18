// Phase 25 Step 25.14: тесты PATCH /api/users/[id]/notification-preferences.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { PATCH } from '@/app/api/users/[id]/notification-preferences/route';
import { getUserById } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

function jsonRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/users/1/notification-preferences', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('PATCH /api/users/[id]/notification-preferences (Step 25.14)', () => {
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

  it('200: обновляет preferences для owner-а', async () => {
    const response = await PATCH(
      jsonRequest({
        userId: 1,
        preferences: {
          booking_rejected: false,
          link_requested: true,
        },
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.notificationPreferences.booking_rejected).toBe(false);
    expect(body.data.notificationPreferences.link_requested).toBe(true);

    const persisted = await getUserById(1);
    expect(persisted?.notificationPreferences?.booking_rejected).toBe(false);
  });

  it('403: userId в body не совпадает с [id] пути', async () => {
    const response = await PATCH(
      jsonRequest({ userId: 2, preferences: { booking_rejected: false } }),
      { params: Promise.resolve({ id: '1' }) },
    );

    expect(response.status).toBe(403);
  });

  it('404: пользователь не найден', async () => {
    const response = await PATCH(
      new Request('http://localhost:3000/api/users/999/notification-preferences', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId: 999, preferences: { booking_rejected: false } }),
      }),
      { params: Promise.resolve({ id: '999' }) },
    );

    expect(response.status).toBe(404);
  });

  it('отбрасывает REQUIRED-ключи (booking_confirmed/quarantine_start/booking_cancelled_by_provider)', async () => {
    const response = await PATCH(
      jsonRequest({
        userId: 1,
        preferences: {
          booking_confirmed: false,
          quarantine_start: false,
          booking_cancelled_by_provider: false,
          booking_rejected: false,
        },
      }),
      { params: Promise.resolve({ id: '1' }) },
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    // REQUIRED-ключи не попали в итоговую map.
    expect(body.data.notificationPreferences.booking_confirmed).toBeUndefined();
    expect(body.data.notificationPreferences.quarantine_start).toBeUndefined();
    expect(body.data.notificationPreferences.booking_cancelled_by_provider).toBeUndefined();
    // non-required сохранён.
    expect(body.data.notificationPreferences.booking_rejected).toBe(false);
  });
});
