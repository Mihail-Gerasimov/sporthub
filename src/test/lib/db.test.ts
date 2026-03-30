import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  getClubBySlug,
  getClubOfferings,
  getOfferings,
  getSchedule,
  getScheduleById,
  getScheduleSlotContext,
  getTrainerById,
  getTrainerBySlug,
  getTrainerOfferings,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db abstraction', () => {
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

  it('читает offerings и разделяет услуги клубов и тренеров', async () => {
    const offerings = await getOfferings();
    const clubOfferings = await getClubOfferings(1);
    const trainerOfferings = await getTrainerOfferings(1);

    expect(offerings.some((offering) => offering.ownerType === 'club')).toBe(true);
    expect(offerings.some((offering) => offering.ownerType === 'trainer')).toBe(true);
    expect(clubOfferings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerType: 'club', ownerId: 1 })]),
    );
    expect(trainerOfferings).toEqual(
      expect.arrayContaining([expect.objectContaining({ ownerType: 'trainer', ownerId: 1 })]),
    );
  });

  it('возвращает профиль тренера с независимыми адресом, координатами и sportIds', async () => {
    const trainer = await getTrainerById(1);

    expect(trainer).toMatchObject({
      id: 1,
      sportIds: [3],
      city: 'Самара',
      address: 'ул. Лесная, 23к1',
      coordinates: {
        lat: 53.2129,
        lng: 50.1245,
      },
    });
  });

  it('находит клуба и тренера по slug', async () => {
    const club = await getClubBySlug('volna-aquatic-club');
    const trainer = await getTrainerBySlug('marina-sokolova');

    expect(club).toMatchObject({
      id: 1,
      slug: 'volna-aquatic-club',
      name: 'Volna Aquatic Club',
    });
    expect(trainer).toMatchObject({
      id: 1,
      slug: 'marina-sokolova',
      name: 'Марина Соколова',
    });
  });

  it('возвращает null для несуществующего slug', async () => {
    await expect(getClubBySlug('missing-club')).resolves.toBeNull();
    await expect(getTrainerBySlug('missing-trainer')).resolves.toBeNull();
  });

  it('по умолчанию возвращает только club schedule, а trainer slots доступны отдельным режимом', async () => {
    const defaultSchedule = await getSchedule();
    const trainerSchedule = await getSchedule({ ownerType: 'trainer' });

    expect(defaultSchedule.length).toBeGreaterThan(0);
    expect(defaultSchedule.every((slot) => slot.ownerType === 'club')).toBe(true);
    expect(trainerSchedule.length).toBeGreaterThan(0);
    expect(trainerSchedule.every((slot) => slot.ownerType === 'trainer')).toBe(true);
    expect(trainerSchedule).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 1001,
          offeringId: 101,
          ownerType: 'trainer',
          trainerId: 1,
        }),
      ]),
    );
  });

  it('резолвит slot context с offering и owner metadata для trainer услуги', async () => {
    const slot = await getScheduleById(1001);
    const slotContext = await getScheduleSlotContext(1001);

    expect(slot).toMatchObject({
      id: 1001,
      offeringId: 101,
      ownerType: 'trainer',
      ownerId: 1,
      trainerId: 1,
      clubId: undefined,
      affiliatedClubId: 1,
    });
    expect(slotContext).toMatchObject({
      schedule: expect.objectContaining({
        id: 1001,
        offeringId: 101,
      }),
      offering: expect.objectContaining({
        id: 101,
        ownerType: 'trainer',
        ownerId: 1,
        format: 'personal',
      }),
      trainer: expect.objectContaining({
        id: 1,
        name: 'Марина Соколова',
      }),
      affiliatedClub: expect.objectContaining({
        id: 1,
        name: 'Volna Aquatic Club',
      }),
    });
  });
});
