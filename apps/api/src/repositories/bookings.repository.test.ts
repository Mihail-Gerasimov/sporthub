// Тесты репозитория записей. Проверяем только доступ к данным: фильтры,
// точечные правки, каскадное удаление. Правила переходов сюда не входят —
// они чистые и живут в @sporthub/domain со своими тестами.

import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { Booking } from '@sporthub/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import { JsonBookingsRepository } from './bookings.repository';

describe('BookingsRepository', () => {
  let dataDirectory: string;
  let bookings: JsonBookingsRepository;

  const base: Omit<Booking, 'id' | 'createdAt'> = {
    scheduleId: 1001,
    userId: 1,
    sportId: 1,
    date: '2026-03-20',
    status: 'pending',
    paymentStatus: 'unpaid',
    totalPrice: 1000,
  };

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-bookings-'));
    await writeFile(path.join(dataDirectory, 'bookings.json'), '[]\n', 'utf8');
    bookings = new JsonBookingsRepository(new JsonStorage(dataDirectory));
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  it('фильтрует по пользователю, слоту и статусу', async () => {
    await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2, status: 'confirmed' });
    await bookings.insert({ ...base, scheduleId: 2002, status: 'completed' });

    expect(await bookings.findMany({ userId: 1 })).toHaveLength(2);
    expect(await bookings.findMany({ scheduleId: 1001 })).toHaveLength(2);
    expect(await bookings.findMany({ status: 'pending' })).toHaveLength(1);
  });

  it('фильтр по набору статусов принимает массив', async () => {
    await bookings.insert({ ...base });
    await bookings.insert({ ...base, status: 'confirmed' });
    await bookings.insert({ ...base, status: 'completed' });

    const active = await bookings.findMany({ status: ['pending', 'confirmed'] });

    expect(active).toHaveLength(2);
  });

  it('правка несуществующей записи бросает дословный текст', async () => {
    await expect(bookings.update(999, { status: 'confirmed' })).rejects.toThrow(
      'Запись не найдена',
    );
  });

  it('перенос даты слота меняет даты его записей и считает затронутые', async () => {
    await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2 });
    await bookings.insert({ ...base, scheduleId: 2002 });

    const updated = await bookings.updateDateByScheduleId(1001, '2026-04-01');

    expect(updated).toBe(2);
    const moved = await bookings.findMany({ scheduleId: 1001 });
    expect(moved.every((booking) => booking.date === '2026-04-01')).toBe(true);
    const untouched = await bookings.findMany({ scheduleId: 2002 });
    expect(untouched[0].date).toBe('2026-03-20');
  });

  it('перенос на ту же дату не трогает файл', async () => {
    await bookings.insert({ ...base });
    const filePath = path.join(dataDirectory, 'bookings.json');
    const before = await readFile(filePath, 'utf8');

    const updated = await bookings.updateDateByScheduleId(1001, '2026-03-20');

    expect(updated).toBe(0);
    expect(await readFile(filePath, 'utf8')).toBe(before);
  });

  it('каскадное удаление забирает записи только своего владельца', async () => {
    await bookings.insert({ ...base, clubId: 1 });
    await bookings.insert({ ...base, clubId: 1 });
    await bookings.insert({ ...base, trainerId: 5 });

    const removed = await bookings.removeMany({ clubId: 1 });

    expect(removed).toBe(2);
    expect(await bookings.findAll()).toHaveLength(1);
  });

  it('точечное удаление убирает одну запись', async () => {
    const created = await bookings.insert({ ...base });
    await bookings.insert({ ...base, userId: 2 });

    await bookings.remove(created.id);

    expect(await bookings.findById(created.id)).toBeNull();
    expect(await bookings.findAll()).toHaveLength(1);
  });
});
