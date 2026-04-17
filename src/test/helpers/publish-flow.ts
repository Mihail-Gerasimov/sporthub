import { writeFile } from 'node:fs/promises';
import path from 'node:path';

import { mapClubFormToEntities } from '@/lib/contracts/publish-club';
import { mapTrainerFormToEntities } from '@/lib/contracts/publish-trainer';
import {
  createClubPublication,
  createTrainerPublication,
  type ClubPublicationResult,
  type TrainerPublicationResult,
} from '@/lib/db';
import { getDateKeyInTimeZone } from '@/lib/utils';

const PROVIDER_USER_ID = 2;

type PublishCatalogPairOptions = {
  dataDirectory: string;
  clearExisting?: boolean;
  targetDate?: string;
};

type PublishCatalogPairResult = {
  clubResult: ClubPublicationResult;
  trainerResult: TrainerPublicationResult;
  targetDate: string;
};

async function writeCollection(
  dataDirectory: string,
  filename: string,
  data: unknown,
): Promise<void> {
  await writeFile(path.join(dataDirectory, filename), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
}

export async function clearCatalogCollections(dataDirectory: string): Promise<void> {
  await Promise.all([
    writeCollection(dataDirectory, 'bookings.json', []),
    writeCollection(dataDirectory, 'clubs.json', []),
    writeCollection(dataDirectory, 'offerings.json', []),
    writeCollection(dataDirectory, 'reviews.json', []),
    writeCollection(dataDirectory, 'schedule.json', []),
    writeCollection(dataDirectory, 'trainers.json', []),
  ]);
}

export async function publishCatalogPair({
  clearExisting = false,
  dataDirectory,
  targetDate = getDateKeyInTimeZone(),
}: PublishCatalogPairOptions): Promise<PublishCatalogPairResult> {
  if (clearExisting) {
    await clearCatalogCollections(dataDirectory);
  }

  const clubResult = await createClubPublication(
    mapClubFormToEntities(
      {
        name: 'Start Swim Lab',
        city: 'Самара',
        address: 'ул. Ново-Садовая, 101',
        description:
          'Новый клуб для тех, кто хочет быстро выйти в воду, собрать первую группу и начать регулярные тренировки без лишней бюрократии и декоративных заглушек.',
        phone: '+7 (846) 300-00-11',
        email: 'hello@startswim.ru',
        priceFrom: '1500',
        sportIds: [3],
        tagIds: [1, 2],
        amenityIds: [1, 2],
        vk: '',
        telegram: '',
        facebook: '',
        scheduleSlots: [
          {
            title: 'Стартовая группа по плаванию',
            date: targetDate,
            startTime: '07:30',
            endTime: '08:30',
            price: '1350',
            capacity: '10',
            location: 'Бассейн A',
            discipline: 'Плавание',
          },
        ],
      },
      PROVIDER_USER_ID,
    ),
  );

  const trainerResult = await createTrainerPublication(
    mapTrainerFormToEntities(
      {
        firstName: 'Ilya',
        lastName: 'Volkov',
        city: 'Самара',
        address: clubResult.club.address,
        bio: 'Тренер по плаванию, который помогает быстро собрать технику, вернуть уверенность в воде и перейти от редких посещений к стабильному персональному режиму.',
        experience: '6',
        sportIds: [3],
        specialtyIds: [1, 2],
        workFormatIds: [1],
        phone: '+7 (846) 300-00-22',
        vk: '',
        telegram: '',
        facebook: '',
        offeringName: 'Персональная тренировка по плаванию',
        offeringDescription:
          'Индивидуальная сессия с фокусом на технику, дыхание и разбор ошибок по каждому отрезку.',
        offeringFormat: 'Индивидуальная',
        offeringPrice: '2300',
        offeringDuration: '60',
        offeringLocation: 'Бассейн A',
        clubId: clubResult.club.id,
        scheduleSlots: [
          {
            title: 'Персональная дорожка',
            date: targetDate,
            startTime: '09:00',
            endTime: '10:00',
            price: '2300',
            capacity: '1',
            location: 'Бассейн A',
            discipline: 'Плавание',
          },
        ],
      },
      PROVIDER_USER_ID,
    ),
  );

  return {
    clubResult,
    trainerResult,
    targetDate,
  };
}
