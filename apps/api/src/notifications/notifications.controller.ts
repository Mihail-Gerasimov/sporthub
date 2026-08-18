// Контроллеры уведомлений.
//
// ⚠️ Счётчики здесь лежат ВНУТРИ `data` — `{ items, total, unreadCount }`, тогда
// как журнал и публикации кладут `total` рядом с `data`. Две разные формы ответа
// на соседних маршрутах, обе закреплены фронтом.
//
// Настройки пользователя применяются при чтении, а не при создании: выключенный
// тип продолжает писаться в хранилище, но не показывается и не считается.

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
import type { Notification } from '@sporthub/types';
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

    const [all, unread] = await Promise.all([
      this.allowed(userId, { unreadOnly: onlyUnread }),
      this.allowed(userId, { unreadOnly: true }),
    ]);

    const items = limit === undefined ? all.slice(offset) : all.slice(offset, offset + limit);

    return { items, total: all.length, unreadCount: unread.length };
  }

  @Get('unread-count')
  async unreadCount(@Query('userId') rawUserId?: string): Promise<{ unreadCount: number }> {
    const userId = requiredUserId(rawUserId);
    const unread = await this.allowed(userId, { unreadOnly: true });

    return { unreadCount: unread.length };
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
    const own = await this.notifications.findMany({ userId: parsed.data.userId });

    if (!own.some((item) => item.id === notificationId)) {
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

    const own = await this.notifications.findMany({ userId: parsed.data.userId });
    const ownIds = new Set(own.map((item) => item.id));
    // Чужие идентификаторы отбрасываются молча — в ответе видно только
    // фактическое число удалённого.
    const deleted = await this.notifications.removeMany(
      parsed.data.ids.filter((id) => ownIds.has(id)),
    );

    return { deleted };
  }

  /** Уведомления пользователя с учётом его настроек. */
  private async allowed(userId: number, filter: { unreadOnly?: boolean }): Promise<Notification[]> {
    const [items, user] = await Promise.all([
      this.notifications.findMany({ userId, unreadOnly: filter.unreadOnly }),
      this.users.findById(userId),
    ]);

    if (!user) return items;

    return items.filter((item) => isNotificationTypeEnabled(user, item.type));
  }
}

export const NOTIFICATION_CONTROLLERS = [NotificationsController];
