// Учётные данные пользователя и настройки уведомлений.
//
// Правка только своих данных. Кто именно правит — известно из серверной сессии.
//
// Phase 34 Step 34.26: до этого «владелец» определялся сравнением `userId` из тела
// с номером в адресе, то есть клиент сам сообщал, кто он, — а чтение настроек
// не проверялось вовсе и отдавало настройки любого пользователя по его номеру.
// Теперь личность приходит только из сессии, и поля `userId` в теле нет.
//
// Phase 33 Step 33.9: в хранилище лежит argon2id-хеш, а не сам пароль.
// Ответ всё равно очищается от него: хеш наружу не отдаётся никогда — он
// пригоден для перебора офлайн, и «это же не пароль» тут не оправдание.

import { Body, Controller, Get, Inject, Param, Patch } from '@nestjs/common';
import { REQUIRED_NOTIFICATION_TYPES } from '@sporthub/domain';
import type { NotificationType, User } from '@sporthub/types';
import { z } from 'zod';

import { CurrentUser } from '../auth/access.decorators';
import { SessionService, type SessionContext } from '../auth/session.service';
import { ForbiddenError, UnauthorizedError, ValidationError } from '../common/domain-error';
import { hashPassword, verifyPassword } from '../common/password';
import type { UsersRepository } from '../repositories/crud.repository';
import { USERS_REPOSITORY } from '../repositories/crud.repository';

/** Тот же формат телефона, что и в формах публикации. */
const PHONE_PATTERN = /^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;

// ⚠️ Поля `userId` в схемах тела нет и быть не должно: это личность, а личность
// приходит из сессии. Строгость схем оставлена такой, какой была: правка учётных
// данных лишние поля молча отбрасывает, настройки уведомлений — отвергают запрос.
const patchSchema = z
  .object({
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

const preferencesSchema = z.object({ preferences: z.record(z.string(), z.boolean()) }).strict();

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
    @CurrentUser() session: SessionContext,
  ): Promise<SafeUser> {
    const targetUserId = parseUserId(rawId, 'Некорректный id пользователя');
    const parsed = patchSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError(parsed.error.issues[0]?.message ?? 'Некорректное тело запроса');
    }

    const { phone, password, currentPassword } = parsed.data;

    if (session.user.id !== targetUserId) {
      throw new ForbiddenError('Изменять можно только свои данные');
    }

    // Под имперсонизацией учётные данные не трогаем.
    //
    // Смысл имперсонизации — увидеть площадку глазами пользователя, а не получить
    // его учётку: смена пароля из-под неё отняла бы у человека доступ, и по журналу
    // это выглядело бы как его собственное действие. Раньше запрет был только на
    // клиенте (плашка в кабинете) — то есть его не было вовсе. Админский путь смены
    // пароля остаётся своим маршрутом: `POST /api/admin/users/:id/password`.
    if (session.session.impersonatedUserId !== undefined) {
      throw new ForbiddenError('Под имперсонизацией нельзя менять учётные данные');
    }

    // Пользователь уже загружен guard'ом при разборе сессии — второй запрос за той
    // же строкой был бы лишней работой. Отсюда же берётся и текущий хеш пароля.
    const user = session.user;

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
    //
    // Текущая сессия известна из guard'а: он её уже разобрал и проверил. Читать
    // cookie второй раз (как делалось до 34.26) незачем — это был бы разбор той же
    // строки заново, да ещё и со своей веткой «а если сессии нет», недостижимой
    // на закрытом маршруте.
    if (password !== undefined) {
      await this.sessions.revokeOthers(targetUserId, session.session.id, new Date());
    }

    return stripPasswordHash(updated);
  }

  /**
   * Настройки уведомлений читает только их владелец.
   *
   * Раньше маршрут не проверял ничего: по номеру в адресе он отдавал настройки
   * любого пользователя кому угодно, включая гостя.
   */
  @Get(':id/notification-preferences')
  async readPreferences(
    @Param('id') rawId: string,
    @CurrentUser() session: SessionContext,
  ): Promise<{ notificationPreferences: Partial<Record<NotificationType, boolean>> }> {
    const targetId = parseUserId(rawId, 'Некорректный id');

    if (session.user.id !== targetId) {
      throw new ForbiddenError('Недостаточно прав для чтения чужих настроек');
    }

    // Тот же пользователь, что и в сессии, — он уже прочитан guard'ом.
    return { notificationPreferences: session.user.notificationPreferences ?? {} };
  }

  @Patch(':id/notification-preferences')
  async updatePreferences(
    @Param('id') rawId: string,
    @Body() rawBody: unknown,
    @CurrentUser() session: SessionContext,
  ): Promise<{ notificationPreferences: Partial<Record<NotificationType, boolean>> }> {
    const targetId = parseUserId(rawId, 'Некорректный id');
    const parsed = preferencesSchema.safeParse(rawBody);

    if (!parsed.success) {
      throw new ValidationError('Некорректные данные запроса');
    }

    if (session.user.id !== targetId) {
      throw new ForbiddenError('Недостаточно прав для редактирования чужих настроек');
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
