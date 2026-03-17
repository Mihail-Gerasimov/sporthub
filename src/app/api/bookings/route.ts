import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import {
  createBooking,
  getBookings,
  getScheduleById,
  getUserById,
  incrementScheduleBookedCount,
} from '@/lib/db';

const bookingsQuerySchema = z.object({
  userId: z.preprocess((value) => {
    if (typeof value !== 'string' || value.trim() === '') {
      return undefined;
    }

    return Number(value);
  }, z.number().int().positive()),
});

const createBookingSchema = z.object({
  scheduleId: z.number().int().positive(),
  userId: z.number().int().positive(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

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

    const { date, scheduleId, userId } = validationResult.data;
    const [existingBookings, schedule, user] = await Promise.all([
      getBookings(),
      getScheduleById(scheduleId),
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

    if (!schedule) {
      return NextResponse.json(
        {
          success: false,
          error: 'Слот расписания не найден',
        },
        { status: 404 },
      );
    }

    if (schedule.date !== date) {
      return NextResponse.json(
        {
          success: false,
          error: 'Дата записи не совпадает с расписанием',
        },
        { status: 400 },
      );
    }

    const duplicateBooking = existingBookings.find(
      (booking) =>
        booking.userId === userId &&
        booking.scheduleId === scheduleId &&
        booking.status !== 'cancelled',
    );

    if (duplicateBooking) {
      return NextResponse.json(
        {
          success: false,
          error: 'Пользователь уже записан на это занятие',
        },
        { status: 409 },
      );
    }

    if (schedule.bookedCount >= schedule.capacity) {
      return NextResponse.json(
        {
          success: false,
          error: 'Свободных мест нет',
        },
        { status: 409 },
      );
    }

    const booking = await createBooking({
      scheduleId,
      userId,
      clubId: schedule.clubId,
      trainerId: schedule.trainerId,
      sportId: schedule.sportId,
      date,
      status: 'confirmed',
      paymentStatus: 'unpaid',
      totalPrice: schedule.price,
    });

    const updatedSchedule = await incrementScheduleBookedCount(scheduleId);

    if (!updatedSchedule) {
      return NextResponse.json(
        {
          success: false,
          error: 'Свободных мест нет',
        },
        { status: 409 },
      );
    }

    return NextResponse.json(
      {
        success: true,
        data: booking,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error('Ошибка создания записи:', error);

    return NextResponse.json(
      {
        success: false,
        error: 'Не удалось создать запись',
      },
      { status: 500 },
    );
  }
}
