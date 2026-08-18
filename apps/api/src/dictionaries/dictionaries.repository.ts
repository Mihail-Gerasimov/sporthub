// Репозитории справочников. Пилотный домен разделения db.ts: на нём обкатан
// паттерн «интерфейс + токен внедрения + подменяемая реализация», который
// дальше повторяется для остальных 11 доменов.
//
// Смысл разделения — в фазе базы JSON-реализация заменяется на Prisma-версию
// правкой одной строки провайдера в модуле, а сервисы и их тесты не трогаются.

import type { Amenity, City, Specialty, Sport, Tag, WorkFormat } from '@sporthub/types';

import type { CollectionKey, JsonStorage } from '../storage/json-storage';

// --- Токены внедрения ---------------------------------------------------------

export const SPORTS_REPOSITORY = Symbol('SPORTS_REPOSITORY');
export const TAGS_REPOSITORY = Symbol('TAGS_REPOSITORY');
export const AMENITIES_REPOSITORY = Symbol('AMENITIES_REPOSITORY');
export const WORK_FORMATS_REPOSITORY = Symbol('WORK_FORMATS_REPOSITORY');
export const SPECIALTIES_REPOSITORY = Symbol('SPECIALTIES_REPOSITORY');
export const CITIES_REPOSITORY = Symbol('CITIES_REPOSITORY');

// --- Интерфейсы ---------------------------------------------------------------

/** Справочник только для чтения: спорт, теги, удобства, форматы, специализации. */
export interface SimpleDictionaryRepository<TItem> {
  findAll(): Promise<TItem[]>;
}

export type SportsRepository = SimpleDictionaryRepository<Sport>;
export type TagsRepository = SimpleDictionaryRepository<Tag>;
export type AmenitiesRepository = SimpleDictionaryRepository<Amenity>;
export type WorkFormatsRepository = SimpleDictionaryRepository<WorkFormat>;
export type SpecialtiesRepository = SimpleDictionaryRepository<Specialty>;

/**
 * Города — единственный справочник, в который пишут: новый город появляется
 * при публикации клуба или тренера в неизвестном городе.
 */
export interface CitiesRepository {
  findAll(): Promise<City[]>;
  /**
   * Найти по имени или создать. Дедупликация без учёта регистра и пробелов
   * по краям: «  сАмАрА  » и «Самара» — один и тот же город.
   * В фазе базы ложится на `prisma.city.upsert` один в один.
   */
  findOrCreateByName(data: Omit<City, 'id' | 'createdAt'>): Promise<City>;
}

/** Нормализация названия города для сравнения. */
export function normalizeCityName(name: string): string {
  return name.trim().toLocaleLowerCase('ru-RU');
}

// --- JSON-реализации ----------------------------------------------------------

export class JsonSimpleDictionaryRepository<TItem> implements SimpleDictionaryRepository<TItem> {
  constructor(
    private readonly storage: JsonStorage,
    private readonly collection: CollectionKey,
  ) {}

  async findAll(): Promise<TItem[]> {
    return (await this.storage.read(this.collection)) as TItem[];
  }
}

export class JsonCitiesRepository implements CitiesRepository {
  constructor(private readonly storage: JsonStorage) {}

  async findAll(): Promise<City[]> {
    return this.storage.read('cities');
  }

  async findOrCreateByName(data: Omit<City, 'id' | 'createdAt'>): Promise<City> {
    const cities = await this.storage.read('cities');
    const normalized = normalizeCityName(data.name);
    const existing = cities.find((city) => normalizeCityName(city.name) === normalized);

    if (existing) {
      return existing;
    }

    const city: City = {
      ...data,
      id: this.storage.getNextEntityId(cities),
      createdAt: new Date().toISOString(),
    };

    await this.storage.write('cities', [...cities, city]);

    return city;
  }
}

// --- Реализация в памяти ------------------------------------------------------

/**
 * Заглушка без файловой системы. Нужна не для продакшена, а как доказательство:
 * если контрактный набор тестов проходит и на ней, и на JSON-версии — значит
 * интерфейс не протёк деталями хранилища и подмена на Prisma будет безболезненной.
 */
export class InMemoryCitiesRepository implements CitiesRepository {
  constructor(private cities: City[] = []) {}

  async findAll(): Promise<City[]> {
    return [...this.cities];
  }

  async findOrCreateByName(data: Omit<City, 'id' | 'createdAt'>): Promise<City> {
    const normalized = normalizeCityName(data.name);
    const existing = this.cities.find((city) => normalizeCityName(city.name) === normalized);

    if (existing) {
      return existing;
    }

    const nextId =
      this.cities.length === 0 ? 1 : Math.max(...this.cities.map((city) => city.id)) + 1;
    const city: City = {
      ...data,
      id: nextId,
      createdAt: new Date().toISOString(),
    };

    this.cities = [...this.cities, city];

    return city;
  }
}
