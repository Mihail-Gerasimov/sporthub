// Контроллер расписания.
//
// ⚠️ Маршрут отдаёт только слоты со свободными местами: фильтр
// `bookedCount < capacity` стоит раньше расчёта `availableSpots`, поэтому
// заполненный слот исчезает из выдачи целиком. Страницы личных кабинетов
// поэтому читали слой данных напрямую — им нужны и заполненные слоты.
// Поведение маршрута сохранено дословно, добор для страниц сделан отдельно.

import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { CatalogOwnerType, Schedule } from "@sporthub/types";

import { ValidationError } from "../common/domain-error";
import type { ScheduleRepository } from "../repositories/entities.repository";
import { SCHEDULE_REPOSITORY } from "../repositories/entities.repository";

/** Слот с числом оставшихся мест — форма ответа маршрута. */
export type ScheduleSlotWithAvailability = Schedule & {
  availableSpots: number;
};

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

/** Пустая строка значит «параметр не задан» — так вела себя прежняя схема. */
function optionalText(raw: string | undefined): string | undefined {
  if (typeof raw !== "string") return undefined;

  const trimmed = raw.trim();

  return trimmed === "" ? undefined : trimmed;
}

function optionalId(raw: string | undefined): number | undefined {
  const text = optionalText(raw);

  if (text === undefined) return undefined;

  const parsed = Number(text);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError("Некорректные параметры запроса");
  }

  return parsed;
}

@Controller("schedule")
export class ScheduleController {
  constructor(
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
  ) {}

  @Get()
  async findMany(
    @Query("ownerType") rawOwnerType?: string,
    @Query("clubId") rawClubId?: string,
    @Query("trainerId") rawTrainerId?: string,
    @Query("sportId") rawSportId?: string,
    @Query("date") rawDate?: string,
  ): Promise<ScheduleSlotWithAvailability[]> {
    const ownerType = optionalText(rawOwnerType);

    if (
      ownerType !== undefined &&
      !["club", "trainer", "all"].includes(ownerType)
    ) {
      throw new ValidationError("Некорректные параметры запроса");
    }

    const date = optionalText(rawDate);

    if (date !== undefined && !DATE_PATTERN.test(date)) {
      throw new ValidationError("Некорректные параметры запроса");
    }

    const clubId = optionalId(rawClubId);
    const trainerId = optionalId(rawTrainerId);
    const sportId = optionalId(rawSportId);

    let slots = await this.schedule.findMany({
      ownerType: ownerType as CatalogOwnerType | "all" | undefined,
    });

    slots = slots.filter((slot) => slot.bookedCount < slot.capacity);

    if (clubId !== undefined) {
      slots = slots.filter((slot) => slot.clubId === clubId);
    }

    if (trainerId !== undefined) {
      slots = slots.filter((slot) => slot.trainerId === trainerId);
    }

    if (sportId !== undefined) {
      slots = slots.filter((slot) => slot.sportId === sportId);
    }

    if (date !== undefined) {
      slots = slots.filter((slot) => slot.date === date);
    }

    return slots
      .map((slot) => ({
        ...slot,
        availableSpots: slot.capacity - slot.bookedCount,
      }))
      .sort((left, right) =>
        `${left.date}T${left.startTime}`.localeCompare(
          `${right.date}T${right.startTime}`,
        ),
      );
  }
}

export const SCHEDULE_CONTROLLERS = [ScheduleController];
