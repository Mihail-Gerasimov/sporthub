// Phase 24 Step 24.8: POST /api/trainer-club-links/[id]/revoke — разрыв
// подтверждённой связи любой из сторон (manager тренера или manager клуба) либо
// admin-пользователем. Guard: user управляет одной из сторон или является admin'ом.
// Переход: confirmed → revoked. Проставляем revokedAt/revokedByUserId/revokedBy.
// Уведомляем другую сторону (manager'а, который не инициировал revoke).
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdminUser } from '@/lib/booking-guards';
import { isManagerOfClub, isManagerOfTrainer } from '@/lib/link-guards';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import {
  detachOfferingsFromLink,
  getClubById,
  getTrainerById,
  getTrainerClubLinkById,
  updateTrainerClubLink,
} from '@/lib/db';
import type { TrainerClubLink } from '@/types';

const bodySchema = z.object({ userId: z.number().int().positive() }).strict();

type RevokedBy = NonNullable<TrainerClubLink['revokedBy']>;

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const linkId = Number(id);

    if (!Number.isInteger(linkId) || linkId <= 0) {
      return NextResponse.json({ success: false, error: 'Некорректный id связи' }, { status: 400 });
    }

    const raw = await request.json();
    const validation = bodySchema.safeParse(raw);
    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId } = validation.data;

    const link = await getTrainerClubLinkById(linkId);
    if (!link) {
      return NextResponse.json({ success: false, error: 'Связь не найдена' }, { status: 404 });
    }

    // Phase 24 Step 24.9a: revoke допускает оба состояния — `pending` (тренер отзывает
    // ещё не одобренный запрос) и `confirmed` (любая сторона или admin разрывает связь).
    if (link.status !== 'confirmed' && link.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Связь уже завершена (rejected/revoked)' },
        { status: 409 },
      );
    }

    // Определяем, какую сторону представляет user: тренера, клуб, админа или никого.
    // Приоритет при совпадении: trainer (чаще всего тренер сам разрывает).
    const [isAdmin, isTrainerManager, isClubManager] = await Promise.all([
      isAdminUser(userId),
      isManagerOfTrainer(link.trainerId, userId),
      isManagerOfClub(link.clubId, userId),
    ]);

    let revokedBy: RevokedBy;
    if (isTrainerManager) {
      revokedBy = 'trainer';
    } else if (isClubManager) {
      revokedBy = 'club';
    } else if (isAdmin) {
      revokedBy = 'admin';
    } else {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для разрыва связи' },
        { status: 403 },
      );
    }

    const updated = await updateTrainerClubLink(linkId, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedByUserId: userId,
      revokedBy,
    });

    // Phase 24 Step 24.10d: все offerings тренера, привязанные к этому link'у,
    // переходят в приватные (поле trainerClubLinkId сбрасывается). Публичные
    // поверхности перестают показывать клуб рядом с такими услугами.
    const detachedCount = await detachOfferingsFromLink(linkId);

    // Уведомляем противоположную сторону (не инициатора revoke).
    const [trainer, club] = await Promise.all([
      getTrainerById(link.trainerId),
      getClubById(link.clubId),
    ]);

    if (revokedBy !== 'trainer' && trainer?.managedByUserId !== undefined) {
      await notify(trainer.managedByUserId, 'link_revoked', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        revokedBy,
      });
    }
    if (revokedBy !== 'club' && club?.managedByUserId !== undefined) {
      await notify(club.managedByUserId, 'link_revoked', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        revokedBy,
      });
    }

    logAction({
      action: 'link_revoke',
      actorId: userId,
      actorRole: revokedBy === 'admin' ? 'admin' : 'club_owner',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId, revokedBy, detachedCount },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка revoke trainer-club-link:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось разорвать связь' },
      { status: 500 },
    );
  }
}
