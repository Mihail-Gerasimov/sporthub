import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/trainers/[id]/route';

describe('GET /api/trainers/[id]', () => {
  it('возвращает детальную карточку тренера со связанными данными', async () => {
    const response = await GET(new Request('http://localhost:3000/api/trainers/1'), {
      params: Promise.resolve({ id: '1' }),
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toMatchObject({
      trainer: {
        id: 1,
        slug: 'marina-sokolova',
      },
      club: {
        id: 1,
        slug: 'volna-aquatic-club',
      },
      sport: {
        id: 3,
        slug: 'swimming',
      },
    });
    expect(body.data.schedule.length).toBeGreaterThan(0);
    expect(body.data.reviews.length).toBeGreaterThan(0);
  });
});
