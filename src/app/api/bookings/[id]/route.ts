// API отмены записи: DELETE /api/bookings/[id] (Step 16.2 — hard-delete)
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { cancelBooking } from '@/lib/db';

const deleteBookingSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bookingId = Number(id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id записи' },
        { status: 400 },
      );
    }

    const rawBody = await request.json();
    const validationResult = deleteBookingSchema.safeParse(rawBody);

    if (!validationResult.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId } = validationResult.data;

    await cancelBooking({ bookingId, userId });

    return NextResponse.json({ success: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message === 'Запись не найдена') {
      return NextResponse.json({ success: false, error: message }, { status: 404 });
    }

    if (message === 'Недостаточно прав для отмены записи') {
      return NextResponse.json({ success: false, error: message }, { status: 403 });
    }

    console.error('Ошибка отмены записи:', error);

    return NextResponse.json(
      { success: false, error: 'Не удалось отменить запись' },
      { status: 500 },
    );
  }
}
