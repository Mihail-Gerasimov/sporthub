/**
 * Phase 29 Step 29.7: POST /api/admin/users/[id]/password —
 * admin сбрасывает пароль любому пользователю (например, по обращению
 * клиента «забыл пароль»). В отличие от self-service `/api/users/[id]`
 * (PATCH), здесь не требуется текущий пароль — это и есть «admin reset».
 *
 * Безопасность:
 * - Action-guard: только admin (`isAdminUser` по adminUserId из body).
 * - Действие фиксируется в `logs.json` через logAction → видно в админ-логах
 *   с actorId = администратор, entityId = user, action = 'admin_password_change'.
 * - Бизнес-логика — `db.updateUser({ password })`, та же что в Step 29.5.
 *   Пароль остаётся plain до Phase 30+ (bcrypt).
 *
 * MVP-нюанс: в Phase 29 нет server-side session-инвалидации, поэтому если
 * у затронутого пользователя есть открытая вкладка с активной сессией —
 * она продолжит работать. После logout зайти можно будет только новым
 * паролем. Документируем в feature-docs/auth.md.
 */
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdminUser } from '@/lib/booking-guards';
import { getUserById, updateUser } from '@/lib/db';
import { logAction } from '@/lib/logAction';

const postSchema = z
  .object({
    adminUserId: z.number().int().positive(),
    newPassword: z.string().min(6, 'Пароль — минимум 6 символов'),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const targetUserId = Number(id);

    if (!Number.isInteger(targetUserId) || targetUserId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id пользователя' },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const validation = postSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        {
          success: false,
          error: validation.error.issues[0]?.message ?? 'Некорректные данные запроса',
        },
        { status: 400 },
      );
    }

    const { adminUserId, newPassword } = validation.data;

    const isAdmin = await isAdminUser(adminUserId);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Действие доступно только администратору' },
        { status: 403 },
      );
    }

    const targetUser = await getUserById(targetUserId);
    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    await updateUser(targetUserId, { password: newPassword });

    // Audit log: фиксируем что admin сбросил пароль. Сам пароль в meta
    // НЕ сохраняем — оставляем только факт смены.
    await logAction({
      action: 'admin_password_change',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'user',
      entityId: targetUserId,
      meta: {},
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка смены пароля администратором:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось обновить пароль' },
      { status: 500 },
    );
  }
}
