// Phase 24 Step 24.5: GET /api/notifications/unread-count — быстрый счётчик
// непрочитанных для bell-icon в Header'е (Step 24.7). Polling-endpoint: дешёвое
// чтение без пагинации.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getUnreadNotificationCount } from '@/lib/db';

const querySchema = z.object({
  userId: z.string().regex(/^\d+$/),
});

export async function GET(request: NextRequest) {
  try {
    const validation = querySchema.safeParse({
      userId: request.nextUrl.searchParams.get('userId') ?? undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные параметры запроса' },
        { status: 400 },
      );
    }

    const unreadCount = await getUnreadNotificationCount(Number(validation.data.userId));

    return NextResponse.json({ success: true, data: { unreadCount } });
  } catch (error) {
    console.error('Ошибка получения счётчика непрочитанных:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось получить счётчик' },
      { status: 500 },
    );
  }
}
