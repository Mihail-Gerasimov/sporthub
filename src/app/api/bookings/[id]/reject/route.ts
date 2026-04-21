// Phase 24 Step 24.4: POST /api/bookings/[id]/reject — провайдер отклоняет
// pending-заявку атлета. Тонкая обёртка над transitionBooking(to='rejected_by_provider').
// Guard: userId должен управлять parent-сущностью. Reason сохраняется в statusHistory.
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getBookings, transitionBooking } from '@/lib/db';
import { isProviderOfBooking } from '@/lib/booking-guards';
import { logAction } from '@/lib/logAction';

const rejectSchema = z
  .object({
    userId: z.number().int().positive(),
    reason: z.string().trim().min(1).optional(),
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
    const validation = rejectSchema.safeParse(raw);

    if (!validation.success) {
      return NextResponse.json(
        { success: false, error: 'Некорректные данные запроса' },
        { status: 400 },
      );
    }

    const { userId, reason } = validation.data;

    const bookings = await getBookings();
    const booking = bookings.find((candidate) => candidate.id === bookingId);

    if (!booking) {
      return NextResponse.json({ success: false, error: 'Запись не найдена' }, { status: 404 });
    }

    const isOwner = await isProviderOfBooking(booking, userId);

    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для отклонения записи' },
        { status: 403 },
      );
    }

    const updated = await transitionBooking({
      bookingId,
      to: 'rejected_by_provider',
      actor: 'provider',
      actorUserId: userId,
      reason,
    });

    logAction({
      action: 'booking_reject',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: { scheduleId: updated.scheduleId, athleteId: updated.userId, reason },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message.startsWith('Недопустимый переход') || message.startsWith('Actor ')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    console.error('Ошибка отклонения записи:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось отклонить запись' },
      { status: 500 },
    );
  }
}
