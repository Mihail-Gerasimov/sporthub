import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

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
  });

  afterEach(async () => {
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
      status: 'confirmed',
      paymentStatus: 'unpaid',
      totalPrice: 1400,
    });
    expect(postBody.data.clubId).toBeUndefined();

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
});
