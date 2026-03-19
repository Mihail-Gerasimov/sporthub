import { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { GET as GETTrainerDetail } from '@/app/api/trainers/[id]/route';
import { GET as GETTrainers } from '@/app/api/trainers/route';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';

describe('Trainers API', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('GET /api/trainers фильтрует тренеров по venue affiliatedClubId и sportId', async () => {
    const response = await GETTrainers(
      new NextRequest('http://localhost:3000/api/trainers?affiliatedClubId=1&sportId=3'),
    );
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.success).toBe(true);
    expect(body.data.length).toBeGreaterThan(0);
    expect(
      body.data.every((trainer: { id: number; sportIds: number[] }) => trainer.sportIds.includes(3)),
    ).toBe(true);
    expect(body.data[0]).toMatchObject({
      id: 1,
      slug: 'marina-sokolova',
    });
  });

  it('GET /api/trainers/[id] возвращает независимую карточку тренера с offerings, trainer slots и отзывами', async () => {
    const response = await GETTrainerDetail(new Request('http://localhost:3000/api/trainers/1'), {
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
      affiliatedClub: {
        id: 1,
        slug: 'volna-aquatic-club',
      },
    });
    expect(body.data.sports).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: 3, slug: 'swimming' })]),
    );
    expect(body.data.offerings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 101,
          ownerType: 'trainer',
          ownerId: 1,
          format: 'personal',
        }),
      ]),
    );
    expect(body.data.schedule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1001,
          offeringId: 101,
          ownerType: 'trainer',
          ownerId: 1,
          trainerId: 1,
        }),
      ]),
    );
    expect(
      body.data.schedule.every(
        (slot: { ownerType: string; trainerId?: number }) =>
          slot.ownerType === 'trainer' && slot.trainerId === 1,
      ),
    ).toBe(true);
    expect(body.data.reviews.length).toBeGreaterThan(0);
  });
});
