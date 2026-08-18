// Тонкий доступ к данным для контроллера записей.
//
// Контроллеру нужны точечные чтения (найти запись, пользователя, слот), но
// внедрять в него пять репозиториев значило бы размазать зависимости.
// Этот класс собирает их в одном месте и отдаёт ровно то, что нужно маршрутам.

import { Inject, Injectable } from "@nestjs/common";
import type { Booking, Schedule, User } from "@sporthub/types";

import type { BookingsRepository } from "../repositories/bookings.repository";
import { BOOKINGS_REPOSITORY } from "../repositories/bookings.repository";
import type { UsersRepository } from "../repositories/crud.repository";
import { USERS_REPOSITORY } from "../repositories/crud.repository";
import type { ScheduleRepository } from "../repositories/entities.repository";
import { SCHEDULE_REPOSITORY } from "../repositories/entities.repository";

@Injectable()
export class BookingsGateway {
  constructor(
    @Inject(BOOKINGS_REPOSITORY) private readonly bookings: BookingsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    @Inject(SCHEDULE_REPOSITORY) private readonly schedule: ScheduleRepository,
  ) {}

  findAll(): Promise<Booking[]> {
    return this.bookings.findAll();
  }

  findById(id: number): Promise<Booking | null> {
    return this.bookings.findById(id);
  }

  findByUser(userId: number): Promise<Booking[]> {
    return this.bookings.findMany({ userId });
  }

  findUser(userId: number): Promise<User | null> {
    return this.users.findById(userId);
  }

  findSlot(scheduleId: number): Promise<Schedule | null> {
    return this.schedule.findById(scheduleId);
  }
}
