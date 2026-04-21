// Phase 24 Step 24.5: POST /api/notifications/read-all — помечает все
// непрочитанные уведомления пользователя прочитанными. Вызывается из UI-кнопки
// "Отметить всё как прочитанное" в разделе /profile/*/notifications.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { markAllNotificationsRead } from '@/lib/db';

const readAllSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const validation = readAllSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId } = validation.data;
    const updatedCount = await markAllNotificationsRead(userId);

    return NextResponse.json({ success: true, data: { updatedCount } });
  } catch (error) {
    console.error('Ошибка массовой пометки уведомлений:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось пометить уведомления' },
      { status: 500 },
    );
  }
}
