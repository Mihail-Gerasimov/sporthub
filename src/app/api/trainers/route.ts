import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getTrainers } from '@/lib/db';

const trainersQuerySchema = z.object({
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

    const { clubId, sportId } = validationResult.data;
    let trainers = await getTrainers();

    if (clubId !== undefined) {
      trainers = trainers.filter((trainer) => trainer.clubId === clubId);
    }

    if (sportId !== undefined) {
      trainers = trainers.filter((trainer) => trainer.sportId === sportId);
    }

    return NextResponse.json({
      success: true,
      data: trainers.sort((left, right) => right.rating - left.rating),
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
