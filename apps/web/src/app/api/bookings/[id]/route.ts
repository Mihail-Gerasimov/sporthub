// API отмены записи: DELETE /api/bookings/[id].
// Phase 24 (Step 24.3): soft-cancel через FSM — booking остаётся в bookings.json
// со status='cancelled_by_athlete' и заполненным cancelReason (on_time/late по
// snapshot-policy). Hard-delete доступен только админу через DELETE /api/admin/bookings/[id]
// (Step 24.4).
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { isAdminUser } from '@/lib/booking-guards';
import { cancelBooking, getBookings } from '@/lib/db';
import { logAction } from '@/lib/logAction';

const deleteBookingSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

/**
 * Phase 25 Step 25.15: GET /api/bookings/[id] — admin-only чтение полного booking'а
 * (включая statusHistory) для drawer-wire-up в LogsPage. userId передаётся через query
 * ?userId=, т.к. GET не имеет body. Проверяем admin-guard.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bookingId = Number(id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id записи' },
        { status: 400 },
      );
    }

    const rawUserId = request.nextUrl.searchParams.get('userId');
    const userId = rawUserId ? Number(rawUserId) : NaN;
    if (!Number.isInteger(userId) || userId <= 0) {
      return NextResponse.json({ success: false, error: 'Некорректный userId' }, { status: 400 });
    }

    const isAdmin = await isAdminUser(userId);
    if (!isAdmin) {
      return NextResponse.json({ success: false, error: 'Недостаточно прав' }, { status: 403 });
    }

    const bookings = await getBookings();
    const booking = bookings.find((b) => b.id === bookingId) ?? null;
    if (!booking) {
      return NextResponse.json({ success: false, error: 'Запись не найдена' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data: booking });
  } catch (error) {
    console.error('Ошибка чтения записи:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось получить запись' },
      { status: 500 },
    );
  }
}

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

    // Phase 24: soft-cancel — фиксируем actor и полученный cancelReason (on_time/late
    // вычисляется в transitionBooking по snapshot-policy).
    logAction({
      action: 'booking_cancel',
      actorId: userId,
      actorRole: 'athlete',
      entityType: 'booking',
      entityId: bookingId,
      meta: { actor: 'athlete', source: 'public_delete' },
    }).catch(() => {});

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
