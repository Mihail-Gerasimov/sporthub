/**
 * Phase 29 Step 29.5: PATCH /api/users/[id] — самообслуживание учётных данных.
 *
 * Разрешает текущему юзеру обновить **свои** phone и password. Email и name
 * заморожены в Phase 29 (см. project-phases/phase-29.md «Ключевые решения»).
 *
 * Безопасность:
 * - body.userId должен совпадать с params.id — защита от смены чужих данных
 *   через DevTools при том же session-cookie. На MVP полноценной серверной
 *   проверки сессии нет, поэтому body — единственный источник identity.
 *   Отдельный admin-эндпоинт `/api/admin/users/[id]/password` использует
 *   собственный admin-guard (см. Step 29.7).
 * - Если меняется password, требуется currentPassword (plain compare с trim
 *   до миграции на bcrypt в Phase 30+).
 * - Phase 29 «Импер сонация и settings»: ЛК блокирует UI-формы при
 *   `isImpersonating === true` (см. AccountCredentialsSection). API сюда не
 *   попадает, потому что на клиенте submit отключен; дополнительный server-
 *   guard через session не реализуем в этой фазе.
 *
 * Возвращаемый user всегда без поля `password` (sanitize на ответе).
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserById, updateUser } from '@/lib/db';

// Тот же phone-regex, что используется в schemas/publish.ts — чтобы пользователь
// видел согласованную валидацию между publish-формой провайдера и settings.
const phoneRegex = /^\+7\s?\(?\d{3}\)?\s?\d{3}[-\s]?\d{2}[-\s]?\d{2}$/;

const patchSchema = z
  .object({
    userId: z.number().int().positive(),
    phone: z.string().trim().regex(phoneRegex, 'Некорректный формат телефона').optional(),
    password: z.string().min(6, 'Пароль — минимум 6 символов').optional(),
    currentPassword: z.string().optional(),
  })
  .refine((value) => value.phone !== undefined || value.password !== undefined, {
    message: 'Нечего обновлять',
  })
  .refine(
    (value) => value.password === undefined || (value.currentPassword?.trim().length ?? 0) > 0,
    {
      message: 'Для смены пароля нужен текущий пароль',
      path: ['currentPassword'],
    },
  );

type SafeUser = Omit<Awaited<ReturnType<typeof getUserById>>, 'password'>;

function sanitizeUser(user: NonNullable<Awaited<ReturnType<typeof getUserById>>>): SafeUser {
  // Возвращаем все поля кроме password — клиенту он не нужен.
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { password: _password, ...rest } = user;
  return rest;
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const targetUserId = Number(id);
    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id пользователя' },
        { status: 400 },
      );
    }

    const rawBody = (await request.json()) as unknown;
    const validation = patchSchema.safeParse(rawBody);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message ?? 'Некорректное тело запроса',
        },
        { status: 400 },
      );
    }

    const { userId, phone, password, currentPassword } = validation.data;

    // Self-only guard: пользователь меняет только себя.
    if (userId !== targetUserId) {
      return NextResponse.json(
        { success: false, error: 'Изменять можно только свои данные' },
        { status: 403 },
      );
    }

    const user = await getUserById(targetUserId);
    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    // Если меняется password — проверяем currentPassword (plain compare с trim).
    if (password !== undefined) {
      const stored = (user.password ?? '').trim();
      const provided = (currentPassword ?? '').trim();
      if (stored !== provided) {
        return NextResponse.json(
          { success: false, error: 'Неверный текущий пароль' },
          { status: 401 },
        );
      }
    }

    const patch: Partial<Pick<typeof user, 'phone' | 'password'>> = {};
    if (phone !== undefined) patch.phone = phone;
    if (password !== undefined) patch.password = password;

    const updated = await updateUser(targetUserId, patch);

    return NextResponse.json({
      success: true,
      data: sanitizeUser(updated),
    });
  } catch (error) {
    console.error('Ошибка обновления пользователя:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось обновить пользователя' },
      { status: 500 },
    );
  }
}
