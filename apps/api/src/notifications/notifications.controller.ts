// Контроллеры уведомлений.
//
// ⚠️ Счётчики здесь лежат ВНУТРИ `data` — `{ items, total, unreadCount }`, тогда
// как журнал и публикации кладут `total` рядом с `data`. Две разные формы ответа
// на соседних маршрутах, обе закреплены фронтом.
//
// Настройки пользователя применяются при чтении, а не при создании: выключенный
// тип продолжает писаться в хранилище, но не показывается и не считается.
//
// Раньше эти настройки и мешали переносу: отбор по ним стоял ПОСЛЕ чтения ленты,
// а значит ни постраничность, ни счётчик непрочитанных не могли уехать в запрос —
// срез по набору, отфильтрованному в памяти, `LIMIT`ом не выражается. Теперь правило
// домена сначала превращается в СПИСОК отключённых типов (для этого достаточно
// одного чтения пользователя), а список — в обычное условие запроса. Репозиторий
// при этом по-прежнему не знает ни про настройки, ни про обязательные типы.

import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Query,
} from '@nestjs/common';
import { isNotificationTypeEnabled } from '@sporthub/domain';
import type { Notification, NotificationType } from '@sporthub/types';
import { z } from 'zod';

import { NotFoundError, ValidationError } from '../common/domain-error';
import type { NotificationsRepository } from '../repositories/catalog.repository';
import { NOTIFICATIONS_REPOSITORY } from '../repositories/catalog.repository';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/** Верхняя граница страницы. Больше сотни маршрут не отдаёт никогда. */
const MAX_LIMIT = 100;

const userIdSchema = z.object({ userId: z.number().int().positive() }).strict();

const deleteSchema = z.object({
  userId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1),
});

function requiredUserId(raw: string | undefined): number {
  if (raw === undefined || !/^\d+$/.test(raw)) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return Number(raw);
}

function optionalNumber(raw: string | undefined): number | undefined {
  if (raw === undefined) return undefined;

  if (!/^\d+$/.test(raw)) {
    throw new ValidationError('Некорректные параметры запроса');
  }

  return Number(raw);
}

@Controller('notifications')
export class NotificationsController {
  constructor(
    @Inject(NOTIFICATIONS_REPOSITORY) private readonly notifications: NotificationsRepository,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
  ) {}

  @Get()
  async findMany(
    @Query('userId') rawUserId?: string,
    @Query('unreadOnly') unreadOnly?: string,
    @Query('offset') rawOffset?: string,
    @Query('limit') rawLimit?: string,
    @Query('scope') scope?: string,
  ): Promise<{ items: Notification[]; total: number; unreadCount: number }> {
    // Полный срез без разбора адресата: нужен сводкам личного кабинета
    // провайдера. Настройки пользователя к нему не применяются — они
    // персональные, а здесь смешаны уведомления разных людей.
    //
    // ⚠️ Единственное место в этом файле, где чтение осталось полным, и убрать его
    // правкой контроллера нельзя: маршрут по контракту отдаёт всю ленту целиком,
    // а считать длину уже прочитанного массива дешевле, чем спрашивать базу второй
    // раз. Закрывается только вместе с потребителем — сводками кабинета провайдера.
    if (scope === 'all') {
      const all = await this.notifications.findMany({});

      return {
        items: all,
        total: all.length,
        unreadCount: all.filter((item) => item.readAt === undefined).length,
      };
    }

    const userId = requiredUserId(rawUserId);
    const onlyUnread = unreadOnly === 'true' || unreadOnly === '1';
    const offset = optionalNumber(rawOffset) ?? 0;
    const rawLimitValue = optionalNumber(rawLimit);
    const limit =
      rawLimitValue !== undefined && rawLimitValue > MAX_LIMIT ? MAX_LIMIT : rawLimitValue;

    const excludeTypes = await this.disabledTypes(userId);

    // Страница, общее число и непрочитанные — тремя запросами и параллельно.
    // Прежде это была ОДНА лента, прочитанная целиком и порезанная срезом массива,
    // плюс вторая такая же ради счётчика непрочитанных.
    const [items, total, unreadCount] = await Promise.all([
      this.notifications.findMany({
        userId,
        unreadOnly: onlyUnread,
        excludeTypes,
        offset,
        ...(limit === undefined ? {} : { limit }),
      }),
      this.notifications.count({ userId, unreadOnly: onlyUnread, excludeTypes }),
      this.notifications.count({ userId, unreadOnly: true, excludeTypes }),
    ]);

    return { items, total, unreadCount };
  }

  @Get('unread-count')
  async unreadCount(@Query('userId') rawUserId?: string): Promise<{ unreadCount: number }> {
    const userId = requiredUserId(rawUserId);
    const excludeTypes = await this.disabledTypes(userId);

    return {
      unreadCount: await this.notifications.count({ userId, unreadOnly: true, excludeTypes }),
    };
  }

  @Post('read-all')
  @HttpCode(HttpStatus.OK)
  async readAll(@Body() rawBody: unknown): Promise<{ updatedCount: number }> {
    const parsed = userIdSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    const updatedCount = await this.notifications.markAllRead(parsed.data.userId);

    return { updatedCount };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.OK)
  async markRead(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<Notification> {
    const notificationId = Number(rawId);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      throw new ValidationError('Некорректный id уведомления');
    }

    const parsed = userIdSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    // Чужое уведомление отвечает тем же «не найдено», что и несуществующее:
    // иначе по коду ответа можно было бы перебирать чужие идентификаторы.
    // Настройки здесь НЕ применяются: пометить прочитанным можно и скрытое.
    //
    // Принадлежность проверяет запрос по одному номеру, а не чтение всей ленты
    // пользователя ради поиска в ней одной строки.
    const owned = await this.notifications.count({
      userId: parsed.data.userId,
      ids: [notificationId],
    });

    if (owned === 0) {
      throw new NotFoundError('Уведомление не найдено');
    }

    return this.notifications.markRead(notificationId);
  }

  @Delete()
  async remove(@Body() rawBody: unknown): Promise<{ deleted: number }> {
    const parsed = deleteSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректное тело запроса');
    }

    // Спрашивается только про названные номера, а не про всю ленту пользователя:
    // чужие среди них просто не вернутся.
    const own = await this.notifications.findMany({
      userId: parsed.data.userId,
      ids: parsed.data.ids,
    });
    // Чужие идентификаторы отбрасываются молча — в ответе видно только
    // фактическое число удалённого.
    const deleted = await this.notifications.removeMany(own.map((item) => item.id));

    return { deleted };
  }

  /**
   * Типы, которые пользователь у себя выключил.
   *
   * Правило «включён ли тип» живёт в домене и знает про обязательные типы, которые
   * отключить нельзя. Здесь оно применяется к тем типам, про которые у пользователя
   * вообще есть решение, и превращается в список для условия запроса. Пользователя
   * нет — списка нет: лента показывается целиком, как и раньше.
   */
  private async disabledTypes(userId: number): Promise<string[]> {
    const user = await this.users.findById(userId);
    const preferences = user?.notificationPreferences;

    if (!user || !preferences) return [];

    return (Object.keys(preferences) as NotificationType[]).filter(
      (type) => !isNotificationTypeEnabled(user, type),
    );
  }
}

export const NOTIFICATION_CONTROLLERS = [NotificationsController];
