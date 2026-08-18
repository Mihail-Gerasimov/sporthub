// Phase 24 Step 24.5: GET /api/notifications — список уведомлений пользователя
// с фильтрами (userId обязателен, unreadOnly опционален) и пагинацией (offset/limit).
// Возвращает items + total (всего у пользователя) + unreadCount (для bell-icon).
// Phase 27 Step 27.2: фильтр notificationPreferences перенесён в db-функции через
// applyPreferences: true — согласованность dropdown/страницы/badge.
// Phase 29 Step 29.3: DELETE /api/notifications — массовое hard-удаление по
// списку id. Owner-guard через silent filter (удаляются только свои). Один
// endpoint обслуживает оба сценария UI: per-item (массив из 1 id) и bulk.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { deleteNotifications, getNotifications, getUnreadNotificationCount } from '@/lib/db';

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

    // Phase 27 Step 27.2: применение preferences — через applyPreferences в db-функциях.
    // Это единая точка фильтра, согласующая items/total/unreadCount с остальными поверхностями.
    const [items, allItems, unreadCount] = await Promise.all([
      getNotifications({ userId, unreadOnly, offset, limit, applyPreferences: true }),
      getNotifications({ userId, unreadOnly, applyPreferences: true }),
      getUnreadNotificationCount(userId, true),
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

// Phase 29 Step 29.3: DELETE /api/notifications — массовое физическое удаление.
// Body: { userId, ids[] }. Сервер silent-filter'ом оставляет только id,
// принадлежащие userId — чужие тихо игнорируются (не возвращаем 403, чтобы
// не открывать enumeration). Возвращает { deleted } — реальное число удалённых.
const deleteBodySchema = z.object({
  userId: z.number().int().positive(),
  ids: z.array(z.number().int().positive()).min(1),
});

export async function DELETE(request: NextRequest) {
  try {
    const rawBody = (await request.json()) as unknown;
    const validation = deleteBodySchema.safeParse(rawBody);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректное тело запроса' },
        { status: 400 },
      );
    }

    const { userId, ids } = validation.data;

    // Ownership-guard: фильтруем переданные id, оставляем только принадлежащие
    // userId. Чужие/несуществующие id silent-skip — пользователь увидит только
    // фактическое число удалённых записей в `deleted` ответа.
    const ownNotifications = await getNotifications({ userId });
    const ownIdSet = new Set(ownNotifications.map((notification) => notification.id));
    const filteredIds = ids.filter((id) => ownIdSet.has(id));

    const result = await deleteNotifications(filteredIds);

    return NextResponse.json({
      success: true,
      data: { deleted: result.deleted },
    });
  } catch (error) {
    console.error('Ошибка удаления уведомлений:', error);

    return NextResponse.json(
      { success: false, error: 'Не удалось удалить уведомления' },
      { status: 500 },
    );
  }
}
