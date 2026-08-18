import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { getSchedule } from '@/lib/db';

const scheduleQuerySchema = z.object({
  ownerType: z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return undefined;
      }

      const normalizedValue = value.trim();
      return normalizedValue === '' ? undefined : normalizedValue;
    },
    z.enum(['club', 'trainer', 'all']).optional(),
  ),
  clubId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive().optional()),
  // Phase 25 Step 25.1b: параметр `affiliatedClubId` удалён из схемы вместе с
  // legacy полем `Schedule.affiliatedClubId`. Фильтр по клубу для тренерских слотов
  // теперь резолвится через offering.trainerClubLinkId / confirmed TrainerClubLink
  // в клиентских потребителях (home/catalog/detail), не на уровне этого endpoint'а.
  trainerId: z.preprocess((value) => {
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
  date: z.preprocess(
    (value) => {
      if (typeof value !== 'string') {
        return undefined;
      }

      const normalizedValue = value.trim();
      return normalizedValue === '' ? undefined : normalizedValue;
    },
    z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
  ),
});

export async function GET(request: NextRequest) {
  try {
    const validationResult = scheduleQuerySchema.safeParse({
      ownerType: request.nextUrl.searchParams.get('ownerType'),
      clubId: request.nextUrl.searchParams.get('clubId'),
      trainerId: request.nextUrl.searchParams.get('trainerId'),
      sportId: request.nextUrl.searchParams.get('sportId'),
      date: request.nextUrl.searchParams.get('date'),
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

    const { clubId, date, ownerType, sportId, trainerId } = validationResult.data;
    let schedule = await getSchedule({
      ownerType,
    });

    schedule = schedule.filter((slot) => slot.bookedCount < slot.capacity);

    if (clubId !== undefined) {
      schedule = schedule.filter((slot) => slot.clubId === clubId);
    }

    if (trainerId !== undefined) {
      schedule = schedule.filter((slot) => slot.trainerId === trainerId);
    }

    if (sportId !== undefined) {
      schedule = schedule.filter((slot) => slot.sportId === sportId);
    }

    if (date !== undefined) {
      schedule = schedule.filter((slot) => slot.date === date);
    }

    const scheduleWithAvailability = schedule
      .map((slot) => ({
        ...slot,
        availableSpots: slot.capacity - slot.bookedCount,
      }))
      .sort((left, right) => {
        const leftTimestamp = `${left.date}T${left.startTime}`;
        const rightTimestamp = `${right.date}T${right.startTime}`;

        return leftTimestamp.localeCompare(rightTimestamp);
      });

    return NextResponse.json({
      success: true,
      data: scheduleWithAvailability,
    });
  } catch (error) {
    console.error('Ошибка получения расписания:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить расписание',
      },
      { status: 500 },
    );
  }
}
