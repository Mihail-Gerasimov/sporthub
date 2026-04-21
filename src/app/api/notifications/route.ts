// Phase 24 Step 24.5: GET /api/notifications — список уведомлений пользователя
// с фильтрами (userId обязателен, unreadOnly опционален) и пагинацией (offset/limit).
// Возвращает items + total (всего у пользователя) + unreadCount (для bell-icon).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getNotifications, getUnreadNotificationCount } from '@/lib/db';

// Валидация строковых параметров query; парсинг в числа/boolean — в коде ниже,
// чтобы избежать проблем preprocess+optional при null-значениях searchParams.get().
const querySchema = z.object({
  userId: z.string().regex(/^\d+$/),
  unreadOnly: z.string().optional(),
  offset: z.string().regex(/^\d+$/).optional(),
  limit: z.string().regex(/^\d+$/).optional(),
});

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validation = querySchema.safeParse({
      userId: searchParams.get('userId') ?? undefined,
      unreadOnly: searchParams.get('unreadOnly') ?? undefined,
      offset: searchParams.get('offset') ?? undefined,
      limit: searchParams.get('limit') ?? undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные параметры запроса' },
        { status: 400 },
      );
    }

    const userId = Number(validation.data.userId);
    const unreadOnly = validation.data.unreadOnly === 'true' || validation.data.unreadOnly === '1';
    const offset = validation.data.offset ? Number(validation.data.offset) : undefined;
    const limitRaw = validation.data.limit ? Number(validation.data.limit) : undefined;
    const limit = limitRaw !== undefined && limitRaw > 100 ? 100 : limitRaw;

    // Два параллельных запроса: страница items и агрегат unreadCount.
    // getUnreadNotificationCount не зависит от фильтров страницы — всегда по userId.
    const [items, allItems, unreadCount] = await Promise.all([
      getNotifications({ userId, unreadOnly, offset, limit }),
      // Для total нужно общее число без пагинации; используем отдельный вызов без limit.
      getNotifications({ userId, unreadOnly }),
      getUnreadNotificationCount(userId),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        items,
        total: allItems.length,
        unreadCount,
      },
    });
  } catch (error) {
    console.error('Ошибка получения уведомлений:', error);

    return NextResponse.json(
      { success: false, error: 'Не удалось получить уведомления' },
      { status: 500 },
    );
  }
}
