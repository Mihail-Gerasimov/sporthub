import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET } from '@/app/api/schedule/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('GET /api/schedule', () => {
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

  it('по умолчанию возвращает club schedule и фильтрует по clubId и date', async () => {
    const request = new NextRequest('http://localhost:3000/api/schedule?clubId=1&date=2026-03-18');

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(3);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1,
          clubId: 1,
          ownerType: 'club',
          date: '2026-03-18',
        }),
      ]),
    );
  });

  it('возвращает trainer slots при ownerType=trainer и считает availableSpots', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/schedule?ownerType=trainer&trainerId=1&sportId=3&date=2026-03-20',
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1001,
          offeringId: 101,
          ownerType: 'trainer',
          trainerId: 1,
        }),
      ]),
    );
    expect(
      body.data.every(
        (slot: { ownerType: string; trainerId: number; sportId: number }) =>
          slot.ownerType === 'trainer' && slot.trainerId === 1 && slot.sportId === 3,
      ),
    ).toBe(true);
    expect(
      body.data.every(
        (slot: { availableSpots: number; bookedCount: number; capacity: number }) =>
          slot.availableSpots === slot.capacity - slot.bookedCount && slot.availableSpots > 0,
      ),
    ).toBe(true);
  });

  it('возвращает ошибку 400 при невалидном ownerType', async () => {
    const request = new NextRequest('http://localhost:3000/api/schedule?ownerType=coach');

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'Некорректные параметры запроса',
    });
  });

  it('возвращает ошибку 400 при невалидной дате', async () => {
    const request = new NextRequest('http://localhost:3000/api/schedule?date=18-03-2026');

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'Некорректные параметры запроса',
    });
  });
});
