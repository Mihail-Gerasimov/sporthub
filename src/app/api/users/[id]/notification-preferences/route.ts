// Phase 25 Step 25.14: PATCH /api/users/[id]/notification-preferences — редактирование
// per-тип preferences пользователя. Ownership guard: body.userId должен совпадать с [id]
// (или быть админом — MVP опускает admin-кейс). Required-типы сервер отсекает на уровне db.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getUserById, setUserNotificationPreferences } from '@/lib/db';
import type { NotificationType } from '@/types';

const patchSchema = z
  .object({
    userId: z.number().int().positive(),
    // Принимаем произвольный map string→boolean. Валидация конкретных NotificationType
    // и отсечение REQUIRED-ключей — в db.setUserNotificationPreferences.
    preferences: z.record(z.string(), z.boolean()),
  })
  .strict();

type RouteContext = { params: Promise<{ id: string }> };

/**
 * GET /api/users/[id]/notification-preferences — чтение текущих preferences.
 * Phase 26 hotfix: нужен UserNotificationPreferencesEditor'у, чтобы после refresh
 * страницы отображать актуальное состояние галочек. Без этого компонент
 * инициализировался дефолтами (всё включено) — снятая галочка возвращалась на место.
 */
export async function GET(_request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const targetId = Number(rawId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json({ success: false, error: 'Некорректный id' }, { status: 400 });
    }

    const target = await getUserById(targetId);
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      data: { notificationPreferences: target.notificationPreferences ?? {} },
    });
  } catch (error) {
    console.error('Ошибка чтения notification-preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось прочитать настройки уведомлений' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, context: RouteContext) {
  try {
    const { id: rawId } = await context.params;
    const targetId = Number(rawId);
    if (!Number.isInteger(targetId) || targetId <= 0) {
      return NextResponse.json({ success: false, error: 'Некорректный id' }, { status: 400 });
    }

    const raw = await request.json();
    const validation = patchSchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId, preferences } = validation.data;

    if (userId !== targetId) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для редактирования чужих настроек' },
        { status: 403 },
      );
    }

    const target = await getUserById(targetId);
    if (!target) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    const updated = await setUserNotificationPreferences(
      targetId,
      preferences as Partial<Record<NotificationType, boolean>>,
    );

    return NextResponse.json({
      success: true,
      data: { notificationPreferences: updated.notificationPreferences ?? {} },
    });
  } catch (error) {
    console.error('Ошибка обновления notification-preferences:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось обновить настройки уведомлений' },
      { status: 500 },
    );
  }
}
