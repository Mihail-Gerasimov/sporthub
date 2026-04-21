// Phase 24 Step 24.15: POST /api/admin/users/[id]/lift-quarantine —
// admin форсит снятие карантина атлета через установку User.quarantineLiftedAt=now.
// После этого isAthleteInQuarantine({quarantineLiftedAt}) возвращает inQuarantine=false,
// пока атлет не получит новый no_show после lift-момента.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdminUser } from '@/lib/booking-guards';
import { liftUserQuarantine } from '@/lib/db';
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

    const updated = await liftUserQuarantine(userId);

    await logAction({
      action: 'quarantine_admin_lift',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'user',
      entityId: userId,
      meta: { quarantineLiftedAt: updated.quarantineLiftedAt },
    });

    return NextResponse.json({
      success: true,
      data: { quarantineLiftedAt: updated.quarantineLiftedAt },
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'Пользователь не найден') {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    console.error('Ошибка снятия карантина админом:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось снять карантин' },
      { status: 500 },
    );
  }
}
