// Phase 24 Step 24.5: POST /api/notifications/[id]/read — помечает одно
// уведомление прочитанным. Ownership-guard: notification.userId === body.userId.
// Вызывается из UI-клика по notification-item в dropdown или раздел notifications.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getNotifications, markNotificationRead } from '@/lib/db';

const readSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const notificationId = Number(id);

    if (!Number.isInteger(notificationId) || notificationId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id уведомления' },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const validation = readSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId } = validation.data;

    // Ownership-guard: проверяем, что уведомление адресовано этому userId.
    // Вычисляем через один общий getNotifications, чтобы не добавлять getNotificationById.
    const all = await getNotifications({ userId });
    const notification = all.find((candidate) => candidate.id === notificationId);

    if (!notification) {
      // Либо notification не существует, либо принадлежит другому user — отвечаем 404
      // (не раскрываем factum-existence чужого уведомления).
      return NextResponse.json(
        { success: false, error: 'Уведомление не найдено' },
        { status: 404 },
      );
    }

    const updated = await markNotificationRead(notificationId);

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'Уведомление не найдено') {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    console.error('Ошибка пометки уведомления прочитанным:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось пометить уведомление' },
      { status: 500 },
    );
  }
}
