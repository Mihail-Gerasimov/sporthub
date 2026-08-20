// Диверсия слоёв: один и тот же сценарий на ОБЕИХ реализациях хранилища.
//
// Проверка устроена наоборот остальным. Она ничего не проверяет в бизнес-логике —
// она проверяет, что бизнес-логика не знает, где лежат данные. Если один и тот же
// сценарий проходит и на файлах, и на базе БЕЗ ЕДИНОЙ ПРАВКИ сервисов, значит слой
// данных действительно заменяем. Красный здесь означает, что подмена хранилища
// потребовала правки бизнес-кода, то есть главное обещание фазы не выполнено.
//
// Прежняя форма подменяла файловое хранилище заглушкой в памяти. Она доказывала
// меньше: заглушка наследовала тот же класс и повторяла его семантику. Настоящая
// вторая реализация — с внешними ключами, транзакциями базы и собственным
// порядком выдачи — проверяет границу честнее.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Test } from '@nestjs/testing';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { BookingService } from '../bookings/booking.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import { PublicationService } from '../publications/publication.service';
import { SlotContextService } from '../schedule/slot-context.service';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import { COLLECTIONS } from '../test/harness';
import { StorageModule } from './storage.module';

const CLUB = {
  name: 'Клуб диверсии',
  slug: 'club-diversion',
  slugNormalized: 'club-diversion',
  description: 'Описание',
  shortDescription: 'Описание',
  city: 'Самара',
  address: 'Ленина 1',
  phone: '+7 (900) 000-00-00',
  coordinates: { lat: 0, lng: 0 },
  managedByUserId: 2,
  sportIds: [3],
  tagIds: [],
  amenityIds: [],
  imageUrls: [],
  rating: 0,
  reviewCount: 0,
  priceFrom: 500,
  source: 'provider',
  status: 'published',
};

const OFFERING = {
  sportId: 3,
  title: 'Занятия',
  description: 'Описание',
  format: 'group',
  price: 500,
  durationMinutes: 60,
  capacity: 10,
  address: 'Ленина 1',
  coordinates: { lat: 0, lng: 0 },
};

const SLOT = {
  sportId: 3,
  title: 'Слот',
  date: '2026-05-01',
  startTime: '10:00',
  endTime: '11:00',
  durationMinutes: 60,
  level: 'all_levels',
  capacity: 5,
  bookedCount: 0,
  price: 500,
};

const ATHLETE = {
  id: 1,
  createdAt: '2026-01-01T00:00:00.000Z',
  role: 'athlete',
  status: 'active',
  name: 'Атлет',
  email: 'diversion@test.local',
  phone: '+7 (900) 000-00-00',
  passwordHash: 'хеш-заглушка',
  favoriteClubIds: [],
};

const SPORT = {
  id: 3,
  createdAt: '2026-01-01T00:00:00.000Z',
  name: 'Плавание',
  slug: 'swimming',
  description: '',
  icon: '',
  imageUrl: '',
  isPopular: false,
};

async function buildModule() {
  return Test.createTestingModule({
    imports: [StorageModule],
    providers: [
      AccessService,
      SlotContextService,
      NotificationService,
      LogService,
      BookingService,
      PublicationService,
    ],
  }).compile();
}

describe('Диверсия слоёв: один сценарий на двух хранилищах', () => {
  let cleanup: () => Promise<void>;

  afterEach(async () => {
    await cleanup?.();
  });

  /** Публикация клуба со слотом и запись на него — общий сценарий обеих реализаций. */
  async function runScenario(): Promise<void> {
    const moduleRef = await buildModule();
    const publications = moduleRef.get(PublicationService);
    const bookings = moduleRef.get(BookingService);

    const created = await publications.createClub({
      club: CLUB as never,
      offering: OFFERING as never,
      slots: [SLOT as never],
    });

    // Проверяется свойство, а не число: номер выдаёт хранилище, и у базы это
    // последовательность, а не «максимальный плюс один».
    expect(created.club.id).toBeGreaterThan(0);
    expect(created.schedules).toHaveLength(1);

    const booking = await bookings.create({
      scheduleId: created.schedules[0].id,
      userId: ATHLETE.id,
    });

    expect(booking.status).toBe('pending');
    expect(booking.scheduleId).toBe(created.schedules[0].id);

    await moduleRef.close();
  }

  it('на файловом хранилище', async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-diversion-'));
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    process.env.SPORT_HUB_STORAGE = 'files';

    for (const name of COLLECTIONS) {
      await writeFile(path.join(dataDirectory, `${name}.json`), '[]\n', 'utf8');
    }

    await writeFile(
      path.join(dataDirectory, 'users.json'),
      `${JSON.stringify([ATHLETE], null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(dataDirectory, 'sports.json'),
      `${JSON.stringify([SPORT], null, 2)}\n`,
      'utf8',
    );

    cleanup = async () => {
      delete process.env.SPORT_HUB_DATA_DIRECTORY;
      delete process.env.SPORT_HUB_STORAGE;
      await rm(dataDirectory, { force: true, recursive: true });
    };

    await runScenario();
  });

  it('на базе — тем же кодом сервисов', async () => {
    await ensureTestSchema();

    const db: TestDatabase = await createTestDatabase();
    await db.truncateAll();

    // Приложение читает адрес базы из окружения — направляем его в схему прогона.
    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl();
    process.env.SPORT_HUB_STORAGE = 'database';

    await db.prisma.sport.create({
      data: {
        id: SPORT.id,
        name: SPORT.name,
        slug: SPORT.slug,
        description: '',
        icon: '',
        imageUrl: '',
        isPopular: false,
      },
    });
    await db.prisma.user.create({
      data: {
        id: ATHLETE.id,
        name: ATHLETE.name,
        email: ATHLETE.email,
        phone: ATHLETE.phone,
        passwordHash: ATHLETE.passwordHash,
        role: 'athlete',
        status: 'active',
      },
    });
    // Владелец публикации: на него ссылается `managedByUserId`.
    await db.prisma.user.create({
      data: {
        id: CLUB.managedByUserId,
        name: 'Провайдер',
        email: 'provider-diversion@test.local',
        phone: '+7 (900) 000-00-01',
        passwordHash: 'хеш-заглушка',
        role: 'club_owner',
        status: 'active',
      },
    });

    cleanup = async () => {
      delete process.env.SPORT_HUB_STORAGE;

      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;

      await db.close();
    };

    await runScenario();
  }, 120_000);
});
