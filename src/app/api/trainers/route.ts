import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getTrainers } from '@/lib/db';

const trainersQuerySchema = z.object({
  affiliatedClubId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
  clubId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
  sportId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
});

export async function GET(request: NextRequest) {
  try {
    const validationResult = trainersQuerySchema.safeParse({
      affiliatedClubId: request.nextUrl.searchParams.get('affiliatedClubId'),
      clubId: request.nextUrl.searchParams.get('clubId'),
      sportId: request.nextUrl.searchParams.get('sportId'),
    });

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные параметры запроса',
        },
        { status: 400 },
      );
    }

    const { affiliatedClubId, clubId, sportId } = validationResult.data;
    const normalizedAffiliatedClubId = affiliatedClubId ?? clubId;
    let trainers = await getTrainers();

    if (normalizedAffiliatedClubId !== undefined) {
      trainers = trainers.filter((trainer) => trainer.affiliatedClubId === normalizedAffiliatedClubId);
    }

    if (sportId !== undefined) {
      trainers = trainers.filter((trainer) => trainer.sportIds.includes(sportId));
    }

    return NextResponse.json({
      success: true,
      data: trainers.sort((left, right) => {
        if (right.rating !== left.rating) {
          return right.rating - left.rating;
        }

        return right.reviewCount - left.reviewCount;
      }),
    });
  } catch (error) {
    console.error('Ошибка получения тренеров:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить список тренеров',
      },
      { status: 500 },
    );
  }
}
