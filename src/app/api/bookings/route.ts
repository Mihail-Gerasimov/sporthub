// API записей: получение и создание booking (Step 16.2 — atomic flow)
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { createBookingAtomic, getBookings, getUserById } from '@/lib/db';

const bookingsQuerySchema = z.object({
  userId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive()),
});

const createBookingSchema = z
  .object({
    scheduleId: z.number().int().positive(),
    userId: z.number().int().positive(),
  })
  .strict();

export async function GET(request: NextRequest) {
  try {
    const validationResult = bookingsQuerySchema.safeParse({
      userId: request.nextUrl.searchParams.get('userId'),
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

    const bookings = await getBookings();
    const userBookings = bookings
      .filter((booking) => booking.userId === validationResult.data.userId)
      .sort((left, right) => {
        const leftTimestamp = `${left.date}T${left.createdAt}`;
        const rightTimestamp = `${right.date}T${right.createdAt}`;

        return leftTimestamp.localeCompare(rightTimestamp);
      });

    return NextResponse.json({
      success: true,
      data: userBookings,
    });
  } catch (error) {
    console.error('Ошибка получения записей:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось получить записи пользователя',
      },
      { status: 500 },
    );
  }
}

// MVP: запись сразу confirmed. pending зарезервирован для будущего payment-flow.
export async function POST(request: Request) {
  try {
    const rawBody = await request.json();
    const validationResult = createBookingSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        {
          success: false,
          error: 'Некорректные данные записи',
        },
        { status: 400 },
      );
    }

    const { scheduleId, userId } = validationResult.data;

    // Проверяем пользователя и роль до atomic-записи
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

    if (user.role !== 'athlete') {
      return NextResponse.json(
        {
          success: false,
          error: 'Запись доступна только спортсмену',
        },
        { status: 403 },
      );
    }

    const booking = await createBookingAtomic({ scheduleId, userId });

    return NextResponse.json(
      {
        success: true,
        data: booking,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка создания записи:', error);

    // Маппинг бизнес-ошибок из db.ts на HTTP-коды
    const message = error instanceof Error ? error.message : '';

    if (message === 'Слот расписания не найден') {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    if (message === 'Пользователь уже записан на это занятие') {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    if (message === 'Свободных мест нет') {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось создать запись',
      },
      { status: 500 },
    );
  }
}
