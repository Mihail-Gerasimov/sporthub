// Phase 24 Step 24.4: POST /api/bookings/[id]/confirm — провайдер подтверждает
// pending-заявку атлета. Тонкая обёртка над transitionBooking(to='confirmed').
// Guard: userId должен управлять parent-сущностью (клуб или тренер).
import { NextResponse } from 'next/server';
import { z } from 'zod';

import { getBookings, transitionBooking } from '@/lib/db';
import { isProviderOfBooking } from '@/lib/booking-guards';
import { logAction } from '@/lib/logAction';

const confirmSchema = z
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
    const validation = confirmSchema.safeParse(raw);

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

    // Guard провайдера: только владелец parent-сущности может подтвердить.
    const isOwner = await isProviderOfBooking(booking, userId);

    if (!isOwner) {
      return NextResponse.json(
        { success: false, error: 'Недостаточно прав для подтверждения записи' },
        { status: 403 },
      );
    }

    const updated = await transitionBooking({
      bookingId,
      to: 'confirmed',
      actor: 'provider',
      actorUserId: userId,
    });

    logAction({
      action: 'booking_confirm',
      actorId: userId,
      actorRole: 'club_owner',
      entityType: 'booking',
      entityId: bookingId,
      meta: { scheduleId: updated.scheduleId, athleteId: updated.userId },
    }).catch(() => {});

    return NextResponse.json({ success: true, data: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : '';

    if (message.startsWith('Недопустимый переход') || message.startsWith('Actor ')) {
      return NextResponse.json({ success: false, error: message }, { status: 409 });
    }

    console.error('Ошибка подтверждения записи:', error);
    return NextResponse.json(
      { success: false, error: 'Не удалось подтвердить запись' },
      { status: 500 },
    );
  }
}
