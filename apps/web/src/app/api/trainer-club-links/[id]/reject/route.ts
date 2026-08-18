// Phase 24 Step 24.8 + Phase 27 Step 27.11: POST /api/trainer-club-links/[id]/reject —
// отклонение pending-связи. Guard симметричный по `link.initiatedBy`:
// - trainer-initiated → решение за manager'ом клуба (как и раньше);
// - club-initiated → решение за manager'ом тренера.
// Переход: pending → rejected. Уведомление уходит manager'у инициатора.
// payload.initiatedBy используется для dynamic-copy в notification-copy.ts.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isManagerOfClub, isManagerOfTrainer } from '@/lib/link-guards';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import {
  getClubById,
  getTrainerById,
  getTrainerClubLinkById,
  updateTrainerClubLink,
} from '@/lib/db';

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

    // Phase 27 Step 27.11: симметричный guard — отклоняет противоположная сторона
    // инициатора. trainer-initiated → isManagerOfClub; club-initiated → isManagerOfTrainer.
    const rejectorIsClub = link.initiatedBy === 'trainer';
    const isManager = rejectorIsClub
      ? await isManagerOfClub(link.clubId, userId)
      : await isManagerOfTrainer(link.trainerId, userId);
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

    // Phase 27 Step 27.11: уведомление инициатору. initiatedBy прокидывается в payload
    // для dynamic-copy в notification-copy.ts.
    const [trainer, club] = await Promise.all([
      getTrainerById(link.trainerId),
      getClubById(link.clubId),
    ]);
    const notifyUserId =
      link.initiatedBy === 'trainer' ? trainer?.managedByUserId : club?.managedByUserId;
    if (notifyUserId !== undefined) {
      await notify(notifyUserId, 'link_rejected', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        reason,
        initiatedBy: link.initiatedBy,
      });
    }

    logAction({
      action: 'link_reject',
      actorId: userId,
      actorRole: rejectorIsClub ? 'club_owner' : 'trainer',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: {
        trainerId: link.trainerId,
        clubId: link.clubId,
        reason,
        initiatedBy: link.initiatedBy,
      },
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
