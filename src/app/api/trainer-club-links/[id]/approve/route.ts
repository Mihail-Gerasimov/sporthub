// Phase 24 Step 24.8 + Phase 27 Step 27.11: POST /api/trainer-club-links/[id]/approve —
// подтверждение pending-связи. Guard симметричный по `link.initiatedBy`:
// - trainer-initiated pending → решение за manager'ом клуба (как и раньше);
// - club-initiated pending → решение за manager'ом тренера.
// Переход: pending → confirmed. Уведомление уходит manager'у инициатора
// (той стороны, что запускала запрос). payload.initiatedBy используется
// для dynamic-copy в notification-copy.ts.
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

    // Phase 27 Step 27.11: симметричный guard — подтверждает всегда «противоположная»
    // сторона инициатора. Для trainer-initiated это manager клуба (как раньше);
    // для club-initiated — manager тренера. Инициатор (автор pending) сам себя
    // approve не может.
    const approverIsClub = link.initiatedBy === 'trainer';
    const isManager = approverIsClub
      ? await isManagerOfClub(link.clubId, userId)
      : await isManagerOfTrainer(link.trainerId, userId);
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

    // Phase 27 Step 27.11: уведомление уходит manager'у инициатора (той стороне,
    // которая запускала запрос) — именно она ждёт ответа. Для dynamic-copy прокидываем
    // initiatedBy, чтобы notification-copy выбрал правильный текст:
    // - trainer-initiated → тренер-инициатор узнаёт: «Клуб подтвердил связь»;
    // - club-initiated → клуб-инициатор узнаёт: «Тренер принял приглашение».
    const [trainer, club] = await Promise.all([
      getTrainerById(link.trainerId),
      getClubById(link.clubId),
    ]);
    const notifyUserId =
      link.initiatedBy === 'trainer' ? trainer?.managedByUserId : club?.managedByUserId;
    if (notifyUserId !== undefined) {
      await notify(notifyUserId, 'link_approved', {
        linkId,
        trainerId: link.trainerId,
        clubId: link.clubId,
        initiatedBy: link.initiatedBy,
      });
    }

    logAction({
      action: 'link_approve',
      actorId: userId,
      actorRole: approverIsClub ? 'club_owner' : 'trainer',
      entityType: 'trainer_club_link',
      entityId: linkId,
      meta: { trainerId: link.trainerId, clubId: link.clubId, initiatedBy: link.initiatedBy },
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
