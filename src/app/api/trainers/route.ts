import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  appendCity,
  createTrainerPublication,
  getBookings,
  getTrainerClubLinks,
  getTrainers,
  getUserById,
} from '@/lib/db';
import { mapTrainerFormToEntities } from '@/lib/contracts/publish-trainer';
import { logAction } from '@/lib/logAction';
import { computeTrainerReliability } from '@/lib/reliability';
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
  // Phase 25 Step 25.13: публичная симметрия reliability. Когда sort=reliability —
  // сортируем по completionRate из computeTrainerReliability. excludeDanger скрывает
  // тренеров с badge='danger' (серые публикации).
  sort: z.enum(['reliability']).optional(),
  dir: z.enum(['asc', 'desc']).optional(),
  excludeDanger: z
    .preprocess((value) => value === 'true' || value === true, z.boolean())
    .optional(),
});

export async function GET(request: NextRequest) {
  try {
    const validationResult = trainersQuerySchema.safeParse({
      affiliatedClubId: request.nextUrl.searchParams.get('affiliatedClubId'),
      clubId: request.nextUrl.searchParams.get('clubId'),
      sportId: request.nextUrl.searchParams.get('sportId'),
      sort: request.nextUrl.searchParams.get('sort') ?? undefined,
      dir: request.nextUrl.searchParams.get('dir') ?? undefined,
      excludeDanger: request.nextUrl.searchParams.get('excludeDanger') ?? undefined,
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

    const { affiliatedClubId, clubId, sportId, sort, dir, excludeDanger } = validationResult.data;
    const normalizedAffiliatedClubId = affiliatedClubId ?? clubId;
    let trainers = await getTrainers();

    // Скрытые публикации не показываем в публичном каталоге
    trainers = trainers.filter((trainer) => trainer.status !== 'hidden');

    if (normalizedAffiliatedClubId !== undefined) {
      // Phase 24 Step 24.8 / Phase 25 Step 25.1b: фильтр «тренеры клуба» только через
      // confirmed TrainerClubLink. Legacy fallback `offering.affiliatedClubId` удалён.
      const confirmedLinks = await getTrainerClubLinks({
        clubId: normalizedAffiliatedClubId,
        status: 'confirmed',
      });
      const trainerIds = new Set<number>(confirmedLinks.map((link) => link.trainerId));
      trainers = trainers.filter((trainer) => trainerIds.has(trainer.id));
    }

    if (sportId !== undefined) {
      trainers = trainers.filter((trainer) => trainer.sportIds.includes(sportId));
    }

    // Phase 25 Step 25.13: reliability-фильтр и сортировка. Загружаем bookings
    // только когда хотя бы один из этих параметров задан — иначе избегаем лишнего
    // чтения коллекции.
    if (sort === 'reliability' || excludeDanger === true) {
      const bookings = await getBookings();
      const reliabilityByTrainerId = new Map(
        trainers.map((trainer) => [trainer.id, computeTrainerReliability(bookings, trainer.id)]),
      );

      if (excludeDanger === true) {
        trainers = trainers.filter(
          (trainer) => reliabilityByTrainerId.get(trainer.id)?.badge !== 'danger',
        );
      }

      if (sort === 'reliability') {
        trainers = trainers.slice().sort((left, right) => {
          const leftRate = reliabilityByTrainerId.get(left.id)?.completionRate ?? 0;
          const rightRate = reliabilityByTrainerId.get(right.id)?.completionRate ?? 0;
          if (rightRate !== leftRate) {
            // desc: чем больше rate — тем выше; asc — наоборот.
            return dir === 'asc' ? leftRate - rightRate : rightRate - leftRate;
          }
          return right.rating - left.rating;
        });

        return NextResponse.json({ success: true, data: trainers });
      }
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

    // Runtime-добавление нового города (дедупликация в appendCity)
    if (formData.city && formData.cityCoordinates) {
      await appendCity({
        name: formData.city,
        coordinates: formData.cityCoordinates,
      });
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
