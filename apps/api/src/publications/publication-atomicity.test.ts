// Атомарность публикации: клуб, услуга и слоты появляются вместе или не появляются вовсе.
//
// Это обещание записано в самом сервисе — `createClub` оборачивает три вставки
// в транзакцию, — но до сих пор его не проверял никто. Диверсия это показала:
// обёртку можно было убрать целиком, и весь набор бэкенда оставался зелёным.
// Цена такой дыры видна не сразу: сбой на третьей вставке оставляет клуб без
// основной услуги, а такую публикацию нельзя ни показать, ни забронировать —
// она просто висит в каталоге битой карточкой, и никто не знает, откуда взялась.
//
// ⚠️ Сбой вызывается ограничением целостности самой базы: слот, у которого конец
// занятия раньше начала, проходит вход, но отбивается проверкой `schedule_time_order`
// на третьем шаге публикации — когда клуб и услуга уже вставлены. Проверяемое
// свойство: после отказа в хранилище пусто.
//
// Прежде рядом жил близнец на файловом хранилище: там отказ подавался хуком сбоя
// записи на диск (`setWriteFailureHookForTests`) — единственным, который у файлов
// бывает посреди работы. Он снят вместе с самим файловым хранилищем в фазе 34:
// проверял он ровно то же свойство тем же `expectNothingPublished`, и хука, на
// котором он держался, в базе нет и быть не может.

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
import { StorageModule } from '../storage/storage.module';
import { createTestDatabase, testDatabaseUrl, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
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

/** Исправный слот: от него отличается ровно одним — порядком времени — тот, что базу не проходит. */
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

  it('слот, отбитый ограничением базы, не оставляет ни клуба, ни услуги', async () => {
    await ensureTestSchema();

    const db: TestDatabase = await createTestDatabase();
    await db.truncateAll();

    const previousUrl = process.env.DATABASE_URL;
    process.env.DATABASE_URL = testDatabaseUrl();

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
        status: 'active',
      },
    });

    const moduleRef = await buildModule();

    cleanup = async () => {
      await moduleRef.close();

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
