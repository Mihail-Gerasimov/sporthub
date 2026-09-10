// Контроллеры услуг и пользователей.
//
// Оба маршрута новые: страницы читали эти коллекции прямо из слоя данных,
// минуя API. После переезда фронта им нужен собственный маршрут.
//
// ⚠️ Пользователи отдаются без хеша пароля всегда. Phase 33 Step 33.9: поле
// переименовано в `passwordHash`, и вырезать его нужно под новым именем —
// иначе вырезалось бы несуществующее поле, а хеш уходил бы наружу.

import { Controller, Get, Inject, Query } from '@nestjs/common';
import { accountCan, accountKindOf } from '@sporthub/domain';
import type { CatalogOwnerType, Offering, User } from '@sporthub/types';

import { AccessService } from '../access/access.service';
import { CurrentUser, Public } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { ForbiddenError, ValidationError } from '../common/domain-error';
import type { OfferingsRepository } from '../repositories/catalog.repository';
import { OFFERINGS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/** Пользователь без хеша пароля. Ровно то, что уходит наружу. */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Строка админского списка людей: человек плюс число его лиц услуг.
 *
 * ⚠️ Шаг 35.20a, и это не «поле заодно». Админский раздел показывает, ведёт ли
 * человек услуги и сколько у него лиц; до этого шага он считал это САМ —
 * скачивал публичный каталог и сверял `managedByUserId` с номером человека.
 * Поле из публичной выдачи ушло, и считать стало нечем.
 *
 * Почему число приезжает ЗДЕСЬ, а не остаётся условным полем публичного
 * каталога: условная выдача одного маршрута разным людям — это то, на чём
 * ошибаются незаметно. Владельцев админ узнаёт своими маршрутами, а публичный
 * каталог отвечает всем одинаково. Из двух своих маршрутов выбран этот, а не
 * свод модерации `GET /api/publications`: свод постраничный (потолок 100
 * записей за запрос), и счёт по нему тихо разошёлся бы с правдой на сто первой
 * публикации. Здесь же счёт приходит по строке на человека — ровно тем же
 * срезом, который раздел и показывает.
 */
export type AdminUserRow = SafeUser & { serviceFaceCount: number };

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
@Controller('users')
export class UsersController {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly access: AccessService,
  ) {}

  /**
   * Люди площадки.
   *
   * Ширина выдачи зависит от того, кто спрашивает, и это не удобство, а суть:
   *
   * - `?scope=clients` — только СВОИ клиенты, право `manage_own_clients`. Кабинету
   *   провайдера нужны имена тех, кто к нему записывался, и ничего сверх;
   * - без признака — весь список, право `manage_any_user`. Он отдаёт почты
   *   и телефоны всех зарегистрированных, и до фазы 34 делал это анонимно.
   *
   * ⚠️ Режим клиентов появился не «заодно». Закрыв маршрут целиком, фаза уронила
   * кабинет провайдера: страницы заявок и клиентов отвечали пятисоткой, потому что
   * подписывали атлета именем. Нашлось на поднятом приложении — тесты этого не ловили.
   *
   * ⚠️ Шаг 35.20a. Форма ответа зависит от НАЗВАННОГО среза, а не от того, кто
   * спрашивает: полный список людей несёт число лиц услуг (`serviceFaceCount`),
   * список своих клиентов — нет. Это разные вещи под одним адресом, и путать их
   * нельзя: провайдеру знать, сколько лиц у его клиента, незачем, а лишний
   * запрос-группировка на каждой странице кабинета не бесплатен.
   */
  @Get()
  async findMany(
    @CurrentUser() session: SessionContext,
    @Query('scope') scope?: string,
  ): Promise<SafeUser[] | AdminUserRow[]> {
    if (scope === 'clients') {
      // ⚠️ Шаг 35.19b. Клиенты — это владение, а не право роли: они есть у того,
      // у кого есть лица услуг. Но отказ обязан остаться отказом: «нет лиц» — это
      // 403, а не пустой список. Пустой ответ вместо отказа читается как «клиентов
      // пока нет» и прячет то, что спрашивать было нечего.
      const owners = await this.access.getManagedPublicationIds(session.user.id);

      if (owners.clubIds.length + owners.trainerIds.length === 0) {
        throw new ForbiddenError('Недостаточно прав');
      }

      const clients = await this.users.findClientsOf(owners);

      // ⚠️ Шаг 35.13, точка 10. Себя в собственном списке клиентов быть не должно.
      // Записавшись на своё же занятие (решение 16 это разрешает), человек попадал
      // в собственную клиентскую базу — со своей почтой и телефоном, — и мог завести
      // заметку сам о себе. Отбор идёт по номеру, а не по правилу «сам себе»:
      // здесь сравнивать нечего, обе стороны уже известны.
      return clients.filter((client) => client.id !== session.user.id).map(stripPasswordHash);
    }

    if (!accountCan(accountKindOf(session.user), 'manage_any_user')) {
      throw new ForbiddenError('Недостаточно прав');
    }

    // Число лиц считает база одной группировкой на всю выдачу — не по запросу
    // на человека и не чтением каталога целиком.
    const [users, faceCounts] = await Promise.all([
      this.users.findAll(),
      this.access.countServiceFacesByUser(),
    ]);

    return users.map((user) => ({
      ...stripPasswordHash(user),
      serviceFaceCount: faceCounts.get(user.id) ?? 0,
    }));
  }
}

export const CATALOG_CONTROLLERS = [OfferingsController, UsersController];
