import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getClubById, getReviews, getSchedule, getSports, getTrainers } from '@/lib/db';

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

    const [reviews, schedule, sports, trainers] = await Promise.all([
      getReviews(),
      getSchedule(),
      getSports(),
      getTrainers(),
    ]);

    return NextResponse.json({
      success: true,
      data: {
        club,
        sports: sports.filter((sport) => club.sportIds.includes(sport.id)),
        trainers: trainers
          .filter((trainer) => trainer.clubId === clubId)
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
