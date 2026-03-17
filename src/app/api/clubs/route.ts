import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getClubs } from '@/lib/db';

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
