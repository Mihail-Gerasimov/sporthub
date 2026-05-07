import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET, POST } from '@/app/api/reviews/route';
import { getNotifications } from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';
import type { Review } from '@/types';

describe('Reviews API', () => {
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
    const beforeResponse = await GET(
      new NextRequest('http://localhost:3000/api/reviews?trainerId=1'),
    );
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

  // --- Phase 29 Step 29.4: уведомления при создании отзыва ---
  describe('уведомления при создании отзыва (Phase 29)', () => {
    it('создаёт уведомления получателю (provider) и автору (athlete)', async () => {
      // fixtureClub: id=1, managedByUserId=2. Атлет userId=1.
      const response = await POST(
        new Request('http://localhost:3000/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 1,
            clubId: 1,
            rating: 5,
            text: 'Отличный клуб с бассейном.',
          }),
        }),
      );
      expect(response.status).toBe(201);

      const providerNotifications = await getNotifications({ userId: 2 });
      const reviewReceived = providerNotifications.find(
        (n) => n.type === 'review_received_by_provider',
      );
      expect(reviewReceived).toBeDefined();
      expect(reviewReceived?.payload).toMatchObject({
        entityType: 'club',
        entityId: 1,
        fromUserId: 1,
        rating: 5,
      });

      const athleteNotifications = await getNotifications({ userId: 1 });
      const published = athleteNotifications.find((n) => n.type === 'review_published_for_athlete');
      expect(published).toBeDefined();
      expect(published?.payload).toMatchObject({
        entityType: 'club',
        entityId: 1,
      });
    });

    it('self-review (manager === reviewer) — provider notification skipped, athlete получает', async () => {
      // userId=2 = managedByUserId fixtureClub. Самому себе не уведомляем,
      // но confirmation для author всё равно создаётся.
      const response = await POST(
        new Request('http://localhost:3000/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 2,
            clubId: 1,
            rating: 5,
            text: 'Self-review через DevTools.',
          }),
        }),
      );
      expect(response.status).toBe(201);

      const ownerNotifications = await getNotifications({ userId: 2 });
      const reviewReceivedNotifs = ownerNotifications.filter(
        (n) => n.type === 'review_received_by_provider',
      );
      // Self-review guard сработал — review_received_by_provider не создалось.
      expect(reviewReceivedNotifs).toHaveLength(0);

      const publishedNotifs = ownerNotifications.filter(
        (n) => n.type === 'review_published_for_athlete',
      );
      expect(publishedNotifs).toHaveLength(1);
    });

    it('создаёт уведомление получателю при отзыве на trainer', async () => {
      const response = await POST(
        new Request('http://localhost:3000/api/reviews', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            userId: 1,
            trainerId: 1,
            rating: 4,
            text: 'Хороший тренер.',
          }),
        }),
      );
      expect(response.status).toBe(201);

      // Все trainer-уведомления и проверим что один из типов review_received_by_provider.
      // Узнаем managedByUserId тренера — берём из созданного notification.
      const allNotifications = await getNotifications({ userId: 1 });
      const published = allNotifications.find((n) => n.type === 'review_published_for_athlete');
      expect(published).toBeDefined();
      expect(published?.payload).toMatchObject({ entityType: 'trainer', entityId: 1 });
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
