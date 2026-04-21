// Phase 24 Step 24.8: POST /api/trainer-club-links — тренер создаёт запрос на
// связь с клубом (status='pending'). GET — чтение с фильтрами для inbox провайдера,
// профиля тренера и публичных поверхностей.
// Guard POST: userId должен быть manager'ом указанного trainerId.
// Для каждого (trainerId, clubId) одновременно не может быть более одной активной
// (pending|confirmed) связи — дубликат возвращает 409.
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isManagerOfTrainer } from '@/lib/link-guards';
import { logAction } from '@/lib/logAction';
import { notify } from '@/lib/notify';
import { createTrainerClubLink, getClubById, getTrainerById, getTrainerClubLinks } from '@/lib/db';
import type { TrainerClubLinkStatus } from '@/types';

const createSchema = z
  .object({
    trainerId: z.number().int().positive(),
    clubId: z.number().int().positive(),
    userId: z.number().int().positive(),
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

    const { trainerId, clubId, userId } = validation.data;

    const [trainer, club] = await Promise.all([getTrainerById(trainerId), getClubById(clubId)]);

    if (!trainer) {
      return NextResponse.json({ success: false, error: 'Тренер не найден' }, { status: 404 });
    }
    if (!club) {
      return NextResponse.json({ success: false, error: 'Клуб не найден' }, { status: 404 });
    }

    // Запрос инициирует тренер → userId должен быть manager'ом trainerId.
    const isManager = await isManagerOfTrainer(trainerId, userId);
    if (!isManager) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для отправки запроса' },
        { status: 403 },
      );
    }

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
      initiatedBy: 'trainer',
    });

    // Уведомляем manager'а клуба о новом запросе (если он есть).
    if (club.managedByUserId !== undefined) {
      await notify(club.managedByUserId, 'link_requested', {
        linkId: link.id,
        trainerId,
        clubId,
      });
    }

    logAction({
      action: 'link_request',
      actorId: userId,
      actorRole: 'trainer',
      entityType: 'trainer_club_link',
      entityId: link.id,
      meta: { trainerId, clubId },
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
