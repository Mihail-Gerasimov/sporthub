import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';

import { GET } from '@/app/api/clubs/route';

describe('GET /api/clubs', () => {
  it('фильтрует клубы по sportId, search и minRating', async () => {
    const request = new NextRequest(
      'http://localhost:3000/api/clubs?sportId=1&search=%D0%B9%D0%BE%D0%B3%D0%B0&minRating=4.8',
    );

    const response = await GET(request);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data).toHaveLength(1);
    expect(body.data[0]).toMatchObject({
      id: 3,
      slug: 'balance-yoga-house',
      city: 'Самара',
    });
  });
});
