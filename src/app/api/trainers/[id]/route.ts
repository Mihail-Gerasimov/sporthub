import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getClubById, getReviews, getSchedule, getSports, getTrainerById } from '@/lib/db';
import { getTrainerAffiliatedClubId, getTrainerPrimarySportId } from '@/lib/utils';

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

    const affiliatedClubId = getTrainerAffiliatedClubId(trainer);
    const primarySportId = getTrainerPrimarySportId(trainer);
    const [club, reviews, schedule, sports] = await Promise.all([
      affiliatedClubId === null ? Promise.resolve(null) : getClubById(affiliatedClubId),
      getReviews(),
      getSchedule(),
      getSports(),
    ]);

    const sport = primarySportId === null ? null : sports.find((item) => item.id === primarySportId) ?? null;

    return NextResponse.json({
      success: true,
      data: {
        trainer,
        club,
        sport,
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
