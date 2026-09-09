// Учётные данные пользователя и настройки уведомлений.
//
// Правка только своих данных: идентификатор в теле обязан совпасть с адресом.
// Полноценной проверки сессии нет — тело запроса и есть единственный источник
// личности, и это записано в долгах фазы.
//
// Phase 33 Step 33.9: в хранилище лежит argon2id-хеш, а не сам пароль.
// Ответ всё равно очищается от него: хеш наружу не отдаётся никогда — он
// пригоден для перебора офлайн, и «это же не пароль» тут не оправдание.

import { Body, Controller, Get, Inject, Param, Patch, Req } from '@nestjs/common';
import { REQUIRED_NOTIFICATION_TYPES } from '@sporthub/domain';
import type { NotificationType, User } from '@sporthub/types';
import type { Request } from 'express';
import { z } from 'zod';

import {
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../common/domain-error';
import { hashPassword, verifyPassword } from '../common/password';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';
import { readSessionCookie } from '../auth/session-cookie';
import { SessionService } from '../auth/session.service';

/** Тот же формат телефона, что и в формах публикации. */
const PHONE_PATTERN = /^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;

const patchSchema = z
  .object({
    userId: z.number().int().positive(),
    phone: z.string().trim().regex(PHONE_PATTERN, 'Некорректный формат телефона').optional(),
    password: z.string().min(6, 'Пароль — минимум 6 символов').optional(),
    currentPassword: z.string().optional(),
  })
  .refine((value) => value.phone !== undefined || value.password !== undefined, {
    message: 'Нечего обновлять',
  })
  .refine(
    (value) => value.password === undefined || (value.currentPassword?.trim().length ?? 0) > 0,
    { message: 'Для смены пароля нужен текущий пароль', path: ['currentPassword'] },
  );

const preferencesSchema = z
  .object({
    userId: z.number().int().positive(),
    preferences: z.record(z.string(), z.boolean()),
  })
  .strict();

/** Пользователь без хеша пароля. Ровно то, что уходит наружу. */
export type SafeUser = Omit<User, 'passwordHash'>;

/**
 * Убрать хеш пароля из ответа. Имя поля здесь обязано совпадать с типом:
 * если оно разойдётся, вырезаться будет несуществующее поле, а хеш утечёт
 * молча. От этого страхует сторож `password-leak.test.ts`.
 */
function stripPasswordHash(user: User): SafeUser {
  const { passwordHash: _removed, ...safe } = user;

  return safe;
}

function parseUserId(raw: string, message: string): number {
  const parsed = Number(raw);

  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new ValidationError(message);
  }

  return parsed;
}

@Controller('users')
export class UserAccountController {
  constructor(
    @Inject(USERS_REPOSITORY) private readonly users: UsersRepository,
    private readonly sessions: SessionService,
  ) {}

  @Patch(':id')
  async update(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @Req() request: Request,
  ): Promise<SafeUser> {
    const targetUserId = parseUserId(rawId, 'Некорректный id пользователя');
    const parsed = patchSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Некорректное тело запроса');
    }

    const { userId, phone, password, currentPassword } = parsed.data;

    if (userId !== targetUserId) {
      throw new ForbiddenError('Изменять можно только свои данные');
    }

    const user = await this.users.findById(targetUserId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    if (password !== undefined) {
      // Сверка идёт через проверку хеша: сравнивать строки больше не с чем.
      // Пробелы по краям режутся так же, как резались до перехода на хеш, —
      // поведение формы не меняется.
      const matches = await verifyPassword(user.passwordHash ?? '', (currentPassword ?? '').trim());

      if (!matches) {
        throw new UnauthorizedError('Неверный текущий пароль');
      }
    }

    const patch: Partial<Pick<User, 'phone' | 'passwordHash'>> = {};

    if (phone !== undefined) patch.phone = phone;
    if (password !== undefined) patch.passwordHash = await hashPassword(password);

    const updated = await this.users.update(targetUserId, patch);

    // Смена пароля гасит ОСТАЛЬНЫЕ сессии пользователя.
    //
    // Иначе смена пароля не спасает от того, ради чего её меняют: сессия, открытая
    // тем, кто пароль подсмотрел, продолжала бы работать до собственного срока.
    // Текущая сессия остаётся живой — иначе человек, сменивший пароль, вылетал бы
    // из системы в момент смены.
    if (password !== undefined) {
      const now = new Date();
      const token = readSessionCookie(request);
      const current = token === null ? null : await this.sessions.findLiveByToken(token, now);

      if (current === null) await this.sessions.revokeAll(targetUserId, now);
      else await this.sessions.revokeOthers(targetUserId, current.id, now);
    }

    return stripPasswordHash(updated);
  }

  @Get(':id/notification-preferences')
  async readPreferences(
    @Param('id') rawId: string,
  ): Promise<{ notificationPreferences: Partial<Record<NotificationType, boolean>> }> {
    const targetId = parseUserId(rawId, 'Некорректный id');
    const user = await this.users.findById(targetId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    return { notificationPreferences: user.notificationPreferences ?? {} };
  }

  @Patch(':id/notification-preferences')
  async updatePreferences(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
  ): Promise<{ notificationPreferences: Partial<Record<NotificationType, boolean>> }> {
    const targetId = parseUserId(rawId, 'Некорректный id');
    const parsed = preferencesSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    if (parsed.data.userId !== targetId) {
      throw new ForbiddenError('Недостаточно прав для редактирования чужих настроек');
    }

    const user = await this.users.findById(targetId);

    if (!user) {
      throw new NotFoundError('Пользователь не найден');
    }

    // Обязательные типы отбрасываются молча: отключить их нельзя,
    // но и ошибкой попытка не считается.
    const sanitized: Partial<Record<NotificationType, boolean>> = {};

    for (const [key, value] of Object.entries(parsed.data.preferences)) {
      if (REQUIRED_NOTIFICATION_TYPES.includes(key as NotificationType)) continue;

      sanitized[key as NotificationType] = value;
    }

    const updated = await this.users.update(targetId, { notificationPreferences: sanitized });

    return { notificationPreferences: updated.notificationPreferences ?? {} };
  }
}

export const USER_ACCOUNT_CONTROLLERS = [UserAccountController];
