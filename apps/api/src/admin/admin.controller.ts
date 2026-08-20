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
import type { TrainerClubLink, User } from '@sporthub/types';
import { z } from 'zod';

import { AccessService } from '../access/access.service';
import { BookingService } from '../bookings/booking.service';
import { EMPTY_RESULT, type EmptyResult } from '../common/api-response';
import { ForbiddenError, NotFoundError, ValidationError } from '../common/domain-error';
import { hashPassword } from '../common/password';
import { LinkService } from '../links/link.service';
import { LogService } from '../logs/log.service';
import { NotificationService } from '../notifications/notification.service';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

const adminSchema = z.object({ adminUserId: z.number().int().positive() }).strict();

const passwordSchema = z
  .object({
    adminUserId: z.number().int().positive(),
    newPassword: z.string().min(6, 'Пароль — минимум 6 символов'),
  })
  .strict();

function parseId(raw: string, message: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(message);
  }

  return parsed;
}

@Controller('admin')
export class AdminController {
  constructor(
    private readonly bookingService: BookingService,
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly access: AccessService,
    private readonly links: LinkService,
    private readonly logs: LogService,
    private readonly notifications: NotificationService,
  ) {}

  @Delete('bookings/:id')
  async hardDeleteBooking(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
  ): Promise<EmptyResult> {
    const bookingId = parseId(rawId, 'Некорректный id записи');
    const adminUserId = await this.requireAdmin(rawBody);

    // Удаление и освобождение места делает сервис записей — одной операцией.
    await this.bookingService.hardDelete(bookingId);

    await this.logs.record({
      action: 'admin_hard_delete_booking',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'booking',
      entityId: bookingId,
    });

    return EMPTY_RESULT;
  }

  @Post('trainer-club-links/:id/force-revoke')
  @HttpCode(HttpStatus.OK)
  async forceRevokeLink(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
  ): Promise<TrainerClubLink> {
    const linkId = parseId(rawId, 'Некорректный id связи');
    const adminUserId = await this.requireAdmin(rawBody);
    const { link, detachedCount } = await this.links.forceRevoke(linkId, adminUserId);

    await this.logs.record({
      action: 'link_revoke',
      actorId: adminUserId,
      actorRole: 'admin',
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

  @Post('users/:id/lift-quarantine')
  @HttpCode(HttpStatus.OK)
  async liftQuarantine(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
  ): Promise<{ quarantineLiftedAt: string | undefined }> {
    const userId = parseId(rawId, 'Некорректный id пользователя');
    const adminUserId = await this.requireAdmin(rawBody);
    const user = await this.users.findById(userId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    const updated = await this.users.update(userId, {
      quarantineLiftedAt: new Date().toISOString(),
      // Метка снимается, чтобы следующий карантин снова дал уведомление о начале.
      notifiedQuarantineUntil: undefined,
    } as Partial<User>);

    await this.notifications.notify(userId, 'quarantine_lifted_by_admin', {});

    await this.logs.record({
      action: 'quarantine_admin_lift',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'user',
      entityId: userId,
      meta: { quarantineLiftedAt: updated.quarantineLiftedAt },
    });

    return { quarantineLiftedAt: updated.quarantineLiftedAt };
  }

  @Post('users/:id/password')
  @HttpCode(HttpStatus.OK)
  async changePassword(@Param('id') rawId: string, @Body() rawBody: unknown): Promise<EmptyResult> {
    const targetUserId = parseId(rawId, 'Некорректный id пользователя');
    const parsed = passwordSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Некорректные данные запроса');
    }

    await this.assertAdmin(parsed.data.adminUserId);

    if (!(await this.users.findById(targetUserId))) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Phase 33 Step 33.9: в хранилище уходит argon2id-хеш, а не сам пароль.
    // Текущий пароль администратору не нужен — действие админское и пишется
    // в журнал.
    await this.users.update(targetUserId, {
      passwordHash: await hashPassword(parsed.data.newPassword),
    });

    // Ни пароль, ни его хеш в журнал не попадают — только факт смены.
    await this.logs.record({
      action: 'admin_password_change',
      actorId: parsed.data.adminUserId,
      actorRole: 'admin',
      entityType: 'user',
      entityId: targetUserId,
      meta: {},
    });

    return EMPTY_RESULT;
  }

  @Post('users/:id/recompute-reliability')
  @HttpCode(HttpStatus.OK)
  async recomputeReliability(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
  ): Promise<EmptyResult> {
    const userId = parseId(rawId, 'Некорректный id пользователя');
    const adminUserId = await this.requireAdmin(rawBody);

    if (!(await this.users.findById(userId))) {
      throw new NotFoundError('Пользователь не найден');
    }

    await this.logs.record({
      action: 'reliability_recompute',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'user',
      entityId: userId,
    });

    return EMPTY_RESULT;
  }

  // --- Внутреннее ---------------------------------------------------------------

  private async requireAdmin(rawBody: unknown): Promise<number> {
    const parsed = adminSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    await this.assertAdmin(parsed.data.adminUserId);

    return parsed.data.adminUserId;
  }

  private async assertAdmin(adminUserId: number): Promise<void> {
    if (!(await this.access.isAdmin(adminUserId))) {
      throw new ForbiddenError('Действие доступно только администратору');
    }
  }
}

export const ADMIN_CONTROLLERS = [AdminController];
