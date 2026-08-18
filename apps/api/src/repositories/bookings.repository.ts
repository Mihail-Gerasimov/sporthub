// Репозиторий записей на тренировки.
//
// Здесь только доступ к данным. Правила переходов живут в `@sporthub/domain`
// (чистые функции), а оркестрация — проверки, пересчёт мест, уведомления —
// в сервисе. Такое разделение и есть смысл фазы: репозиторий подменяется
// на Prisma-версию, а правила и сервис не трогаются.

import type { Booking, BookingStatus } from '@sporthub/types';

import type { JsonStorage } from '../storage/json-storage';

export const BOOKINGS_REPOSITORY = Symbol('BOOKINGS_REPOSITORY');

export interface BookingsRepository {
  findAll(): Promise<Booking[]>;
  findById(id: number): Promise<Booking | null>;
  findMany(filter: {
    userId?: number;
    scheduleId?: number;
    status?: BookingStatus | BookingStatus[];
  }): Promise<Booking[]>;
  insert(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking>;
  update(id: number, patch: Partial<Booking>): Promise<Booking>;
  /** Перенос даты слота тянет за собой даты его записей. */
  updateDateByScheduleId(scheduleId: number, date: string): Promise<number>;
  remove(id: number): Promise<void>;
  removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number>;
}

export class JsonBookingsRepository implements BookingsRepository {
  constructor(private readonly storage: JsonStorage) {}

  findAll(): Promise<Booking[]> {
    return this.storage.read('bookings');
  }

  async findById(id: number): Promise<Booking | null> {
    const bookings = await this.storage.read('bookings');

    return bookings.find((booking) => booking.id === id) ?? null;
  }

  async findMany(filter: {
    userId?: number;
    scheduleId?: number;
    status?: BookingStatus | BookingStatus[];
  }): Promise<Booking[]> {
    const bookings = await this.storage.read('bookings');
    const statuses =
      filter.status === undefined
        ? null
        : new Set(Array.isArray(filter.status) ? filter.status : [filter.status]);

    return bookings.filter((booking) => {
      if (filter.userId !== undefined && booking.userId !== filter.userId) return false;
      if (filter.scheduleId !== undefined && booking.scheduleId !== filter.scheduleId) return false;
      if (statuses !== null && !statuses.has(booking.status)) return false;

      return true;
    });
  }

  async insert(booking: Omit<Booking, 'id' | 'createdAt'>): Promise<Booking> {
    const bookings = await this.storage.read('bookings');
    const created: Booking = {
      id: this.storage.getNextEntityId(bookings),
      createdAt: new Date().toISOString(),
      ...booking,
    };

    await this.storage.write('bookings', [...bookings, created]);

    return created;
  }

  async update(id: number, patch: Partial<Booking>): Promise<Booking> {
    const bookings = await this.storage.read('bookings');
    const index = bookings.findIndex((booking) => booking.id === id);

    if (index === -1) {
      // Текст перенесён из db.ts дословно: роуты маппят его в 404.
      throw new Error('Запись не найдена');
    }

    const updated: Booking = { ...bookings[index], ...patch };
    const next = [...bookings];
    next[index] = updated;
    await this.storage.write('bookings', next);

    return updated;
  }

  async updateDateByScheduleId(scheduleId: number, date: string): Promise<number> {
    const bookings = await this.storage.read('bookings');
    let updatedCount = 0;

    const next = bookings.map((booking) => {
      if (booking.scheduleId !== scheduleId || booking.date === date) return booking;
      updatedCount += 1;

      return { ...booking, date };
    });

    if (updatedCount > 0) {
      await this.storage.write('bookings', next);
    }

    return updatedCount;
  }

  async remove(id: number): Promise<void> {
    const bookings = await this.storage.read('bookings');

    await this.storage.write(
      'bookings',
      bookings.filter((booking) => booking.id !== id),
    );
  }

  async removeMany(filter: { clubId?: number; trainerId?: number }): Promise<number> {
    const bookings = await this.storage.read('bookings');
    const kept = bookings.filter((booking) => {
      if (filter.clubId !== undefined && booking.clubId === filter.clubId) return false;
      if (filter.trainerId !== undefined && booking.trainerId === filter.trainerId) return false;

      return true;
    });

    await this.storage.write('bookings', kept);

    return bookings.length - kept.length;
  }
}
