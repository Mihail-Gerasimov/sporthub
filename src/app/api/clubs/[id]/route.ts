// API деталей и редактирования клуба: detail-context, PATCH update и каскадное удаление.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  appendCity,
  deleteClubPublication,
  getClubById,
  getOfferings,
  getReviews,
  getSchedule,
  getSports,
  getTrainerClubLinks,
  getTrainers,
  getUserById,
  updateClubPublication,
} from '@/lib/db';
import { mapClubFormToUpdateInput } from '@/lib/contracts/publish-club';
import { logAction } from '@/lib/logAction';
import { publishClubSchema } from '@/lib/schemas/publish';

const clubIdSchema = z.coerce.number().int().positive();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const validationResult = clubIdSchema.safeParse(id);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректный идентификатор клуба',
        },
        { status: 400 },
      );
    }

    const clubId = validationResult.data;
    const club = await getClubById(clubId);

    if (!club) {
      return NextResponse.json(
        {
          success: false,
          error: 'Клуб не найден',
        },
        { status: 404 },
      );
    }

    const [offerings, reviews, schedule, sports, trainers, confirmedLinks] = await Promise.all([
      getOfferings(),
      getReviews(),
      getSchedule(),
      getSports(),
      getTrainers(),
      getTrainerClubLinks({ clubId, status: 'confirmed' }),
    ]);
    const primaryOffering =
      offerings.find((offering) => offering.ownerType === 'club' && offering.ownerId === clubId) ??
      null;
    // Phase 24 Step 24.8: тренеры клуба — через confirmed TrainerClubLinks.
    // Fallback на legacy offering.affiliatedClubId оставляем до cleanup в Step 24.10.
    const clubTrainerIds = new Set<number>(confirmedLinks.map((link) => link.trainerId));
    offerings
      .filter(
        (offering) => offering.ownerType === 'trainer' && offering.affiliatedClubId === clubId,
      )
      .forEach((offering) => clubTrainerIds.add(offering.ownerId));

    return NextResponse.json({
      success: true,
      data: {
        club,
        primaryOffering,
        sports: sports.filter((sport) => club.sportIds.includes(sport.id)),
        trainers: trainers
          .filter((trainer) => clubTrainerIds.has(trainer.id))
          .sort((left, right) => right.rating - left.rating),
        schedule: schedule
          .filter((slot) => slot.clubId === clubId)
          .sort((left, right) => {
            const leftTimestamp = `${left.date}T${left.startTime}`;
            const rightTimestamp = `${right.date}T${right.startTime}`;

            return leftTimestamp.localeCompare(rightTimestamp);
          }),
        reviews: reviews
          .filter((review) => review.clubId === clubId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      },
    });
  } catch (error) {
    console.error('Ошибка получения деталей клуба:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить детали клуба',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idValidationResult = clubIdSchema.safeParse(id);

    if (!idValidationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректный идентификатор клуба' },
        { status: 400 },
      );
    }

    const rawBody = await request.json();
    const payloadValidationResult = publishClubSchema.safeParse(rawBody);

    if (!payloadValidationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные клуба',
          details: payloadValidationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const clubId = idValidationResult.data;
    const { userId, ...formData } = payloadValidationResult.data;
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    // Runtime-добавление нового города при редактировании
    if (formData.city && formData.cityCoordinates) {
      await appendCity({
        name: formData.city,
        coordinates: formData.cityCoordinates,
      });
    }

    const result = await updateClubPublication(mapClubFormToUpdateInput(formData, clubId, userId));

    // Логируем обновление клуба (fire-and-forget)
    logAction({
      action: 'publish_update',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: clubId,
      meta: { name: result.club.name },
    }).catch(() => {});

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Не удалось обновить клуб';
    const status = rawMessage.includes('Недостаточно прав')
      ? 403
      : rawMessage.includes('не найден')
        ? 404
        : 500;
    const message = status === 404 ? 'Клуб не найден' : rawMessage;

    console.error('Ошибка обновления клуба:', error);

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const validationResult = clubIdSchema.safeParse(id);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректный идентификатор клуба' },
        { status: 400 },
      );
    }

    const clubId = validationResult.data;

    // Fetch-before-delete: захватываем данные для лога до каскадного удаления
    const club = await getClubById(clubId);

    await deleteClubPublication(clubId);

    // Логируем удаление клуба (fire-and-forget)
    logAction({
      action: 'publish_delete',
      actorId: club?.managedByUserId ?? 0,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: clubId,
      meta: { name: club?.name ?? 'unknown' },
    }).catch(() => {});

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось удалить клуб';
    const status = message.includes('не найден') ? 404 : 500;

    console.error('Ошибка удаления клуба:', error);

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
