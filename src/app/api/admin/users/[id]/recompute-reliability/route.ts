// Phase 24 Step 24.15: POST /api/admin/users/[id]/recompute-reliability —
// admin-рычаг для будущей инвалидации кэша рейтинга надёжности. На MVP сам
// расчёт живёт client-side (computeAthleteReliability), поэтому endpoint — no-op,
// только логирует reliability_recompute. Существует как точка приложения для
// кэш-слоя, который появится в Phase 25+.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdminUser } from '@/lib/booking-guards';
import { getUserById } from '@/lib/db';
import { logAction } from '@/lib/logAction';

const postSchema = z
  .object({
    adminUserId: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const userId = Number(id);

    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id пользователя' },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const validation = postSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { adminUserId } = validation.data;

    const isAdmin = await isAdminUser(adminUserId);

    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Действие доступно только администратору' },
        { status: 403 },
      );
    }

    const targetUser = await getUserById(userId);

    if (!targetUser) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    await logAction({
      action: 'reliability_recompute',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'user',
      entityId: userId,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Ошибка recompute-reliability:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось пересчитать рейтинг' },
      { status: 500 },
    );
  }
}
