// Phase 24 Step 24.8: POST /api/trainer-club-links/[id]/reject — клуб отклоняет
// pending-запрос тренера. Guard: userId — manager клуба. pending → rejected.
// Проставляем rejectedAt/rejectedByUserId/rejectionReason. Уведомляем manager'а тренера.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isManagerOfClub } from '@/lib/link-guards';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import { getTrainerById, getTrainerClubLinkById, updateTrainerClubLink } from '@/lib/db';

const bodySchema = z
  .object({
    userId: z.number().int().positive(),
    reason: z.string().trim().max(500).optional(),
  })
  .strict();

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

    const { userId, reason } = validation.data;

    const link = await getTrainerClubLinkById(linkId);
    if (!link) {
      return NextResponse.json({ success: false, error: 'Связь не найдена' }, { status: 404 });
    }

    const isManager = await isManagerOfClub(link.clubId, userId);
    if (!isManager) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для отказа' },
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
      status: 'rejected',
      rejectedAt: new Date().toISOString(),
      rejectedByUserId: userId,
      rejectionReason: reason,
    });

    const trainer = await getTrainerById(link.trainerId);
    if (trainer?.managedByUserId !== undefined) {
      await notify(trainer.managedByUserId, 'link_rejected', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        reason,
      });
    }

    logAction({
      action: 'link_reject',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId, reason },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка reject trainer-club-link:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось отклонить связь' },
      { status: 500 },
    );
  }
}
