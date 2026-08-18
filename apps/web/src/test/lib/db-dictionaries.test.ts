/**
 * Тесты справочников: getCities, appendCity, getTags, getAmenities,
 * getWorkFormats, getSpecialties.
 * Phase 23 — Step 23.1.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import {
  appendCity,
  getAmenities,
  getCities,
  getSpecialties,
  getTags,
  getWorkFormats,
} from '@/lib/db';
import {
  createIsolatedDataDirectory,
  removeIsolatedDataDirectory,
} from '@/test/helpers/data-directory';
import { seedTestData } from '@/test/helpers/seed-fixtures';

describe('db справочники — Phase 23', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  // --- getCities ---

  describe('getCities', () => {
    it('возвращает seed-города', async () => {
      const cities = await getCities();

      expect(cities).toHaveLength(2);
      expect(cities[0].name).toBe('Самара');
      expect(cities[1].name).toBe('Москва');
    });

    it('каждый город имеет id, createdAt, name, coordinates', async () => {
      const cities = await getCities();
      const city = cities[0];

      expect(city.id).toBe(1);
      expect(city.createdAt).toBeDefined();
      expect(city.name).toBe('Самара');
      expect(city.coordinates).toEqual({ lat: 53.195878, lng: 50.100202 });
    });
  });

  // --- appendCity ---

  describe('appendCity', () => {
    it('добавляет новый город с автогенерацией id и createdAt', async () => {
      const city = await appendCity({
        name: 'Новосибирск',
        coordinates: { lat: 55.0084, lng: 82.9357 },
      });

      expect(city.id).toBe(3);
      expect(city.createdAt).toBeDefined();
      expect(city.name).toBe('Новосибирск');
      expect(city.coordinates).toEqual({ lat: 55.0084, lng: 82.9357 });

      // Проверяем персистентность
      const cities = await getCities();
      expect(cities).toHaveLength(3);
      expect(cities[2].name).toBe('Новосибирск');
    });

    it('дедупликация — возвращает существующий город без создания дубликата', async () => {
      const existing = await appendCity({
        name: 'Самара',
        coordinates: { lat: 53.195878, lng: 50.100202 },
      });

      expect(existing.id).toBe(1);
      expect(existing.name).toBe('Самара');

      const cities = await getCities();
      expect(cities).toHaveLength(2);
    });

    it('дедупликация нечувствительна к регистру и пробелам', async () => {
      const existing = await appendCity({
        name: '  самара  ',
        coordinates: { lat: 53.195878, lng: 50.100202 },
      });

      expect(existing.id).toBe(1);

      const cities = await getCities();
      expect(cities).toHaveLength(2);
    });

    it('два последовательных добавления инкрементируют id', async () => {
      const first = await appendCity({
        name: 'Краснодар',
        coordinates: { lat: 45.0355, lng: 38.975 },
      });
      const second = await appendCity({
        name: 'Воронеж',
        coordinates: { lat: 51.6608, lng: 39.2003 },
      });

      expect(first.id).toBe(3);
      expect(second.id).toBe(4);

      const cities = await getCities();
      expect(cities).toHaveLength(4);
    });
  });

  // --- getTags ---

  describe('getTags', () => {
    it('возвращает seed-теги', async () => {
      const tags = await getTags();

      expect(tags).toHaveLength(2);
      expect(tags[0].name).toBe('Для начинающих');
      expect(tags[1].name).toBe('Бассейн');
    });

    it('каждый тег имеет id, createdAt, name', async () => {
      const tags = await getTags();
      const tag = tags[0];

      expect(tag.id).toBe(1);
      expect(tag.createdAt).toBeDefined();
      expect(tag.name).toBe('Для начинающих');
    });
  });

  // --- getAmenities ---

  describe('getAmenities', () => {
    it('возвращает seed-удобства', async () => {
      const amenities = await getAmenities();

      expect(amenities).toHaveLength(2);
      expect(amenities[0].name).toBe('Парковка');
      expect(amenities[1].name).toBe('Душевые');
    });
  });

  // --- getWorkFormats ---

  describe('getWorkFormats', () => {
    it('возвращает seed-форматы работы', async () => {
      const formats = await getWorkFormats();

      expect(formats).toHaveLength(2);
      expect(formats[0].name).toBe('В зале');
      expect(formats[1].name).toBe('Онлайн');
    });
  });

  // --- getSpecialties ---

  describe('getSpecialties', () => {
    it('возвращает seed-специализации', async () => {
      const specialties = await getSpecialties();

      expect(specialties).toHaveLength(2);
      expect(specialties[0].name).toBe('Подготовка к соревнованиям');
      expect(specialties[1].name).toBe('Реабилитация');
    });
  });
});

describe('regression — существующие коллекции db.ts не сломаны справочниками', () => {
  let dataDirectory: string;

  beforeEach(async () => {
    dataDirectory = await createIsolatedDataDirectory();
    await seedTestData(dataDirectory);
    process.env.SPORT_HUB_DATA_DIRECTORY = dataDirectory;
  });

  afterEach(async () => {
    delete process.env.SPORT_HUB_DATA_DIRECTORY;
    await removeIsolatedDataDirectory(dataDirectory);
  });

  it('clubs, trainers, bookings, sports доступны после расширения DataCollectionMap', async () => {
    const { getBookings, getClubs, getSports, getTrainers } = await import('@/lib/db');

    const clubs = await getClubs();
    const trainers = await getTrainers();
    const bookings = await getBookings();
    const sports = await getSports();

    expect(clubs.length).toBeGreaterThan(0);
    expect(trainers.length).toBeGreaterThan(0);
    expect(bookings.length).toBeGreaterThan(0);
    expect(sports.length).toBeGreaterThan(0);
  });
});
