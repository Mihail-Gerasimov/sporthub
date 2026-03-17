import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/schedule/route';

describe('GET /api/schedule', () => {
  it('фильтрует расписание по clubId и date', async () => {
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
          date: '2026-03-18',
        }),
      ]),
    );
  });

  it('фильтрует расписание по trainerId и sportId и возвращает только слоты со свободными местами', async () => {
    const request = new NextRequest('http://localhost:3000/api/schedule?trainerId=1&sportId=3');

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(
      body.data.every((slot: { trainerId: number; sportId: number }) => slot.trainerId === 1),
    ).toBe(true);
    expect(
      body.data.every((slot: { trainerId: number; sportId: number }) => slot.sportId === 3),
    ).toBe(true);
    expect(
      body.data.every(
        (slot: { availableSpots: number; bookedCount: number; capacity: number }) =>
          slot.availableSpots === slot.capacity - slot.bookedCount && slot.availableSpots > 0,
      ),
    ).toBe(true);
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
