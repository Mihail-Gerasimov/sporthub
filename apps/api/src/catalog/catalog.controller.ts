// Контроллеры услуг и пользователей.
//
// Оба маршрута новые: страницы читали эти коллекции прямо из слоя данных,
// минуя API. После переезда фронта им нужен собственный маршрут.
//
// ⚠️ Пользователи отдаются без хеша пароля всегда. Phase 33 Step 33.9: поле
// переименовано в `passwordHash`, и вырезать его нужно под новым именем —
// иначе вырезалось бы несуществующее поле, а хеш уходил бы наружу.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import type { CatalogOwnerType, Offering, User } from '@sporthub/types';

import { Public, Requires } from '../auth/access.decorators';
import { ValidationError } from '../common/domain-error';
import type { OfferingsRepository } from '../repositories/catalog.repository';
import { OFFERINGS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/** Пользователь без хеша пароля. Ровно то, что уходит наружу. */
export type SafeUser = Omit<User, 'passwordHash'>;

function stripPasswordHash(user: User): SafeUser {
  const { passwordHash: _removed, ...safe } = user;

  return safe;
}

// Пометка на классе: у контроллера услуг единственный маршрут, и он публичный.
// Услуги — это цены и описания занятий в карточках клубов и тренеров; гость
// обязан видеть, за чем идёт и сколько это стоит, ещё до регистрации.
@Public()
@Controller('offerings')
export class OfferingsController {
  constructor(
    @Inject(OFFERINGS_REPOSITORY)
    private readonly offerings: OfferingsRepository,
  ) {}

  @Get()
  async findMany(
    @Query('ownerType') ownerType?: string,
    @Query('ownerId') ownerId?: string,
  ): Promise<Offering[]> {
    if (ownerType === undefined && ownerId === undefined) {
      return this.offerings.findAll();
    }

    if (ownerType !== 'club' && ownerType !== 'trainer') {
      throw new ValidationError('Некорректные параметры запроса');
    }

    const parsedOwnerId = Number(ownerId);

    if (!Number.isInteger(parsedOwnerId) || parsedOwnerId <= 0) {
      throw new ValidationError('Некорректные параметры запроса');
    }

    return this.offerings.findMany({
      ownerType: ownerType as CatalogOwnerType,
      ownerId: parsedOwnerId,
    });
  }
}

// Список пользователей площадки — служебное чтение, и право у него админское.
//
// До фазы 34 маршрут отдавал почты и телефоны ВСЕХ зарегистрированных любому,
// кто попросит: ни сессии, ни роли он не спрашивал. Публичные страницы тоже
// им пользовались — им нужно было подписать автора отзыва, — и это чинится
// отдельно: имя автора приезжает прямо в ответе отзывов (шаг 34.31).
@Requires('manage_any_user')
@Controller('users')
export class UsersController {
  constructor(@Inject(USERS_REPOSITORY) private readonly users: UsersRepository) {}

  @Get()
  async findAll(): Promise<SafeUser[]> {
    const users = await this.users.findAll();

    return users.map(stripPasswordHash);
  }
}

export const CATALOG_CONTROLLERS = [OfferingsController, UsersController];
