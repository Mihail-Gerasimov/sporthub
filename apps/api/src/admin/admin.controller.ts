import { accountKindOf } from '@sporthub/domain';
// Административные маршруты.
//
// Каждый проверяет роль администратора по хранилищу, а не по слову клиента, —
// это единственная группа маршрутов, где проверка личности действительно есть.
// Пересчёт надёжности ничего не считает: расчёт живёт на стороне страниц,
// маршрут оставлен как точка приложения для будущего кэша и пишет только запись
// в журнал.

import {
  Body,
  Controller,
  Delete,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
} from '@nestjs/common';
import type { TrainerClubLink } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { BookingService } from '../bookings/booking.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { NotFoundError, ValidationError } from '../common/domain-error';
import { hashPassword } from '../common/password';
import { CurrentUser, Requires } from '../auth/access.decorators';
import type { SessionContext } from '../auth/session.service';
import { LinkService } from '../links/link.service';
import { LogService } from '../logs/log.service';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

const passwordSchema = z
  .object({ newPassword: z.string().min(6, 'Пароль — минимум 6 символов') })
  .strict();

function parseId(raw: string, message: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(message);
  }

  return parsed;
}

// Весь раздел — служебные действия платформы, и право у них одно на всех.
// Пометка стоит на классе, а не на каждом методе: маршрут, добавленный сюда завтра,
// окажется под тем же правом сам.
@Requires('use_admin_tools')
@Controller('admin')
export class AdminController {
  constructor(
    private readonly bookingService: BookingService,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly access: AccessService,
    private readonly links: LinkService,
    private readonly logs: LogService,
  ) {}

  @Delete('bookings/:id')
  async hardDeleteBooking(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const bookingId = parseId(rawId, 'Некорректный id записи');

    // Удаление и освобождение места делает сервис записей — одной операцией.
    await this.bookingService.hardDelete(bookingId);

    await this.logs.record({
      action: 'admin_hard_delete_booking',
      // Роль — из сессии, как и номер. Здесь это всегда администратор, и именно
      // поэтому константа была особенно вредна: она выглядела верной и потому
      // расходилась бы с действительностью молча.
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'booking',
      entityId: bookingId,
    });

    return EMPTY_RESULT;
  }

  @Post('trainer-club-links/:id/force-revoke')
  @HttpCode(HttpStatus.OK)
  async forceRevokeLink(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<TrainerClubLink> {
    const linkId = parseId(rawId, 'Некорректный id связи');
    const { link, detachedCount } = await this.links.forceRevoke(linkId, session.actor.id);

    await this.logs.record({
      action: 'link_revoke',
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: {
        trainerId: link.trainerId,
        clubId: link.clubId,
        revokedBy: 'admin',
        detachedCount,
        forced: true,
      },
    });

    return link;
  }

  @Post('users/:id/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const targetUserId = parseId(rawId, 'Некорректный id пользователя');
    const parsed = passwordSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Некорректные данные запроса');
    }

    // ⚠️ Шаг 37.25. Найденный человек НЕ выбрасывается: он нужен строке журнала.
    // Прежде здесь стояло `if (!(await this.users.findById(...)))` — результат
    // проверялся и терялся, а `meta` уходила пустой. Второго запроса за теми же
    // данными не делаем: событие обязано называть человека, а не его номер.
    const target = await this.users.findById(targetUserId);

    if (!target) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Phase 33 Step 33.9: в хранилище уходит argon2id-хеш, а не сам пароль.
    // Текущий пароль администратору не нужен — действие админское и пишется
    // в журнал.
    await this.users.update(targetUserId, {
      passwordHash: await hashPassword(parsed.data.newPassword),
    });

    // Ни пароль, ни его хеш в журнал не попадают — только факт смены и то, кому
    // и кем она сделана.
    //
    // ⚠️ Почта пишется открыто — ровно так же, как в соседней записи журнала
    // `admin_impersonate_start` (`auth.controller.ts`, `meta.targetEmail`).
    // Хешировать её здесь значило бы завести ВТОРОЙ порядок хранения одного
    // и того же поля и сделать след нечитаемым для того единственного, ради кого
    // он ведётся: журнал открыт только администратору, и опознать человека
    // по хешу он не сможет. Имя и почта — то, чем человек назван в админке.
    await this.logs.record({
      action: 'admin_password_change',
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'user',
      entityId: targetUserId,
      meta: {
        targetUserId: target.id,
        targetName: target.name,
        targetEmail: target.email,
        // Исполнитель уже стоит в `actorId`, но событие читают и выгрузкой `meta`
        // отдельно от строки — пусть отвечает на «кем» само.
        changedByUserId: session.actor.id,
      },
    });

    return EMPTY_RESULT;
  }

  @Post('users/:id/recompute-reliability')
  @HttpCode(HttpStatus.OK)
  async recomputeReliability(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<EmptyResult> {
    const userId = parseId(rawId, 'Некорректный id пользователя');

    if (!(await this.users.findById(userId))) {
      throw new NotFoundError('Пользователь не найден');
    }

    await this.logs.record({
      action: 'reliability_recompute',
      actorId: session.actor.id,
      actorRole: accountKindOf(session.actor),
      entityType: 'user',
      entityId: userId,
    });

    return EMPTY_RESULT;
  }
}

export const ADMIN_CONTROLLERS = [AdminController];
