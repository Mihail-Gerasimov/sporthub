// Phase 24 Step 24.15: POST /api/admin/trainer-club-links/[id]/force-revoke —
// admin-инициированный разрыв привязки тренер↔клуб. В отличие от публичного
// /api/trainer-club-links/[id]/revoke — не требует, чтобы admin был manager'ом
// одной из сторон; уведомляет обе стороны (тренера и клуб); revokedBy='admin'.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdminUser } from '@/lib/booking-guards';
import {
  detachOfferingsFromLink,
  getClubById,
  getTrainerById,
  getTrainerClubLinkById,
  updateTrainerClubLink,
} from '@/lib/db';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';

const bodySchema = z.object({ adminUserId: z.number().int().positive() }).strict();

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

    const { adminUserId } = validation.data;

    const isAdmin = await isAdminUser(adminUserId);
    if (!isAdmin) {
      return NextResponse.json(
        { success: false, error: 'Действие доступно только администратору' },
        { status: 403 },
      );
    }

    const link = await getTrainerClubLinkById(linkId);
    if (!link) {
      return NextResponse.json({ success: false, error: 'Связь не найдена' }, { status: 404 });
    }

    // Admin force-revoke имеет смысл только для pending/confirmed; уже завершённые — 409.
    if (link.status !== 'confirmed' && link.status !== 'pending') {
      return NextResponse.json(
        { success: false, error: 'Связь уже завершена (rejected/revoked)' },
        { status: 409 },
      );
    }

    const updated = await updateTrainerClubLink(linkId, {
      status: 'revoked',
      revokedAt: new Date().toISOString(),
      revokedByUserId: adminUserId,
      revokedBy: 'admin',
    });

    const detachedCount = await detachOfferingsFromLink(linkId);

    // Обе стороны уведомляются о forced revoke (в отличие от публичного revoke,
    // где уведомляется только "другая" сторона).
    const [trainer, club] = await Promise.all([
      getTrainerById(link.trainerId),
      getClubById(link.clubId),
    ]);

    if (trainer?.managedByUserId !== undefined) {
      await notify(trainer.managedByUserId, 'link_revoked', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        revokedBy: 'admin',
      });
    }
    if (club?.managedByUserId !== undefined) {
      await notify(club.managedByUserId, 'link_revoked', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        revokedBy: 'admin',
      });
    }

    await logAction({
      action: 'link_revoke',
      actorId: adminUserId,
      actorRole: 'admin',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: {
        trainerId: link.trainerId,
        clubId: link.clubId,
        revokedBy: 'admin',
        detachedCount,
        forced: true,
      },
    });

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    console.error('Ошибка admin force-revoke link:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось разорвать связь' },
      { status: 500 },
    );
  }
}
