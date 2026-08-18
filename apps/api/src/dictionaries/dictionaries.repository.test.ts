// Тесты репозиториев справочников — пилотный домен разделения db.ts.
// Выбран первым намеренно: только чтение (кроме городов), ни от кого не зависит,
// никто другой в эти коллекции не пишет. На нём обкатывается сам паттерн
// «интерфейс + токен + JSON-реализация», который дальше повторится 11 раз.
//
// Контрактный набор прогоняется дважды — по JSON-реализации и по заглушке
// в памяти. Совпадение результатов и есть доказательство, что интерфейс
// не протёк деталями хранилища.

import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import type { City } from '@sporthub/types';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { JsonStorage } from '../storage/json-storage';
import {
  InMemoryCitiesRepository,
  JsonCitiesRepository,
  JsonSimpleDictionaryRepository,
  type CitiesRepository,
} from './dictionaries.repository';

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
  let dataDirectory: string;
  let storage: JsonStorage;

  beforeEach(async () => {
    dataDirectory = await mkdtemp(path.join(tmpdir(), 'sporthub-dict-'));
    storage = new JsonStorage(dataDirectory);
    await writeFile(
      path.join(dataDirectory, 'cities.json'),
      `${JSON.stringify(SEED_CITIES, null, 2)}\n`,
      'utf8',
    );
    await writeFile(
      path.join(dataDirectory, 'sports.json'),
      `${JSON.stringify([{ id: 1, createdAt: '2026-01-01T00:00:00.000Z', name: 'Плавание' }], null, 2)}\n`,
      'utf8',
    );
  });

  afterEach(async () => {
    await rm(dataDirectory, { force: true, recursive: true });
  });

  describe('простые справочники (только чтение)', () => {
    it('отдают всю коллекцию как есть', async () => {
      const sports = new JsonSimpleDictionaryRepository(storage, 'sports');

      const all = await sports.findAll();

      expect(all).toHaveLength(1);
      expect(all[0]).toMatchObject({ id: 1, name: 'Плавание' });
    });
  });

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

    it('новый город создаётся со следующим id и меткой времени', async () => {
      const repository = await createRepository();

      const city = await repository.findOrCreateByName({
        name: 'Казань',
        coordinates: { lat: 55.8, lng: 49.1 },
      });

      // В сиде максимальный id равен 4, значит следующий — 5, а не 3.
      expect(city.id).toBe(5);
      expect(city.name).toBe('Казань');
      expect(() => new Date(city.createdAt).toISOString()).not.toThrow();
      expect(await repository.findAll()).toHaveLength(3);
    });

    it('созданный город виден при повторном чтении', async () => {
      const repository = await createRepository();
      await repository.findOrCreateByName({
        name: 'Казань',
        coordinates: { lat: 0, lng: 0 },
      });

      const again = await repository.findOrCreateByName({
        name: 'Казань',
        coordinates: { lat: 0, lng: 0 },
      });

      expect(again.id).toBe(5);
      expect(await repository.findAll()).toHaveLength(3);
    });
  };

  describe('CitiesRepository — JSON-реализация', () => {
    citiesContract(async () => new JsonCitiesRepository(storage));
  });

  describe('CitiesRepository — заглушка в памяти', () => {
    // Та же проверка на реализации, которая про файлы не знает вовсе.
    citiesContract(async () => new InMemoryCitiesRepository(structuredClone(SEED_CITIES)));
  });
});
