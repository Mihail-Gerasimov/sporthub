// Контроллер расписания.
//
// ⚠️ Маршрут отдаёт только слоты со свободными местами: условие
// `bookedCount < capacity` отсекает их ещё в запросе, до расчёта `availableSpots`,
// поэтому заполненный слот исчезает из выдачи целиком. Страницы личных кабинетов
// поэтому читали слой данных напрямую — им нужны и заполненные слоты.
// Поведение маршрута сохранено дословно, добор для страниц сделан отдельно.
//
// Сам контроллер данные не отбирает и не сортирует: его дело — разобрать параметры
// запроса, отдать их фильтру репозитория и досчитать число оставшихся мест.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { CatalogOwnerType, Schedule } from '@sporthub/types';

import { ValidationError } from '../common/domain-error';
import type { ScheduleRepository } from '../repositories/entities.repository';
import { SCHEDULE_REPOSITORY } from '../repositories/entities.repository';
import { SlotContextController } from './slot-context.controller';

/** Слот с числом оставшихся мест — форма ответа маршрута. */
export type ScheduleSlotWithAvailability = Schedule & {
  availableSpots: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Пустая строка значит «параметр не задан» — так вела себя прежняя схема. */
function optionalText(raw: string | undefined): string | undefined {
  if (typeof raw !== 'string') return undefined;

  const trimmed = raw.trim();

  return trimmed === '' ? undefined : trimmed;
}

function optionalId(raw: string | undefined): number | undefined {
  const text = optionalText(raw);

  if (text === undefined) return undefined;

  const parsed = Number(text);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return parsed;
}

@Controller('schedule')
export class ScheduleController {
  constructor(@Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository) {}

  @Get()
  async findMany(
    @Query('ownerType') rawOwnerType?: string,
    @Query('clubId') rawClubId?: string,
    @Query('trainerId') rawTrainerId?: string,
    @Query('sportId') rawSportId?: string,
    @Query('date') rawDate?: string,
    @Query('includeFull') includeFull?: string,
  ): Promise<ScheduleSlotWithAvailability[]> {
    const ownerType = optionalText(rawOwnerType);

    if (ownerType !== undefined && !['club', 'trainer', 'all'].includes(ownerType)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const date = optionalText(rawDate);

    if (date !== undefined && !DATE_PATTERN.test(date)) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const clubId = optionalId(rawClubId);
    const trainerId = optionalId(rawTrainerId);
    const sportId = optionalId(rawSportId);

    // Отбор и порядок — целиком в запросе к хранилищу.
    //
    // ⚠️ Раньше здесь стояло пять проходов по массиву и сортировка: маршрут поднимал
    // ВСЕ клубные слоты платформы и выбрасывал почти всё. Девять индексов таблицы
    // расписания при этом не использовались ни разу. Условие ничем не отличается от
    // прежнего — отличается только место, где оно выполняется.
    //
    // `includeFull=true` — по-прежнему необязательный признак «показать и заполненные»:
    // страницам личных кабинетов нужны все слоты. Умолчание прежнее — только со
    // свободными местами.
    const slots = await this.schedule.findMany({
      ownerType: ownerType as CatalogOwnerType | 'all' | undefined,
      clubId,
      trainerId,
      sportId,
      date,
      onlyWithFreeSeats: includeFull !== 'true',
      order: 'dateTime',
    });

    // Число оставшихся мест считается при отображении, а не хранится: денормализовать
    // его значило бы завести второй счётчик, который обязан совпадать с первым.
    return slots.map((slot) => ({
      ...slot,
      availableSpots: slot.capacity - slot.bookedCount,
    }));
  }
}

export const SCHEDULE_CONTROLLERS = [ScheduleController, SlotContextController];
