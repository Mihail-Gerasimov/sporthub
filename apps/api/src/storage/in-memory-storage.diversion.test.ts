// Диверсия слоёв: подмена хранилища реализацией в памяти.
//
// Сервисы не должны знать, где лежат данные. Проверка устроена наоборот
// остальным: если этот набор проходит без единой правки самих сервисов,
// слой данных действительно заменяем — а значит переход на базу не заденет
// бизнес-логику. Красный здесь означает провал, а не успех.

import { Test } from '@nestjs/testing';
import { describe, expect, it } from 'vitest';

import { AccessService } from '../access/access.service';
import { BookingService } from '../bookings/booking.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import { PublicationService } from '../publications/publication.service';
import { SlotContextService } from '../schedule/slot-context.service';
import { StorageModule } from './storage.module';
import { JsonStorage, type CollectionKey, type DataCollectionMap } from './json-storage';

/**
 * Хранилище в памяти. Наследует настоящее, но подменяет чтение и запись:
 * файловой системы здесь нет вовсе.
 */
class InMemoryStorage extends JsonStorage {
  private readonly collections = new Map<CollectionKey, unknown>();

  constructor() {
    super('/несуществующая-директория');
  }

  override async read<Key extends CollectionKey>(key: Key): Promise<DataCollectionMap[Key]> {
    return (this.collections.get(key) ?? []) as DataCollectionMap[Key];
  }

  override async write<Key extends CollectionKey>(
    key: Key,
    data: DataCollectionMap[Key],
  ): Promise<void> {
    this.collections.set(key, data);
  }
}

describe('Диверсия слоёв: хранилище в памяти', () => {
  it('сервисы работают на другом хранилище без единой правки', async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [StorageModule],
      providers: [
        AccessService,
        SlotContextService,
        NotificationService,
        LogService,
        BookingService,
        PublicationService,
      ],
    })
      // Подменяется ровно одна вещь — само хранилище.
      .overrideProvider(JsonStorage)
      .useClass(InMemoryStorage)
      .compile();

    const publications = moduleRef.get(PublicationService);
    const bookings = moduleRef.get(BookingService);

    const created = await publications.createClub({
      club: {
        name: 'Клуб в памяти',
        slug: 'club-in-memory',
        managedByUserId: 2,
        sportIds: [3],
        tagIds: [],
        amenityIds: [],
        imageUrls: [],
        rating: 0,
        reviewCount: 0,
        priceFrom: 500,
        status: 'published',
      } as never,
      offering: { sportId: 3, title: 'Занятия', price: 500, capacity: 10 } as never,
      slots: [
        {
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
        } as never,
      ],
    });

    expect(created.club.id).toBe(1);
    expect(created.schedules).toHaveLength(1);

    // Запись на созданный слот проходит тот же путь, что и на файловом хранилище.
    const storage = moduleRef.get(JsonStorage);
    await storage.write('users', [
      {
        id: 1,
        createdAt: '2026-01-01T00:00:00.000Z',
        role: 'athlete',
        name: 'Атлет',
        email: 'a@test.local',
        phone: '+7 (900) 000-00-00',
        password: 'demo123',
        favoriteClubIds: [],
      },
    ] as never);

    const booking = await bookings.create({
      scheduleId: created.schedules[0].id,
      userId: 1,
    });

    expect(booking.status).toBe('pending');

    const slots = await storage.read('schedule');
    expect(slots[0].bookedCount).toBe(1);
  });
});
