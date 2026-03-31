// API деталей и редактирования тренера: detail-context, PATCH update и каскадное удаление.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import {
  deleteTrainerPublication,
  getClubById,
  getReviews,
  getSchedule,
  getSports,
  getTrainerById,
  getTrainerOfferings,
  getUserById,
  updateTrainerPublication,
} from '@/lib/db';
import { mapTrainerFormToUpdateInput } from '@/lib/contracts/publish-trainer';
import { publishTrainerSchema } from '@/lib/schemas/publish';
import { getTrainerPrimarySportId } from '@/lib/utils';

const trainerIdSchema = z.coerce.number().int().positive();

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const validationResult = trainerIdSchema.safeParse(id);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректный идентификатор тренера',
        },
        { status: 400 },
      );
    }

    const trainerId = validationResult.data;
    const trainer = await getTrainerById(trainerId);

    if (!trainer) {
      return NextResponse.json(
        {
          success: false,
          error: 'Тренер не найден',
        },
        { status: 404 },
      );
    }

    const primarySportId = getTrainerPrimarySportId(trainer);
    const [offerings, reviews, schedule, sports] = await Promise.all([
      getTrainerOfferings(trainerId),
      getReviews(),
      getSchedule({ ownerType: 'trainer' }),
      getSports(),
    ]);
    const venueClubId = offerings.find(
      (offering) => offering.affiliatedClubId !== undefined,
    )?.affiliatedClubId;
    const affiliatedClub = venueClubId === undefined ? null : await getClubById(venueClubId);

    const trainerSports = sports.filter((item) => trainer.sportIds.includes(item.id));
    const primarySport =
      primarySportId === null
        ? null
        : (trainerSports.find((item) => item.id === primarySportId) ?? null);

    return NextResponse.json({
      success: true,
      data: {
        trainer,
        affiliatedClub,
        club: affiliatedClub,
        primaryOffering: offerings[0] ?? null,
        offerings: offerings.sort((left, right) => left.price - right.price),
        primarySport,
        sport: primarySport,
        sports: trainerSports,
        schedule: schedule
          .filter((slot) => slot.trainerId === trainerId)
          .sort((left, right) => {
            const leftTimestamp = `${left.date}T${left.startTime}`;
            const rightTimestamp = `${right.date}T${right.startTime}`;

            return leftTimestamp.localeCompare(rightTimestamp);
          }),
        reviews: reviews
          .filter((review) => review.trainerId === trainerId)
          .sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
      },
    });
  } catch (error) {
    console.error('Ошибка получения деталей тренера:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить детали тренера',
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const idValidationResult = trainerIdSchema.safeParse(id);

    if (!idValidationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректный идентификатор тренера' },
        { status: 400 },
      );
    }

    const rawBody = await request.json();
    const payloadValidationResult = publishTrainerSchema.safeParse(rawBody);

    if (!payloadValidationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные тренера',
          details: payloadValidationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const trainerId = idValidationResult.data;
    const { userId, ...formData } = payloadValidationResult.data;
    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        { success: false, error: 'Пользователь не найден' },
        { status: 404 },
      );
    }

    const result = await updateTrainerPublication(
      mapTrainerFormToUpdateInput(formData, trainerId, userId),
    );

    return NextResponse.json({
      success: true,
      data: result,
    });
  } catch (error) {
    const rawMessage = error instanceof Error ? error.message : 'Не удалось обновить тренера';
    const status = rawMessage.includes('Недостаточно прав')
      ? 403
      : rawMessage.includes('не найден')
        ? 404
        : 500;
    const message = status === 404 ? 'Тренер не найден' : rawMessage;

    console.error('Ошибка обновления тренера:', error);

    return NextResponse.json({ success: false, error: message }, { status });
  }
}

export async function DELETE(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const validationResult = trainerIdSchema.safeParse(id);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректный идентификатор тренера' },
        { status: 400 },
      );
    }

    const trainerId = validationResult.data;

    await deleteTrainerPublication(trainerId);

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось удалить тренера';
    const status = message.includes('не найден') ? 404 : 500;

    console.error('Ошибка удаления тренера:', error);

    return NextResponse.json({ success: false, error: message }, { status });
  }
}
