import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { appendCity, createClubPublication, getClubs, getUserById } from '@/lib/db';
import { mapClubFormToEntities } from '@/lib/contracts/publish-club';
import { logAction } from '@/lib/logAction';
import { publishClubSchema } from '@/lib/schemas/publish';

const clubsQuerySchema = z.object({
  sportId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
  search: z.preprocess((value) => {
    if (typeof value !== 'string') {
      return undefined;
    }

    const normalizedValue = value.trim();
    return normalizedValue === '' ? undefined : normalizedValue;
  }, z.string().min(1).optional()),
  minRating: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().min(0).max(5).optional()),
});

export async function GET(request: NextRequest) {
  try {
    const validationResult = clubsQuerySchema.safeParse({
      sportId: request.nextUrl.searchParams.get('sportId'),
      search: request.nextUrl.searchParams.get('search'),
      minRating: request.nextUrl.searchParams.get('minRating'),
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

    const { minRating, search, sportId } = validationResult.data;
    let clubs = await getClubs();

    // Скрытые публикации не показываем в публичном каталоге
    clubs = clubs.filter((club) => club.status !== 'hidden');

    if (sportId !== undefined) {
      clubs = clubs.filter((club) => club.sportIds.includes(sportId));
    }

    if (search !== undefined) {
      const normalizedSearch = search.toLowerCase();

      clubs = clubs.filter((club) => {
        const searchIndex = [
          club.name,
          club.shortDescription,
          club.description,
          club.address,
          ...club.tags,
        ]
          .join(' ')
          .toLowerCase();

        return searchIndex.includes(normalizedSearch);
      });
    }

    if (minRating !== undefined) {
      clubs = clubs.filter((club) => club.rating >= minRating);
    }

    return NextResponse.json({
      success: true,
      data: clubs,
    });
  } catch (error) {
    console.error('Ошибка получения клубов:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить список клубов',
      },
      { status: 500 },
    );
  }
}

/** POST /api/clubs — создание клуба через publish-модалку провайдера */
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = publishClubSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные клуба',
          details: validationResult.error.flatten().fieldErrors,
        },
        { status: 400 },
      );
    }

    const { userId, ...formData } = validationResult.data;

    // Проверяем что пользователь существует
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
    const entities = mapClubFormToEntities(formData, userId);

    // Атомарно создаём в JSON через db.ts
    const result = await createClubPublication(entities);

    // Логируем создание клуба (fire-and-forget)
    logAction({
      action: 'publish_create',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'club',
      entityId: result.club.id,
      meta: { name: result.club.name, city: result.club.city },
    }).catch(() => {});

    return NextResponse.json(
      {
        success: true,
        data: result,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка создания клуба:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось создать клуб',
      },
      { status: 500 },
    );
  }
}
