// Тесты репозиториев справочников — пилотный домен разделения db.ts.
// Выбран первым намеренно: только чтение (кроме городов), ни от кого не зависит,
// никто другой в эти коллекции не пишет. На нём обкатывается сам паттерн
// «интерфейс + токен + JSON-реализация», который дальше повторится 11 раз.
//
// Контрактный набор прогоняется дважды — по JSON-реализации и по заглушке
// в памяти. Совпадение результатов и есть доказательство, что интерфейс
// не протёк деталями хранилища.

import { normalizeMatchKey } from '@sporthub/domain';
import type { City, Tag } from '@sporthub/types';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';

import {
  PrismaCitiesRepository,
  PrismaSimpleDictionaryRepository,
} from '../repositories/prisma/dictionaries.repository';
import { PrismaTransactionRunner } from '../storage/prisma-transaction';
import { createTestDatabase, type TestDatabase } from '../test/db-harness';
import { ensureTestSchema } from '../test/db-setup';
import { type CitiesRepository } from './dictionaries.repository';

const SEED_CITIES: City[] = [
  {
    id: 1,
    createdAt: '2026-01-01T00:00:00.000Z',
    name: 'Самара',
    coordinates: { lat: 53.2, lng: 50.1 },
  },
  {
    id: 4,
    createdAt: '2026-01-02T00:00:00.000Z',
    name: 'Москва',
    coordinates: { lat: 55.7, lng: 37.6 },
  },
];

describe('Репозитории справочников', () => {
  // Контрактный набор: один и тот же список проверок для любой реализации.
  // Если он проходит на JSON и падает на заглушке (или наоборот) — интерфейс лжёт.
  const citiesContract = (createRepository: () => Promise<CitiesRepository>) => {
    it('findAll отдаёт все города', async () => {
      const repository = await createRepository();

      expect(await repository.findAll()).toHaveLength(2);
    });

    it('findOrCreateByName возвращает существующий город без создания дубликата', async () => {
      const repository = await createRepository();

      const city = await repository.findOrCreateByName({
        name: 'Самара',
        coordinates: { lat: 0, lng: 0 },
      });

      expect(city.id).toBe(1);
      expect(await repository.findAll()).toHaveLength(2);
    });

    it('дедупликация не зависит от регистра и пробелов по краям', async () => {
      const repository = await createRepository();

      const city = await repository.findOrCreateByName({
        name: '  сАмАрА  ',
        coordinates: { lat: 0, lng: 0 },
      });

      expect(city.id).toBe(1);
      expect(await repository.findAll()).toHaveLength(2);
    });

    it('новый город создаётся с собственным id и меткой времени', async () => {
      const repository = await createRepository();
      const before = await repository.findAll();

      const city = await repository.findOrCreateByName({
        name: 'Казань',
        coordinates: { lat: 55.8, lng: 49.1 },
      });

      // Проверяется свойство, а не число: номер выдаёт хранилище, и у базы это
      // последовательность, а не «максимальный плюс один». Важно, что номер новый
      // и не совпал с чужим — дырки в нумерации переиспользовать нельзя, они уже
      // могли утечь в ссылки и в журнал.
      expect(before.map((item) => item.id)).not.toContain(city.id);
      expect(city.name).toBe('Казань');
      expect(() => new Date(city.createdAt).toISOString()).not.toThrow();
      expect(await repository.findAll()).toHaveLength(3);
    });

    it('созданный город виден при повторном чтении', async () => {
      const repository = await createRepository();
      const city = await repository.findOrCreateByName({
        name: 'Казань',
        coordinates: { lat: 0, lng: 0 },
      });

      const again = await repository.findOrCreateByName({
        name: 'Казань',
        coordinates: { lat: 0, lng: 0 },
      });

      expect(again.id).toBe(city.id);
      expect(await repository.findAll()).toHaveLength(3);
    });
  };

  describe('CitiesRepository — реализация на базе', () => {
    // Тот же набор на настоящей базе. Это и есть проверка обещания фазы: контракт
    // репозитория не изменился ни на одну сигнатуру, значит сервисы можно не трогать.
    let db: TestDatabase;

    beforeAll(async () => {
      await ensureTestSchema();
      db = await createTestDatabase();
    }, 120_000);

    afterAll(async () => {
      await db?.close();
    });

    citiesContract(async () => {
      await db.truncateAll();

      // Тот же сид, что и у файловой реализации. Номера проставляются явно —
      // проверки на конкретное число из контракта убраны как раз потому, что
      // база выдаёт их сама.
      for (const city of SEED_CITIES) {
        await db.prisma.city.create({
          data: {
            id: city.id,
            createdAt: new Date(city.createdAt),
            name: city.name,
            nameNormalized: normalizeMatchKey(city.name),
            latitude: city.coordinates.lat,
            longitude: city.coordinates.lng,
          },
        });
      }

      // Последовательность номеров после ручной вставки отстаёт: следующий
      // автоматический номер совпал бы с уже занятым. Двигаем её выше максимума —
      // ровно то же делает скрипт переноса данных.
      await db.prisma.$executeRawUnsafe(
        `SELECT setval(pg_get_serial_sequence('cities', 'id'), (SELECT max(id) FROM cities))`,
      );

      return new PrismaCitiesRepository(new PrismaTransactionRunner(db.service));
    });

    it('одновременное создание одного города даёт одну строку, а не ошибку', async () => {
      // Проверка гонки, которой у файлов быть не могло: там запись идёт через один
      // буфер, здесь — два независимых соединения. Уникальность держит база
      // (`cities_name_normalized_key`), а репозиторий обязан отличить ЭТО нарушение
      // от любой другой ошибки и перечитать строку. Если распознавание имени
      // ограничения сломается, проигравший вызов бросит наружу — тест покраснеет.
      await db.truncateAll();

      const repository = new PrismaCitiesRepository(new PrismaTransactionRunner(db.service));
      const payload = { name: 'Тольятти', coordinates: { lat: 53.5, lng: 49.4 } };

      const [first, second] = await Promise.all([
        repository.findOrCreateByName(payload),
        repository.findOrCreateByName(payload),
      ]);

      expect(first.id).toBe(second.id);
      expect(await repository.findAll()).toHaveLength(1);
    });
  });

  describe('простые справочники — реализация на базе', () => {
    let db: TestDatabase;

    beforeAll(async () => {
      await ensureTestSchema();
      db = await createTestDatabase();
    }, 120_000);

    afterAll(async () => {
      await db?.close();
    });

    it('отдают коллекцию в порядке номеров', async () => {
      await db.truncateAll();
      // Записываем не по порядку: в файле порядок был порядком записи, и без явной
      // сортировки база вернула бы их так же — то есть неверно.
      for (const name of ['Второй', 'Первый']) {
        await db.prisma.tag.create({ data: { name } });
      }

      const tags = await new PrismaSimpleDictionaryRepository<Tag>(
        new PrismaTransactionRunner(db.service),
        'tag',
      ).findAll();

      expect(tags.map((tag) => tag.name)).toEqual(['Второй', 'Первый']);
      expect(tags.map((tag) => tag.id)).toEqual(
        [...tags.map((tag) => tag.id)].sort((a, b) => a - b),
      );
      expect(typeof tags[0].createdAt).toBe('string');
    });
  });
});
