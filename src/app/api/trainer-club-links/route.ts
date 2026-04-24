// Phase 24 Step 24.8 + Phase 27 Step 27.9: POST /api/trainer-club-links — создаёт
// pending-связь между тренером и клубом. Инициировать может любая сторона:
// либо manager тренера (trainer-side request), либо manager клуба (club-side invite).
// GET — чтение с фильтрами для inbox провайдера, профиля тренера и публичных поверхностей.
// Guard POST: userId должен быть manager'ом одной из сторон. Для каждой пары
// (trainerId, clubId) одновременно не может быть более одной активной
// (pending|confirmed) связи — дубликат возвращает 409.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isManagerOfClub, isManagerOfTrainer } from '@/lib/link-guards';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import { createTrainerClubLink, getClubById, getTrainerById, getTrainerClubLinks } from '@/lib/db';
import type { TrainerClubLinkStatus } from '@/types';

const createSchema = z
  .object({
    trainerId: z.number().int().positive(),
    clubId: z.number().int().positive(),
    userId: z.number().int().positive(),
    // Phase 27 Step 27.9: поле опциональное — обратная совместимость со старыми
    // клиентами, которые ещё не передают initiatedBy. Если не пришло — вычисляется
    // на сервере из ролей userId (см. fallback ниже).
    initiatedBy: z.enum(['trainer', 'club']).optional(),
  })
  .strict();

const listQuerySchema = z.object({
  trainerId: z.string().regex(/^\d+$/).optional(),
  clubId: z.string().regex(/^\d+$/).optional(),
  status: z.enum(['pending', 'confirmed', 'rejected', 'revoked']).optional(),
});

export async function POST(request: Request) {
  try {
    const raw = await request.json();
    const validation = createSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { trainerId, clubId, userId, initiatedBy: initiatedByBody } = validation.data;

    const [trainer, club] = await Promise.all([getTrainerById(trainerId), getClubById(clubId)]);

    if (!trainer) {
      return NextResponse.json({ success: false, error: 'Тренер не найден' }, { status: 404 });
    }
    if (!club) {
      return NextResponse.json({ success: false, error: 'Клуб не найден' }, { status: 404 });
    }

    // Phase 27 Step 27.9: guard пропускает manager'а любой из сторон. Раньше был
    // только `isManagerOfTrainer` → club-side invite возвращал 403 (см. E2E-отчёт
    // trainer-club-links 2026-04-25, S1 step-5).
    const [isTrainerManager, isClubManager] = await Promise.all([
      isManagerOfTrainer(trainerId, userId),
      isManagerOfClub(clubId, userId),
    ]);
    if (!isTrainerManager && !isClubManager) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для отправки запроса' },
        { status: 403 },
      );
    }

    // Направление инициирования. Если клиент передал — верим (UI знает, из какой
    // модалки пришёл вызов). Если не передал — вычисляем по ролям:
    // - только club-manager → 'club';
    // - только trainer-manager или dual-role → 'trainer' (обратная совместимость
    //   со старыми тестами и fixture-сценариями).
    const initiatedBy =
      initiatedByBody ?? (isClubManager && !isTrainerManager ? 'club' : 'trainer');

    // Проверка: нет ли уже активной связи (pending | confirmed) между этой парой.
    const existing = await getTrainerClubLinks({ trainerId, clubId });
    const hasActive = existing.some(
      (link) => link.status === 'pending' || link.status === 'confirmed',
    );
    if (hasActive) {
      return NextResponse.json(
        { success: false, error: 'Для этой пары уже существует активная связь' },
        { status: 409 },
      );
    }

    const link = await createTrainerClubLink({
      trainerId,
      clubId,
      status: 'pending',
      initiatedBy,
    });

    // Phase 27 Step 27.9: уведомление уходит противоположной стороне инициатора.
    // Club-initiated → шлём manager'у тренера; trainer-initiated → manager'у клуба.
    // Без этого club-owner получал бы link_requested о собственном приглашении.
    const notifyUserId = initiatedBy === 'club' ? trainer.managedByUserId : club.managedByUserId;
    if (notifyUserId !== undefined) {
      await notify(notifyUserId, 'link_requested', {
        linkId: link.id,
        trainerId,
        clubId,
        initiatedBy,
      });
    }

    logAction({
      action: 'link_request',
      actorId: userId,
      actorRole: initiatedBy === 'club' ? 'club_owner' : 'trainer',
      entityType: 'trainer_club_link',
      entityId: link.id,
      meta: { trainerId, clubId, initiatedBy },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: link }, { status: 201 });
  } catch (error) {
    console.error('Ошибка создания trainer-club-link:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось создать запрос' },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const validation = listQuerySchema.safeParse({
      trainerId: searchParams.get('trainerId') ?? undefined,
      clubId: searchParams.get('clubId') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    });

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные параметры запроса' },
        { status: 400 },
      );
    }

    const { trainerId, clubId, status } = validation.data;

    const links = await getTrainerClubLinks({
      trainerId: trainerId ? Number(trainerId) : undefined,
      clubId: clubId ? Number(clubId) : undefined,
      status: status as TrainerClubLinkStatus | undefined,
    });

    return NextResponse.json({ success: true, data: links });
  } catch (error) {
    console.error('Ошибка чтения trainer-club-links:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось получить связи' },
      { status: 500 },
    );
  }
}
