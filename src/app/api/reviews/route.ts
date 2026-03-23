import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createReview, getClubById, getReviews, getTrainerById, getUserById } from '@/lib/db';

function hasExactlyOneReviewTarget(input: { clubId?: number; trainerId?: number }): boolean {
  return (input.clubId === undefined) !== (input.trainerId === undefined);
}

const reviewsQuerySchema = z.object({
  clubId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
  trainerId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
});

const createReviewSchema = z.object({
  userId: z.number().int().positive(),
  clubId: z.number().int().positive().optional(),
  trainerId: z.number().int().positive().optional(),
  rating: z.number().int().min(1).max(5),
  text: z.string().trim().min(1),
});

export async function GET(request: NextRequest) {
  try {
    const validationResult = reviewsQuerySchema.safeParse({
      clubId: request.nextUrl.searchParams.get('clubId'),
      trainerId: request.nextUrl.searchParams.get('trainerId'),
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

    const { clubId, trainerId } = validationResult.data;

    if (
      !hasExactlyOneReviewTarget({ clubId, trainerId }) &&
      !(clubId === undefined && trainerId === undefined)
    ) {
      return NextResponse.json(
        {
          success: false,
          error: 'Нужно указать либо clubId, либо trainerId',
        },
        { status: 400 },
      );
    }

    let reviews = await getReviews();

    if (clubId !== undefined) {
      reviews = reviews.filter((review) => review.clubId === clubId);
    }

    if (trainerId !== undefined) {
      reviews = reviews.filter((review) => review.trainerId === trainerId);
    }

    return NextResponse.json({
      success: true,
      data: reviews.sort((left, right) => right.createdAt.localeCompare(left.createdAt)),
    });
  } catch (error) {
    console.error('Ошибка получения отзывов:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить отзывы',
      },
      { status: 500 },
    );
  }
}

export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = createReviewSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные отзыва',
        },
        { status: 400 },
      );
    }

    const { clubId, rating, text, trainerId, userId } = validationResult.data;

    if (clubId === undefined && trainerId === undefined) {
      return NextResponse.json(
        {
          success: false,
          error: 'Нужно указать clubId или trainerId',
        },
        { status: 400 },
      );
    }

    if (!hasExactlyOneReviewTarget({ clubId, trainerId })) {
      return NextResponse.json(
        {
          success: false,
          error: 'Нужно указать либо clubId, либо trainerId',
        },
        { status: 400 },
      );
    }

    const [club, trainer, user] = await Promise.all([
      clubId === undefined ? Promise.resolve(null) : getClubById(clubId),
      trainerId === undefined ? Promise.resolve(null) : getTrainerById(trainerId),
      getUserById(userId),
    ]);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Пользователь не найден',
        },
        { status: 404 },
      );
    }

    if (clubId !== undefined && !club) {
      return NextResponse.json(
        {
          success: false,
          error: 'Клуб не найден',
        },
        { status: 404 },
      );
    }

    if (trainerId !== undefined && !trainer) {
      return NextResponse.json(
        {
          success: false,
          error: 'Тренер не найден',
        },
        { status: 404 },
      );
    }

    const review = await createReview({
      userId,
      clubId,
      trainerId,
      rating,
      text,
    });

    return NextResponse.json(
      {
        success: true,
        data: review,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка создания отзыва:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось создать отзыв',
      },
      { status: 500 },
    );
  }
}
