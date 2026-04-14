import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createTrainerPublication, getOfferings, getTrainers, getUserById } from '@/lib/db';
import { mapTrainerFormToEntities } from '@/lib/contracts/publish-trainer';
import { logAction } from '@/lib/logAction';
import { publishTrainerSchema } from '@/lib/schemas/publish';

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

    // Скрытые публикации не показываем в публичном каталоге
    trainers = trainers.filter((trainer) => trainer.status !== 'hidden');

    if (normalizedAffiliatedClubId !== undefined) {
      const offerings = await getOfferings();
      const trainerIds = new Set(
        offerings
          .filter(
            (offering) =>
              offering.ownerType === 'trainer' &&
              offering.affiliatedClubId === normalizedAffiliatedClubId,
          )
          .map((offering) => offering.ownerId),
      );
      trainers = trainers.filter((trainer) => trainerIds.has(trainer.id));
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

/** POST /api/trainers — создание тренера через publish-модалку провайдера */
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = publishTrainerSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные тренера',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { userId, ...formData } = validationResult.data;

    const user = await getUserById(userId);

    if (!user) {
      return NextResponse.json(
        {
          success: false,
          error: 'Пользователь не найден',
        },
        { status: 404 },
      );
    }

    // Маппим форму → сущности через контракт
    const entities = mapTrainerFormToEntities(formData, userId);

    // Атомарно создаём в JSON через db.ts
    const result = await createTrainerPublication(entities);

    // Логируем создание тренера (fire-and-forget)
    logAction({
      action: 'publish_create',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'trainer',
      entityId: result.trainer.id,
      meta: { name: result.trainer.name, city: result.trainer.city },
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка создания тренера:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось создать тренера',
      },
      { status: 500 },
    );
  }
}
