// Phase 24 Step 24.8: POST /api/trainer-club-links/[id]/approve — клуб
// подтверждает pending-запрос тренера. Guard: userId — manager клуба этого link'а.
// Переход: pending → confirmed. Проставляем approvedAt/approvedByUserId.
// Уведомляем manager'а тренера через notify('link_approved').
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isManagerOfClub } from '@/lib/link-guards';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import { getTrainerById, getTrainerClubLinkById, updateTrainerClubLink } from '@/lib/db';

const bodySchema = z.object({ userId: z.number().int().positive() }).strict();

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

    const isManager = await isManagerOfClub(link.clubId, userId);
    if (!isManager) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для подтверждения связи' },
        { status: 403 },
      );
    }

    if (link.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Связь не в состоянии pending' },
        { status: 409 },
      );
    }

    const updated = await updateTrainerClubLink(linkId, {
      status: 'confirmed',
      approvedAt: new Date().toISOString(),
      approvedByUserId: userId,
    });

    // Уведомляем manager'а тренера, если известен.
    const trainer = await getTrainerById(link.trainerId);
    if (trainer?.managedByUserId !== undefined) {
      await notify(trainer.managedByUserId, 'link_approved', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
      });
    }

    logAction({
      action: 'link_approve',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка approve trainer-club-link:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось подтвердить связь' },
      { status: 500 },
    );
  }
}
