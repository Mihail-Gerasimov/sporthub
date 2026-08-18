import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/sports/route';

describe('GET /api/sports', () => {
  it('возвращает успешный ответ со списком видов спорта', async () => {
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(Array.isArray(body.data)).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          slug: 'yoga',
          name: 'Йога',
        }),
      ]),
    );
  });
});
