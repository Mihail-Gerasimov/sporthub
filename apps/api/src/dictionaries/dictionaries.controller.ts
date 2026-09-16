// Контроллеры справочников.
//
// Два из них (`sports`, `cities`) существовали и раньше; четыре остальных —
// новые: страницы брали эти справочники прямо из слоя данных, минуя API,
// и после переезда фронта им нужен собственный маршрут.
//
// Формат ответа собирает интерцептор — контроллер возвращает данные.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { Amenity, City, Specialty, Sport, Tag, WorkFormat } from '@sporthub/types';

import type {
  CitiesRepository,
  SimpleDictionaryRepository,
  SportsRepository,
} from './dictionaries.repository';
import { Public } from '../auth/access.decorators';
import { ValidationError } from '../common/domain-error';
import {
  AMENITIES_REPOSITORY,
  CITIES_REPOSITORY,
  SPECIALTIES_REPOSITORY,
  SPORTS_REPOSITORY,
  TAGS_REPOSITORY,
  WORK_FORMATS_REPOSITORY,
} from './dictionaries.repository';

// Все справочники открыты гостю, поэтому пометка стоит на КАЖДОМ классе, а не на
// методах: в контроллере справочника ровно один маршрут, и открыт он целиком.
// Гость обязан видеть виды спорта, города, теги, удобства, форматы работы и
// специализации — из них собираются фильтры каталога и подписи карточек, то есть
// без них витрина площадки не отрисуется вовсе. Личных данных здесь нет: это
// общие списки, одинаковые для всех.
/**
 * Потолок числа популярных видов — тот же, что у `limit` витрины (38.29):
 * больше сотни маршрут не отдаёт по одному запросу.
 *
 * ⚠️ Порог кэширования — назван. Популярность считается по ВСЕМ опубликованным
 * публикациям (`GROUP BY` по связующим таблицам): 3,8 мс на 5000 клубов и 5000
 * карточек, растёт линейно (≈0,4 мс на тысячу), индекс обход не сокращает —
 * отсев по статусу оставляет почти все строки. При десятках тысяч публикаций сюда
 * ставится кэш на 60 секунд, как у `/stats/overview`; до того кэш — абстракция впрок.
 */
const MAX_POPULAR = 100;

@Public()
@Controller('sports')
export class SportsController {
  constructor(
    @Inject(SPORTS_REPOSITORY)
    private readonly sports: SportsRepository,
  ) {}

  /**
   * Справочник видов спорта; с `?popular=<n>` — первые `n` по популярности (38.68).
   *
   * Параметр необязательный: без него выдача прежняя — все виды по номеру, без
   * счётчика. С ним каждая строка несёт `publicationCount`, а порядок и срез
   * считает база. Негодное значение — отказ, а не молчаливый справочник целиком.
   */
  @Get()
  findAll(@Query('popular') popular?: string): Promise<Sport[]> {
    if (popular === undefined || popular.trim() === '') return this.sports.findAll();

    const parsed = Number(popular);

    if (!Number.isInteger(parsed) || parsed <= 0) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    return this.sports.findPopular(Math.min(parsed, MAX_POPULAR));
  }
}

@Public()
@Controller('cities')
export class CitiesController {
  constructor(@Inject(CITIES_REPOSITORY) private readonly cities: CitiesRepository) {}

  @Get()
  findAll(): Promise<City[]> {
    return this.cities.findAll();
  }
}

@Public()
@Controller('tags')
export class TagsController {
  constructor(
    @Inject(TAGS_REPOSITORY)
    private readonly tags: SimpleDictionaryRepository<Tag>,
  ) {}

  @Get()
  findAll(): Promise<Tag[]> {
    return this.tags.findAll();
  }
}

@Public()
@Controller('amenities')
export class AmenitiesController {
  constructor(
    @Inject(AMENITIES_REPOSITORY)
    private readonly amenities: SimpleDictionaryRepository<Amenity>,
  ) {}

  @Get()
  findAll(): Promise<Amenity[]> {
    return this.amenities.findAll();
  }
}

@Public()
@Controller('work-formats')
export class WorkFormatsController {
  constructor(
    @Inject(WORK_FORMATS_REPOSITORY)
    private readonly workFormats: SimpleDictionaryRepository<WorkFormat>,
  ) {}

  @Get()
  findAll(): Promise<WorkFormat[]> {
    return this.workFormats.findAll();
  }
}

@Public()
@Controller('specialties')
export class SpecialtiesController {
  constructor(
    @Inject(SPECIALTIES_REPOSITORY)
    private readonly specialties: SimpleDictionaryRepository<Specialty>,
  ) {}

  @Get()
  findAll(): Promise<Specialty[]> {
    return this.specialties.findAll();
  }
}

export const DICTIONARY_CONTROLLERS = [
  SportsController,
  CitiesController,
  TagsController,
  AmenitiesController,
  WorkFormatsController,
  SpecialtiesController,
];
