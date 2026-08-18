// Тесты репозиториев клубов, тренеров и расписания.
// Основной фокус — три «починки» данных, перенесённые из db.ts: поиск по
// кириллическому slug, восстановление sportIds у тренера и вывод владельца
// слота из связанной услуги. Именно они ломаются молча, если перенести неточно.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import {
  JsonClubsRepository,
  JsonScheduleRepository,
  JsonTrainersRepository,
  normalizeSlugLookupValue,
} from './entities.repository';

describe('Репозитории сущностей каталога', () => {
  let dataDirectory: string;
  let storage: JsonStorage;

  const writeCollection = async (file: string, data: unknown) => {
    await writeFile(path.join(dataDirectory, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
  };

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-entities-'));
    storage = new JsonStorage(dataDirectory);
    for (const file of ['clubs.json', 'trainers.json', 'schedule.json', 'offerings.json']) {
      await writeCollection(file, []);
    }
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe('нормализация slug', () => {
    it('снимает URI-кодирование, регистр и лишние пробелы', () => {
      expect(normalizeSlugLookupValue('  КроссФит  ')).toBe('кроссфит');
      expect(normalizeSlugLookupValue(encodeURIComponent('кроссфит'))).toBe('кроссфит');
    });

    it('битую кодировку не роняет, а обрабатывает как есть', () => {
      expect(normalizeSlugLookupValue('%E0%A4%A')).toBe('%e0%a4%a');
    });

    it('пустая строка остаётся пустой', () => {
      expect(normalizeSlugLookupValue('   ')).toBe('');
    });
  });

  describe('ClubsRepository', () => {
    beforeEach(async () => {
      await writeCollection('clubs.json', [
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Кроссфит', slug: 'кроссфит' },
        { id: 2, createdAt: '2026-01-02T00:00:00.000Z', name: 'Скрытый', slug: 'hidden', status: 'hidden' },
      ]);
    });

    it('находит клуб по кириллическому slug и по его encoded-версии', async () => {
      const clubs = new JsonClubsRepository(storage);

      expect(await clubs.findBySlug('кроссфит')).toMatchObject({ id: 1 });
      expect(await clubs.findBySlug(encodeURIComponent('кроссфит'))).toMatchObject({ id: 1 });
      expect(await clubs.findBySlug('КРОССФИТ')).toMatchObject({ id: 1 });
    });

    it('несуществующий slug отдаёт null', async () => {
      const clubs = new JsonClubsRepository(storage);

      expect(await clubs.findBySlug('нет-такого')).toBeNull();
      expect(await clubs.findBySlug('  ')).toBeNull();
    });

    it('фильтр скрытых убирает только status=hidden', async () => {
      const clubs = new JsonClubsRepository(storage);

      expect(await clubs.findAll()).toHaveLength(2);
      expect(await clubs.findAll({ excludeHidden: true })).toHaveLength(1);
    });

    it('обновление несуществующего клуба бросает текст с id — как в db.ts', async () => {
      const clubs = new JsonClubsRepository(storage);

      await expect(clubs.update(999, { name: 'x' })).rejects.toThrow('Клуб с id 999 не найден');
    });
  });

  describe('TrainersRepository', () => {
    it('восстанавливает sportIds из устаревшего одиночного sportId', async () => {
      await writeCollection('trainers.json', [
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Пётр', slug: 'petr', sportId: 7 },
      ]);
      const trainers = new JsonTrainersRepository(storage);

      const trainer = await trainers.findById(1);

      expect(trainer?.sportIds).toEqual([7]);
      expect(trainer?.sportId).toBe(7);
    });

    it('при заполненном sportIds оставляет его и проставляет первый как sportId', async () => {
      await writeCollection('trainers.json', [
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Пётр', slug: 'petr', sportIds: [3, 5] },
      ]);
      const trainers = new JsonTrainersRepository(storage);

      const trainer = await trainers.findById(1);

      expect(trainer?.sportIds).toEqual([3, 5]);
      expect(trainer?.sportId).toBe(3);
    });

    it('без обоих полей отдаёт пустой массив, а не падает', async () => {
      await writeCollection('trainers.json', [
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Пётр', slug: 'petr' },
      ]);
      const trainers = new JsonTrainersRepository(storage);

      expect((await trainers.findById(1))?.sportIds).toEqual([]);
    });
  });

  describe('ScheduleRepository', () => {
    beforeEach(async () => {
      await writeCollection('offerings.json', [
        { id: 10, createdAt: '2026-01-01T00:00:00.000Z', ownerType: 'trainer', ownerId: 5 },
      ]);
      await writeCollection('schedule.json', [
        // Слот без владельца — он должен вывестись из услуги.
        { id: 1, createdAt: '2026-01-01T00:00:00.000Z', offeringId: 10, bookedCount: 0, capacity: 5 },
        // Клубный слот с явным владельцем.
        { id: 2, createdAt: '2026-01-01T00:00:00.000Z', ownerType: 'club', ownerId: 3, bookedCount: 1, capacity: 5 },
      ]);
    });

    it('выводит владельца слота из связанной услуги', async () => {
      const schedule = new JsonScheduleRepository(storage);

      const slot = await schedule.findById(1);

      expect(slot?.ownerType).toBe('trainer');
      expect(slot?.ownerId).toBe(5);
      expect(slot?.trainerId).toBe(5);
      // Клуб для тренерского слота здесь НЕ достраивается — это делает потребитель.
      expect(slot?.clubId).toBeUndefined();
    });

    it('по умолчанию отдаёт только клубные слоты', async () => {
      const schedule = new JsonScheduleRepository(storage);

      const byDefault = await schedule.findMany();

      expect(byDefault).toHaveLength(1);
      expect(byDefault[0].id).toBe(2);
    });

    it('ownerType=all отдаёт все слоты, ownerType=trainer — только тренерские', async () => {
      const schedule = new JsonScheduleRepository(storage);

      expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(2);
      expect(await schedule.findMany({ ownerType: 'trainer' })).toHaveLength(1);
    });

    it('изменение занятых мест не уходит ниже нуля', async () => {
      const schedule = new JsonScheduleRepository(storage);

      const decremented = await schedule.changeBookedCount(1, -5);

      expect(decremented.bookedCount).toBe(0);
    });

    it('пакетная вставка выдаёт последовательные id', async () => {
      const schedule = new JsonScheduleRepository(storage);

      const created = await schedule.insertMany([
        { title: 'Первый', bookedCount: 0, capacity: 5 } as never,
        { title: 'Второй', bookedCount: 0, capacity: 5 } as never,
      ]);

      expect(created.map((slot) => slot.id)).toEqual([3, 4]);
      expect(await schedule.findMany({ ownerType: 'all' })).toHaveLength(4);
    });
  });
});
