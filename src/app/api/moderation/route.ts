/**
 * POST /api/moderation — скрыть или показать публикацию (клуб/тренер).
 * Только для администратора (role === 'admin').
 */
import { NextResponse } from 'next/server';

import { getUserById, hideEntity, unhideEntity } from '@/lib/db';
import { logAction } from '@/lib/logAction';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const { action, entityType, entityId, moderatorId, reason } = body;

    // Валидация входных данных
    if (!action || !['hide', 'unhide'].includes(action)) {
      return NextResponse.json(
        { success: false, error: 'Некорректное действие. Ожидается hide или unhide' },
        { status: 400 },
      );
    }

    if (!entityType || !['club', 'trainer'].includes(entityType)) {
      return NextResponse.json(
        { success: false, error: 'Некорректный тип сущности' },
        { status: 400 },
      );
    }

    if (!entityId || typeof entityId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Некорректный entityId' },
        { status: 400 },
      );
    }

    if (!moderatorId || typeof moderatorId !== 'number') {
      return NextResponse.json(
        { success: false, error: 'Некорректный moderatorId' },
        { status: 400 },
      );
    }

    if (action === 'hide' && (!reason || typeof reason !== 'string' || !reason.trim())) {
      return NextResponse.json(
        { success: false, error: 'Причина скрытия обязательна' },
        { status: 400 },
      );
    }

    // Проверка что модератор — админ
    const moderator = await getUserById(moderatorId);
    if (!moderator || moderator.role !== 'admin') {
      return NextResponse.json(
        { success: false, error: 'Только администратор может модерировать публикации' },
        { status: 403 },
      );
    }

    if (action === 'hide') {
      const entity = await hideEntity(entityType, entityId, reason.trim(), moderatorId);

      logAction({
        action: 'moderation_hide',
        actorId: moderatorId,
        actorRole: 'admin',
        entityType,
        entityId,
        meta: { name: entity.name, reason: reason.trim() },
      }).catch(() => {});

      return NextResponse.json({ success: true, data: entity });
    }

    // unhide
    const entity = await unhideEntity(entityType, entityId);

    logAction({
      action: 'moderation_unhide',
      actorId: moderatorId,
      actorRole: 'admin',
      entityType,
      entityId,
      meta: { name: entity.name },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: entity });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Ошибка модерации';
    const status = message.includes('не найден') ? 404 : 500;
    return NextResponse.json({ success: false, error: message }, { status });
  }
}
