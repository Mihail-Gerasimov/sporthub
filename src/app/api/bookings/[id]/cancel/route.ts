// Phase 24 Step 24.4: POST /api/bookings/[id]/cancel — универсальная отмена
// активной записи (pending/confirmed). actor определяется по userId: атлет-владелец
// booking.userId → 'cancelled_by_athlete' + cancelReason (on_time/late по snapshot).
// Провайдер parent-сущности → 'cancelled_by_provider'.
// Публичный DELETE /api/bookings/[id] остаётся для совместимости (тот же soft-cancel).
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getBookings, transitionBooking } from '@/lib/db';
import { isProviderOfBooking } from '@/lib/booking-guards';
import { logAction } from '@/lib/logAction';

const cancelSchema = z
  .object({
    userId: z.number().int().positive(),
  })
  .strict();

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params;
    const bookingId = Number(id);

    if (!Number.isInteger(bookingId) || bookingId <= 0) {
      return NextResponse.json(
        { success: false, error: 'Некорректный id записи' },
        { status: 400 },
      );
    }

    const raw = await request.json();
    const validation = cancelSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId } = validation.data;

    const bookings = await getBookings();
    const booking = bookings.find((candidate) => candidate.id === bookingId);

    if (!booking) {
      return NextResponse.json({ success: false, error: 'Запись не найдена' }, { status: 404 });
    }

    // Определяем actor по userId: атлет-владелец либо провайдер parent-сущности.
    const isAthlete = booking.userId === userId;
    const isProvider = !isAthlete && (await isProviderOfBooking(booking, userId));

    if (!isAthlete && !isProvider) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для отмены записи' },
        { status: 403 },
      );
    }

    const target = isAthlete ? 'cancelled_by_athlete' : 'cancelled_by_provider';
    const actor = isAthlete ? 'athlete' : 'provider';

    const updated = await transitionBooking({
      bookingId,
      to: target,
      actor,
      actorUserId: userId,
    });

    logAction({
      action: 'booking_cancel',
      actorId: userId,
      actorRole: isAthlete ? 'athlete' : 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: {
        scheduleId: updated.scheduleId,
        actor,
        cancelReason: updated.cancelReason,
      },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message.startsWith('Недопустимый переход') || message.startsWith('Actor ')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    console.error('Ошибка отмены записи:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось отменить запись' },
      { status: 500 },
    );
  }
}
