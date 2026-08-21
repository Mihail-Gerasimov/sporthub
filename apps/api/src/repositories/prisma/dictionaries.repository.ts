// Справочники поверх базы.
//
// Образец для остальных доменов, поэтому здесь стоит проговорить устройство целиком:
//
// - Реализация лежит ОТДЕЛЬНО от файловой, а не рядом с ней в том же файле. Файловая
//   остаётся запасным путём до выкатки на боевой сервер и удаляется целым каталогом,
//   а не выковыриванием классов из перемешанного файла.
// - Клиент берётся у `PrismaTransactionRunner` при каждом запросе, а не сохраняется
//   в поле. Внутри транзакции он другой, и сохранённый в конструкторе увёл бы половину
//   запросов мимо транзакции — молча, без единой ошибки.
// - Порядок выдачи задаётся ЯВНО. В файле порядок был порядком записи, в базе без
//   `ORDER BY` он не гарантирован и меняется сам: обновили строку — она физически
//   переехала, и карточка на странице прыгнула. Сортировка по номеру воспроизводит
//   прежний порядок ровно.
// - Значения на границе переводятся мапперами из `../prisma-mappers`: метка времени
//   обязана остаться строкой, а не стать объектом даты.

import { Injectable } from '@nestjs/common';
import { normalizeMatchKey } from '@sporthub/domain';
import type { Amenity, City, Specialty, Sport, Tag, WorkFormat } from '@sporthub/types';

import type {
  CitiesRepository,
  SimpleDictionaryRepository,
} from '../../dictionaries/dictionaries.repository';
import type { DatabaseClient } from '../../storage/prisma-transaction';
import { PrismaTransactionRunner } from '../../storage/prisma-transaction';
import { toIsoString } from '../prisma-mappers';
import { isUniqueViolation } from './unique-violation';

/** Имена таблиц простых справочников — единственное, чем они отличаются друг от друга. */
export type SimpleDictionaryTable = 'tag' | 'amenity' | 'specialty' | 'workFormat';

type SimpleRow = { id: number; createdAt: Date; name: string };

/** Простой справочник: только чтение, только имя. */
export class PrismaSimpleDictionaryRepository<
  TItem extends { id: number; name: string },
> implements SimpleDictionaryRepository<TItem> {
  constructor(
    private readonly transactions: PrismaTransactionRunner,
    private readonly table: SimpleDictionaryTable,
  ) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  async findAll(): Promise<TItem[]> {
    const rows = (await (
      this.client[this.table] as { findMany: (args: unknown) => Promise<SimpleRow[]> }
    ).findMany({
      orderBy: { id: 'asc' },
    })) as SimpleRow[];

    return rows.map((row) => ({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      name: row.name,
    })) as unknown as TItem[];
  }
}

/** Виды спорта — тот же справочник, но с собственными полями. */
@Injectable()
export class PrismaSportsRepository implements SimpleDictionaryRepository<Sport> {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  async findAll(): Promise<Sport[]> {
    const rows = await this.transactions.client.sport.findMany({ orderBy: { id: 'asc' } });

    return rows.map((row) => ({
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      name: row.name,
      slug: row.slug,
      description: row.description,
      icon: row.icon,
      imageUrl: row.imageUrl,
      isPopular: row.isPopular,
    }));
  }
}

/**
 * Города — единственный справочник, в который пишут.
 *
 * ⚠️ Прежний комментарий обещал, что «поиск или создание» ляжет на `upsert` один в один.
 * Это неверно. `upsert` ищет по уникальному полю, а искать надо по ПРИВЕДЁННОМУ имени:
 * «  сАмАрА  » и «Самара» — один город. Отсюда отдельная хранимая колонка с приведённым
 * именем и уникальным индексом по ней.
 *
 * И даже с ней остаётся щель между «не нашли» и «записали»: два одновременных запроса
 * оба увидят пустоту и оба попробуют вставить. Поэтому нарушение уникальности не считается
 * ошибкой — это ровно тот случай, ради которого уникальность и унесена в базу: второй
 * запрос просто перечитывает то, что успел записать первый.
 */
@Injectable()
export class PrismaCitiesRepository implements CitiesRepository {
  constructor(private readonly transactions: PrismaTransactionRunner) {}

  private get client(): DatabaseClient {
    return this.transactions.client;
  }

  private static toCity(row: {
    id: number;
    createdAt: Date;
    name: string;
    latitude: number;
    longitude: number;
  }): City {
    return {
      id: row.id,
      createdAt: toIsoString(row.createdAt),
      name: row.name,
      coordinates: { lat: row.latitude, lng: row.longitude },
    };
  }

  async findAll(): Promise<City[]> {
    const rows = await this.client.city.findMany({ orderBy: { id: 'asc' } });

    return rows.map((row) => PrismaCitiesRepository.toCity(row));
  }

  async findOrCreateByName(data: Omit<City, 'id' | 'createdAt'>): Promise<City> {
    const nameNormalized = normalizeMatchKey(data.name);

    const existing = await this.client.city.findUnique({ where: { nameNormalized } });

    if (existing) return PrismaCitiesRepository.toCity(existing);

    try {
      const created = await this.client.city.create({
        data: {
          name: data.name,
          nameNormalized,
          latitude: data.coordinates.lat,
          longitude: data.coordinates.lng,
        },
      });

      return PrismaCitiesRepository.toCity(created);
    } catch (error) {
      // Перечитываем ТОЛЬКО нарушение уникальности: это гонка — пока мы искали,
      // город завёл кто-то другой, и это не ошибка. Любая другая ошибка (нет связи
      // с базой, отказ в правах) обязана дойти наверх как есть: раньше её глушил
      // общий `catch`, и обрыв базы выглядел бы как «город не нашёлся».
      if (!isUniqueViolation(error, 'name_normalized')) throw error;

      const raced = await this.client.city.findUnique({ where: { nameNormalized } });

      if (raced) return PrismaCitiesRepository.toCity(raced);

      throw error;
    }
  }
}

/** Справочники, отличающиеся только именем таблицы. Перечислены для модуля связывания. */
export const SIMPLE_DICTIONARY_TABLES = {
  tags: 'tag',
  amenities: 'amenity',
  specialties: 'specialty',
  workFormats: 'workFormat',
} as const satisfies Record<string, SimpleDictionaryTable>;

export type TagsRepositoryImpl = PrismaSimpleDictionaryRepository<Tag>;
export type AmenitiesRepositoryImpl = PrismaSimpleDictionaryRepository<Amenity>;
export type SpecialtiesRepositoryImpl = PrismaSimpleDictionaryRepository<Specialty>;
export type WorkFormatsRepositoryImpl = PrismaSimpleDictionaryRepository<WorkFormat>;
