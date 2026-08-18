// Контроллеры услуг и пользователей.
//
// Оба маршрута новые: страницы читали эти коллекции прямо из слоя данных,
// минуя API. После переезда фронта им нужен собственный маршрут.
//
// ⚠️ Пользователи отдаются без пароля всегда. Пароли лежат открытым текстом,
// и этот маршрут создаётся с нуля — утечка здесь стоила бы дороже всей фазы.

import { Controller, Get, Inject, Query } from "@nestjs/common";
import type { CatalogOwnerType, Offering, User } from "@sporthub/types";

import { ValidationError } from "../common/domain-error";
import type { OfferingsRepository } from "../repositories/catalog.repository";
import { OFFERINGS_REPOSITORY } from "../repositories/catalog.repository";
import type { UsersRepository } from "../repositories/crud.repository";
import { USERS_REPOSITORY } from "../repositories/crud.repository";

/** Пользователь без пароля. Ровно то, что уходит наружу. */
export type SafeUser = Omit<User, "password">;

function stripPassword(user: User): SafeUser {
  const { password: _removed, ...safe } = user;

  return safe;
}

@Controller("offerings")
export class OfferingsController {
  constructor(
    @Inject(OFFERINGS_REPOSITORY)
    private readonly offerings: OfferingsRepository,
  ) {}

  @Get()
  async findMany(
    @Query("ownerType") ownerType?: string,
    @Query("ownerId") ownerId?: string,
  ): Promise<Offering[]> {
    if (ownerType === undefined && ownerId === undefined) {
      return this.offerings.findAll();
    }

    if (ownerType !== "club" && ownerType !== "trainer") {
      throw new ValidationError("Некорректные параметры запроса");
    }

    const parsedOwnerId = Number(ownerId);

    if (!Number.isInteger(parsedOwnerId) || parsedOwnerId <= 0) {
      throw new ValidationError("Некорректные параметры запроса");
    }

    return this.offerings.findMany({
      ownerType: ownerType as CatalogOwnerType,
      ownerId: parsedOwnerId,
    });
  }
}

@Controller("users")
export class UsersController {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  @Get()
  async findAll(): Promise<SafeUser[]> {
    const users = await this.users.findAll();

    return users.map(stripPassword);
  }
}

export const CATALOG_CONTROLLERS = [OfferingsController, UsersController];
