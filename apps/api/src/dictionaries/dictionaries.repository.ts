// Репозитории справочников. Пилотный домен разделения db.ts: на нём обкатан
// паттерн «интерфейс + токен внедрения + подменяемая реализация», который
// дальше повторяется для остальных 11 доменов.
//
// Здесь остались только границы. Реализация одна и живёт в `repositories/prisma/`.
// Файловая версия и заглушка в памяти удалены в фазе 34: заглушка существовала
// доказательством, что интерфейс не протёк деталями хранилища и подмена на Prisma
// будет безболезненной. Подмена состоялась, доказательство своё дело сделало —
// а реализация, которую зовут только тесты, это уже не абстракция, а мёртвый код.
//
// Смысл разделения — в фазе базы JSON-реализация заменяется на Prisma-версию
// правкой одной строки провайдера в модуле, а сервисы и их тесты не трогаются.

import type { Amenity, City, Specialty, Sport, Tag, WorkFormat } from '@sporthub/types';

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

/**
 * Виды спорта: справочник плюс популярность (шаг 38.68).
 *
 * `findPopular` — первые `limit` видов по убыванию числа ОПУБЛИКОВАННЫХ клубов
 * и карточек тренеров; ничью разводит номер вида. Считает база группировкой
 * по связующим таблицам, в памяти не считается ничего: виды без публикаций
 * приходят с нулём, а не пропадают. `publicationCount` у строки заполнен всегда.
 */
export interface SportsRepository extends SimpleDictionaryRepository<Sport> {
  findPopular(limit: number): Promise<(Sport & { publicationCount: number })[]>;
}
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
