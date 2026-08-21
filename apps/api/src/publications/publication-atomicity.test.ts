// Атомарность публикации: клуб, услуга и слоты появляются вместе или не появляются вовсе.
//
// Это обещание записано в самом сервисе — `createClub` оборачивает три вставки
// в транзакцию, — но до сих пор его не проверял никто. Диверсия это показала:
// обёртку можно было убрать целиком, и весь набор бэкенда оставался зелёным.
// Цена такой дыры видна не сразу: сбой на третьей вставке оставляет клуб без
// основной услуги, а такую публикацию нельзя ни показать, ни забронировать —
// она просто висит в каталоге битой карточкой, и никто не знает, откуда взялась.
//
// ⚠️ Сбой вызывается РАЗНЫМИ способами на разных хранилищах, и иначе не выйдет:
// у базы есть ограничения целостности, у файлов их нет вовсе. Поэтому базе даются
// данные, которые проходят вход, но отбиваются проверкой `schedule_time_order`
// на третьем шаге, а файлам — сбой самой записи на диск (единственный отказ,
// который у файлового хранилища вообще бывает посреди работы). Проверяемое
// свойство при этом ОДНО И ТО ЖЕ: после отказа в хранилище пусто.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { Test, type TestingModule } from '@nestjs/testing';
import { afterEach, describe, expect, it } from 'vitest';

import { BookingService } from '../bookings/booking.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import type { OfferingsRepository } from '../repositories/catalog.repository';
import { OFFERINGS_REPOSITORY } from '../repositories/catalog.repository';
import type { ClubsRepository, ScheduleRepository } from '../repositories/entities.repository';
import { CLUBS_REPOSITORY, SCHEDULE_REPOSITORY } from '../repositories/entities.repository';
import { SlotContextService } from '../schedule/slot-context.service';
import { JsonStorage } from '../storage/json-storage';
import { StorageModule } from '../storage/storage.module';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import { COLLECTIONS } from '../test/harness';
import { PublicationService } from './publication.service';

/** Владелец публикации: на него ссылается `managedByUserId` клуба. */
const PROVIDER = {
  id: 2,
  name: 'Провайдер',
  email: 'atomicity-provider@test.local',
  phone: '+7 (900) 000-00-01',
  passwordHash: 'хеш-заглушка',
};

const SPORT = { id: 3, name: 'Плавание', slug: 'swimming' };

const CLUB = {
  name: 'Клуб атомарности',
  slug: 'club-atomicity',
  slugNormalized: 'club-atomicity',
  description: 'Описание',
  shortDescription: 'Описание',
  city: 'Самара',
  address: 'Ленина 1',
  phone: '+7 (900) 000-00-00',
  coordinates: { lat: 0, lng: 0 },
  managedByUserId: PROVIDER.id,
  sportIds: [SPORT.id],
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
  sportId: SPORT.id,
  title: 'Занятия',
  description: 'Описание',
  format: 'group',
  price: 500,
  durationMinutes: 60,
  capacity: 10,
  address: 'Ленина 1',
  coordinates: { lat: 0, lng: 0 },
};

/** Исправный слот: им пользуется файловый прогон, там сбой приходит с диска. */
const SLOT = {
  sportId: SPORT.id,
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

/**
 * Слот, который проходит вход, но не проходит базу: конец занятия раньше начала.
 * Проверку `schedule_time_order` он нарушает на ТРЕТЬЕМ шаге публикации — когда
 * клуб и услуга уже вставлены. Ровно то место, где половинчатый результат и виден.
 */
const SLOT_REJECTED_BY_DATABASE = { ...SLOT, startTime: '11:00', endTime: '10:00' };

async function buildModule(): Promise<TestingModule> {
  return Test.createTestingModule({
    imports: [StorageModule],
    providers: [
      SlotContextService,
      NotificationService,
      LogService,
      BookingService,
      PublicationService,
    ],
  }).compile();
}

/** Единственное, что проверяется после отказа: в хранилище не осталось ничего. */
async function expectNothingPublished(moduleRef: TestingModule): Promise<void> {
  const clubs = moduleRef.get<ClubsRepository>(CLUBS_REPOSITORY);
  const offerings = moduleRef.get<OfferingsRepository>(OFFERINGS_REPOSITORY);
  const schedule = moduleRef.get<ScheduleRepository>(SCHEDULE_REPOSITORY);

  expect(await clubs.findAll(), 'клуб остался без услуги — публикация половинчатая').toHaveLength(
    0,
  );
  expect(await offerings.findAll(), 'услуга осталась без клуба').toHaveLength(0);
  expect(await schedule.findMany({ ownerType: 'all' }), 'слот остался без публикации').toHaveLength(
    0,
  );
}

describe('Атомарность публикации клуба', () => {
  let cleanup: (() => Promise<void>) | undefined;

  afterEach(async () => {
    await cleanup?.();
    cleanup = undefined;
  });

  it('на файловом хранилище: сбой записи расписания не оставляет ни клуба, ни услуги', async () => {
    const dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-atomicity-'));
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
    process.env.SPORT_HUB_STORAGE = 'files';

    for (const name of COLLECTIONS) {
      await writeFile(path.join(dataDirectory, `${name}.json`), '[]\n', 'utf8');
    }

    const moduleRef = await buildModule();

    cleanup = async () => {
      await moduleRef.close();
      delete process.env.SPORT_HUB_DATA_DIRECTORY;
      delete process.env.SPORT_HUB_STORAGE;
      await rm(dataDirectory, { force: true, recursive: true });
    };

    const storage = moduleRef.get(JsonStorage);

    // Диск отказывает на записи расписания — то есть после того, как клуб и услуга
    // уже отданы хранилищу. Хук для этого и заведён в самой реализации.
    storage.setWriteFailureHookForTests((collection) => {
      if (collection === 'schedule') throw new Error('Сбой записи на диск');
    });

    await expect(
      moduleRef.get(PublicationService).createClub({
        club: CLUB as never,
        offering: OFFERING as never,
        slots: [SLOT as never],
      }),
    ).rejects.toThrow('Сбой записи на диск');

    storage.setWriteFailureHookForTests(null);

    await expectNothingPublished(moduleRef);
  });

  it('на базе: слот, отбитый ограничением, не оставляет ни клуба, ни услуги', async () => {
    await ensureTestSchema();

    const db: TestDatabase = await createTestDatabase();
    await db.truncateAll();

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
        id: PROVIDER.id,
        name: PROVIDER.name,
        email: PROVIDER.email,
        phone: PROVIDER.phone,
        passwordHash: PROVIDER.passwordHash,
        role: 'club_owner',
        status: 'active',
      },
    });

    const moduleRef = await buildModule();

    cleanup = async () => {
      await moduleRef.close();
      delete process.env.SPORT_HUB_STORAGE;

      if (previousUrl === undefined) delete process.env.DATABASE_URL;
      else process.env.DATABASE_URL = previousUrl;

      await db.close();
    };

    await expect(
      moduleRef.get(PublicationService).createClub({
        club: CLUB as never,
        offering: OFFERING as never,
        slots: [SLOT_REJECTED_BY_DATABASE as never],
      }),
    ).rejects.toThrow(/schedule_time_order/);

    await expectNothingPublished(moduleRef);
  }, 120_000);
});
