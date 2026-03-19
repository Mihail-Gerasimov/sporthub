import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET, POST } from '@/app/api/reviews/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import type { Review } from '@/types';

describe('Reviews API', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('возвращает отзывы клуба по clubId', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/reviews?clubId=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data.every((review: { clubId?: number }) => review.clubId === 1)).toBe(true);
  });

  it('возвращает отзывы тренера по trainerId', async () => {
    const response = await GET(new NextRequest('http://localhost:3000/api/reviews?trainerId=1'));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(body.data[0]).toMatchObject({
      trainerId: 1,
      rating: 5,
    });
  });

  it('создаёт отзыв о тренере и сохраняет его в JSON', async () => {
    const beforeResponse = await GET(new NextRequest('http://localhost:3000/api/reviews?trainerId=1'));
    const beforeBody = await beforeResponse.json();

    const postResponse = await POST(
      new Request('http://localhost:3000/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 1,
          trainerId: 1,
          rating: 5,
          text: 'Персональная тренировка была собрана очень чётко и без лишней суеты.',
        }),
      }),
    );
    const postBody = await postResponse.json();

    expect(postResponse.status).toBe(201);
    expect(postBody.success).toBe(true);
    expect(postBody.data).toMatchObject({
      userId: 1,
      trainerId: 1,
      rating: 5,
    });

    const getResponse = await GET(new NextRequest('http://localhost:3000/api/reviews?trainerId=1'));
    const getBody = await getResponse.json();

    expect(getResponse.status).toBe(200);
    expect(getBody.success).toBe(true);
    expect(getBody.data).toHaveLength(beforeBody.data.length + 1);

    const reviewsPath = path.join(dataDirectory, 'reviews.json');
    const reviewsRaw = await readFile(reviewsPath, 'utf8');
    const reviews = JSON.parse(reviewsRaw) as Review[];

    expect(reviews.at(-1)).toMatchObject({
      userId: 1,
      trainerId: 1,
      rating: 5,
    });
  });

  it('не создаёт отзыв без target сущности', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 1,
          rating: 4,
          text: 'Текст есть, но целевая сущность не указана.',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'Нужно указать clubId или trainerId',
    });
  });

  it('не создаёт отзыв сразу и на клуб, и на тренера', async () => {
    const response = await POST(
      new Request('http://localhost:3000/api/reviews', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          userId: 1,
          clubId: 1,
          trainerId: 1,
          rating: 4,
          text: 'Две целевые сущности в одном отзыве не должны проходить.',
        }),
      }),
    );
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body).toEqual({
      success: false,
      error: 'Нужно указать либо clubId, либо trainerId',
    });
  });
});
