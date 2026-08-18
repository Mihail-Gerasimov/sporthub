// Phase 25 Step 25.15: тесты GET /api/bookings/[id] (admin-only drawer-чтение).
import { NextRequest } from 'next/server';
import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/bookings/[id]/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

async function seedAdminUser(dataDirectory: string) {
  await writeFile(
    path.join(dataDirectory, 'users.json'),
    `${JSON.stringify(
      [
        {
          id: 1,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'athlete',
          name: 'Алексей',
          email: 'alex@test.local',
          phone: '+7 (999) 000-00-01',
          password: 'secret',
          favoriteClubIds: [],
        },
        {
          id: 3,
          createdAt: '2026-01-01T00:00:00.000Z',
          role: 'admin',
          name: 'Admin',
          email: 'admin@test.local',
          phone: '+7 (999) 000-00-00',
          password: 'secret',
          favoriteClubIds: [],
        },
      ],
      null,
      2,
    )}\n`,
    'utf8',
  );
}

describe('GET /api/bookings/[id] (Step 25.15)', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    await seedAdminUser(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('200: admin получает booking', async () => {
    // fixtureBookings содержит id=1.
    const response = await GET(new NextRequest('http://localhost:3000/api/bookings/1?userId=3'), {
      params: Promise.resolve({ id: '1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.id).toBe(1);
  });

  it('403: не-admin получает отказ', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/bookings/1?userId=1'), {
      params: Promise.resolve({ id: '1' }),
    });

    expect(response.status).toBe(403);
  });

  it('404: booking не найден', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/bookings/999?userId=3'), {
      params: Promise.resolve({ id: '999' }),
    });

    expect(response.status).toBe(404);
  });
});
